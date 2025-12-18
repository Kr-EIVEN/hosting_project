# front/coProject-main/flaskbackend/pl_cause.py

import os
import re
import glob
import math
from typing import Dict, List, Tuple, Optional

import pandas as pd


# -------------------------------------------------
#  ✅ report_data 폴더 스캔 (통합 파일 기준)
#  - "25년_11월_결산보고서_통합.xlsx" (tag 없음)도 허용
#  - "25년_10월_결산보고서_통합_특정유통경로이상.xlsx" (tag 있음)도 허용
# -------------------------------------------------
HERE = os.path.dirname(os.path.abspath(__file__))
REPORT_DIR = os.path.join(HERE, "report_data")

FILENAME_RE = re.compile(
    r"(?P<yy>\d{2})년_(?P<mm>\d{2})월_결산보고서_통합(?:_(?P<tag>.+))?\.xlsx$"
)


def _parse_report_files():
    """
    report_data 폴더에서 통합 파일들을 찾아 메타 리스트 반환.
    """
    pattern = os.path.join(REPORT_DIR, "*결산보고서_통합*.xlsx")
    paths = glob.glob(pattern)

    meta_list = []
    for p in paths:
        base = os.path.basename(p)
        m = FILENAME_RE.match(base)
        if not m:
            continue

        yy = int(m.group("yy"))
        mm = int(m.group("mm"))
        year = 2000 + yy
        month = mm
        ym = year * 100 + month
        tag = (m.group("tag") or "").strip()

        meta_list.append(
            {
                "path": p,
                "file": base,
                "yy": yy,
                "mm": mm,
                "year": year,
                "month": month,
                "ym": ym,
                "tag": tag,
                "label": f"{year}년 {month:02d}월",
            }
        )

    meta_list.sort(key=lambda x: x["ym"])
    return meta_list


def list_available_periods():
    """
    프론트 드롭다운용 연/월 목록.
    """
    meta_list = _parse_report_files()
    periods = []
    for m in meta_list:
        periods.append(
            {
                "ym": m["ym"],
                "year": m["year"],
                "month": m["month"],
                "tag": m["tag"],  # 없으면 ""
                "file": m["file"],
            }
        )
    periods.sort(key=lambda x: x["ym"])
    return periods


# -------------------------------------------------
#  ✅ 통합 파일 로드
#  - 기본적으로 1번 시트 또는 '결산보고서' 유사 시트를 읽음
#  - 필수 컬럼: "번호", "항목", "전체"
# -------------------------------------------------
def _read_report_df(path: str) -> pd.DataFrame:
    xls = pd.ExcelFile(path)
    # 우선순위: 결산보고서 / 통합 / report 같은 이름
    preferred = None
    for s in xls.sheet_names:
        if re.search(r"결산|통합|report|pl", s, re.IGNORECASE):
            preferred = s
            break
    sheet = preferred or xls.sheet_names[0]

    df = pd.read_excel(path, sheet_name=sheet)

    # 컬럼 표준화
    # (사용자 파일이 "실제 비용" 같은 이름이면 여기서 "전체"로 맞춰주고 싶지만,
    #  현재 통합본은 "전체"를 쓰는 전제로 유지)
    need = {"항목"}
    if not need.issubset(set(df.columns)):
        raise ValueError(f"통합 파일 시트({sheet})에서 '항목' 컬럼을 찾을 수 없습니다.")

    if "전체" not in df.columns:
        # 혹시 "실제 비용" 이라는 이름이면 대응
        if "실제 비용" in df.columns:
            df = df.rename(columns={"실제 비용": "전체"})
        else:
            raise ValueError(f"통합 파일 시트({sheet})에서 '전체' 또는 '실제 비용' 컬럼을 찾을 수 없습니다.")

    if "번호" not in df.columns:
        df["번호"] = None

    # 숫자화
    df["전체"] = pd.to_numeric(df["전체"], errors="coerce").fillna(0.0)

    # 문자열 정리
    df["항목"] = df["항목"].astype(str)

    return df[["번호", "항목", "전체"]].copy()


# -------------------------------------------------
#  ✅ 계층(들여쓰기) 트리 구성
#  - 항목 앞 공백 개수로 depth 계산
#  - "표시명"은 strip() 한 값
# -------------------------------------------------
def _build_tree(df: pd.DataFrame) -> List[dict]:
    nodes = []
    stack = []  # (depth, index)

    for i, row in df.iterrows():
        raw = str(row["항목"])
        # 앞 공백 depth
        leading = len(raw) - len(raw.lstrip(" "))
        depth = leading

        name = raw.strip()
        node = {
            "idx": len(nodes),
            "row_idx": i,
            "번호": row["번호"],
            "raw": raw,
            "name": name,
            "depth": depth,
            "parent": None,
            "children": [],
            "value": float(row["전체"]),
        }

        while stack and stack[-1][0] >= depth:
            stack.pop()

        if stack:
            parent_idx = stack[-1][1]
            node["parent"] = parent_idx
            nodes[parent_idx]["children"].append(node["idx"])

        nodes.append(node)
        stack.append((depth, node["idx"]))

    return nodes


def _find_node_index(nodes: List[dict], target_name: str) -> Optional[int]:
    # depth가 가장 얕은(루트에 가까운) 항목 우선
    candidates = [n for n in nodes if n["name"] == target_name]
    if not candidates:
        return None
    candidates.sort(key=lambda x: (x["depth"], x["idx"]))
    return candidates[0]["idx"]


def _collect_descendants(nodes: List[dict], root_idx: int) -> List[int]:
    out = []
    stack = [root_idx]
    while stack:
        cur = stack.pop()
        for ch in nodes[cur]["children"]:
            out.append(ch)
            stack.append(ch)
    return out


# -------------------------------------------------
#  ✅ KPI 추출 (루트 항목 기준)
# -------------------------------------------------
def _get_value_by_name(df: pd.DataFrame, name: str) -> float:
    row = df[df["항목"].astype(str).str.strip() == name]
    if row.empty:
        return 0.0
    return float(row["전체"].iloc[0])


def _kpi_pack(df: pd.DataFrame) -> Dict[str, float]:
    # 사용자가 말한 구조 기준
    sales = _get_value_by_name(df, "매출액")
    cogs = _get_value_by_name(df, "매출원가계")
    gross_profit = _get_value_by_name(df, "매출총이익")
    sga = _get_value_by_name(df, "판매비와일반관리비")
    op_income = _get_value_by_name(df, "영업이익")
    nonop_rev = _get_value_by_name(df, "영업외수익")
    nonop_exp = _get_value_by_name(df, "영업외비용")
    pre_tax = _get_value_by_name(df, "법인세차감전순이익")
    tax = _get_value_by_name(df, "법인세비용")
    net_income = _get_value_by_name(df, "당기순이익")

    nonop_profit = nonop_rev - nonop_exp

    return {
        "매출액": sales,
        "매출원가계": cogs,
        "매출총이익": gross_profit,
        "판매비와일반관리비": sga,
        "영업이익": op_income,
        "영업외수익": nonop_rev,
        "영업외비용": nonop_exp,
        "영업외손익": nonop_profit,
        "법인세차감전순이익": pre_tax,
        "법인세비용": tax,
        "당기순이익": net_income,
    }


def _make_kpi_cards(cur: Dict[str, float], prev: Dict[str, float]) -> List[dict]:
    names = ["매출액", "매출원가계", "매출총이익", "판매비와일반관리비", "영업이익", "당기순이익"]
    cards = []
    for n in names:
        c = float(cur.get(n, 0.0))
        p = float(prev.get(n, 0.0))
        diff = c - p
        rate = (diff / p * 100.0) if p != 0 else (0.0 if diff == 0 else 100.0)
        cards.append(
            {
                "name": n,
                "prev": p,
                "cur": c,
                "diff": diff,
                "rate": rate,
            }
        )
    return cards


# -------------------------------------------------
#  ✅ KPI 요인 분해(드라이버) + 드릴다운
#  - KPI별로 "구성요소" 기여도를 계산
#  - 구성요소 클릭 시 → 해당 항목의 하위 항목 Top N 제공
# -------------------------------------------------
def _driver_block(
    kpi_name: str,
    cur: Dict[str, float],
    prev: Dict[str, float],
    components: List[Tuple[str, float]],  # (component_name, sign) sign=+1/-1 for KPI impact
):
    """
    KPI 변화(diff)를 구성요소 변화로 분해:
      contribution = sign * (component_cur - component_prev)
    """
    rows = []
    total_contrib = 0.0
    for comp_name, sign in components:
        c = float(cur.get(comp_name, 0.0))
        p = float(prev.get(comp_name, 0.0))
        d = c - p
        contrib = sign * d
        total_contrib += contrib
        rows.append(
            {
                "component": comp_name,
                "sign": sign,
                "prev": p,
                "cur": c,
                "diff": d,
                "contrib": contrib,
            }
        )

    # KPI 자체 변화
    kpi_diff = float(cur.get(kpi_name, 0.0)) - float(prev.get(kpi_name, 0.0))

    return {
        "kpi": kpi_name,
        "kpi_prev": float(prev.get(kpi_name, 0.0)),
        "kpi_cur": float(cur.get(kpi_name, 0.0)),
        "kpi_diff": kpi_diff,
        "components": rows,
        "recon_gap": kpi_diff - total_contrib,  # 공식/데이터 차이(있으면 표시)
    }


def _subtree_top_changes(
    df_cur: pd.DataFrame,
    df_prev: pd.DataFrame,
    root_name: str,
    top_n: int = 8,
) -> List[dict]:
    """
    root_name 하위 항목들(트리 기준)의 전월 대비 변화 Top N
    """
    # 트리 구성(현재/전월 모두 같은 항목 구조라고 가정)
    nodes_cur = _build_tree(df_cur)
    nodes_prev = _build_tree(df_prev)

    root_idx = _find_node_index(nodes_cur, root_name)
    if root_idx is None:
        return []

    desc = _collect_descendants(nodes_cur, root_idx)
    if not desc:
        return []

    # name 기준으로 매칭해서 diff 계산
    cur_map = {}
    prev_map = {}

    for idx in desc:
        nm = nodes_cur[idx]["name"]
        cur_map[nm] = cur_map.get(nm, 0.0) + float(nodes_cur[idx]["value"])

    # prev는 동일 subtree의 name들만 비교
    for n in nodes_prev:
        nm = n["name"]
        if nm in cur_map:
            prev_map[nm] = prev_map.get(nm, 0.0) + float(n["value"])

    rows = []
    for nm, c in cur_map.items():
        p = float(prev_map.get(nm, 0.0))
        d = float(c) - p
        if d == 0:
            continue
        rate = (d / p * 100.0) if p != 0 else (0.0 if d == 0 else 100.0)
        rows.append({"name": nm, "prev": p, "cur": float(c), "diff": d, "rate": rate})

    rows.sort(key=lambda x: abs(x["diff"]), reverse=True)
    return rows[:top_n]


def analyze_pl_cause(target_ym: int) -> dict:
    meta_list = _parse_report_files()
    meta_map = {m["ym"]: m for m in meta_list}

    if target_ym not in meta_map:
        raise ValueError(f"요청한 기간({target_ym})의 통합 파일을 찾을 수 없습니다.")

    # 전월 찾기(파일이 있는 전월)
    idx = [m["ym"] for m in meta_list].index(target_ym)
    if idx <= 0:
        raise ValueError("전월 데이터가 존재하지 않아 전월 대비 분석을 할 수 없습니다.")
    prev_ym = meta_list[idx - 1]["ym"]

    cur_meta = meta_map[target_ym]
    prev_meta = meta_map[prev_ym]

    df_cur = _read_report_df(cur_meta["path"])
    df_prev = _read_report_df(prev_meta["path"])

    cur_kpi = _kpi_pack(df_cur)
    prev_kpi = _kpi_pack(df_prev)

    kpi_cards = _make_kpi_cards(cur_kpi, prev_kpi)

    # ✅ KPI별 “공식 기반” 드라이버 분석
    drivers = {}

    # 매출총이익 = 매출액 - 매출원가계
    drivers["매출총이익"] = _driver_block(
        "매출총이익",
        cur_kpi,
        prev_kpi,
        components=[("매출액", +1.0), ("매출원가계", -1.0)],
    )

    # 영업이익 = 매출액 - 매출원가계 - 판매비와일반관리비
    drivers["영업이익"] = _driver_block(
        "영업이익",
        cur_kpi,
        prev_kpi,
        components=[("매출액", +1.0), ("매출원가계", -1.0), ("판매비와일반관리비", -1.0)],
    )

    # 당기순이익 = 영업이익 + (영업외수익 - 영업외비용) - 법인세비용
    # 여기선 영업외손익을 별도 KPI로 만든 뒤 사용
    drivers["당기순이익"] = _driver_block(
        "당기순이익",
        cur_kpi,
        prev_kpi,
        components=[("영업이익", +1.0), ("영업외손익", +1.0), ("법인세비용", -1.0)],
    )

    # ✅ 드릴다운 후보(구성요소별 subtree Top)
    drilldowns = {
        "매출액": _subtree_top_changes(df_cur, df_prev, "매출액", top_n=10),
        "매출원가계": _subtree_top_changes(df_cur, df_prev, "매출원가계", top_n=10),
        "판매비와일반관리비": _subtree_top_changes(df_cur, df_prev, "판매비와일반관리비", top_n=10),
        "영업외수익": _subtree_top_changes(df_cur, df_prev, "영업외수익", top_n=10),
        "영업외비용": _subtree_top_changes(df_cur, df_prev, "영업외비용", top_n=10),
    }

    # ✅ 기존처럼 “전체 항목 중 변화 큰 Top”도 유지(참고용)
    merged = df_cur.merge(df_prev, on="항목", how="outer", suffixes=("_cur", "_prev")).fillna(0.0)
    merged["diff"] = merged["전체_cur"] - merged["전체_prev"]
    merged["abs_diff"] = merged["diff"].abs()
    merged = merged.sort_values("abs_diff", ascending=False).head(12)

    top_items = []
    for _, r in merged.iterrows():
        p = float(r["전체_prev"])
        c = float(r["전체_cur"])
        d = float(r["diff"])
        rate = (d / p * 100.0) if p != 0 else (0.0 if d == 0 else 100.0)
        top_items.append(
            {
                "path": str(r["항목"]).strip(),
                "prev": p,
                "cur": c,
                "diff": d,
                "rate": rate,
            }
        )

    return {
        "current_period": {
            "ym": cur_meta["ym"],
            "year": cur_meta["year"],
            "month": cur_meta["month"],
            "label": cur_meta["label"],
            "tag": cur_meta["tag"],  # "" 가능
            "file": cur_meta["file"],
        },
        "previous_period": {
            "ym": prev_meta["ym"],
            "year": prev_meta["year"],
            "month": prev_meta["month"],
            "label": prev_meta["label"],
            "tag": prev_meta["tag"],
            "file": prev_meta["file"],
        },
        "kpi_cards": kpi_cards,
        "drivers": drivers,
        "drilldowns": drilldowns,
        "top_items": top_items,
    }
