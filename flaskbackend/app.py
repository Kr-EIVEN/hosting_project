# =========================
# app.py  (MODIFIED - 시즌/이벤트성 규칙을 이상/누락 판단 + 사유에 반영)
#  - 기능/엔드포인트/로직은 그대로
#  - 심화분류(advancedMap)는 3개 값만 나오도록 정규화 + 필터
#  - /api/init-data 에 advancedMap 포함(프론트 배지 표시용)
#  - 누락되어 있던 유틸(_parse_year_month_from_upload_filename, _find_existing_pl_files_for_period) 추가
#  - [OK] 사유요약에 전월대비 변동% 포함
#  - [OK] 직전 3개월 유효값 있으면 12개월 언급 X / 없으면 12개월 유효값 O/X 표시
#  - [OK] (추가) 시즌/이벤트성 비용 규칙(상여/포상비/법인세)로:
#       * 비발생 월 0/결측은 정상 처리
#       * 발생 월 0/결측은 누락 처리 강화
#       * 비발생 월 금액 발생은 이상 처리 강화
# =========================

from flask import Flask, jsonify, request
from flask_cors import CORS
from flask import send_from_directory

import os
import re
import io
import sys
import pickle
import threading
import subprocess
import traceback
import json
from datetime import datetime
from pathlib import Path
from typing import Tuple, Dict, Any, List, Optional

import pandas as pd
import numpy as np

# -------------------------
# 모듈 경로를 최우선으로 추가
# -------------------------
BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

# === FX Suite (Forecast + Tariff) ===
from fx_suite import FxEnsembleForecaster, FxTariffAnalyzer
# =====================================================
# [OK] [AUTH MODE SWITCH]
# =====================================================
USE_DB_AUTH = False  # [OK] 기본: 데모 모드
# USE_DB_AUTH = True  # [OK] DB 모드

# =========================
# [PATH] 모듈 경로 강제 추가 (중요)
# =========================
# =========================
# [OK] cost_center pipeline imports
# =========================
from cost_center import (
    parse_cost_center_excel,   # (호환용) 필요시 사용
    detect_potential_missing,
    build_features,
    compute_corr_pairs,
    run_ensemble_outlier,
    build_human_explanations,
)

# =========================
# [OK] P&L Report (Topic3)
# =========================
from report_test import generate_pl_report_df
from pl_cause import analyze_pl_cause, list_available_periods

# =========================
# [OK] Topic4 Prophet (Forecast)
# =========================
from models.closing_forecast_model import (
    load_or_train,
    train_prophet_models,
    forecast_next_n,
)

# =========================
# [OK] DB / Auth
# =========================
import pymysql
from werkzeug.security import check_password_hash, generate_password_hash

app = Flask(__name__, static_folder="static", static_url_path="")
# CORS: 배포 시 프론트 URL로 origins 제한 (보안)
CORS(app, origins=["*"])  # 배포 후: origins=["https://your-frontend-url.onrender.com"]

CACHE_DIR = BASE_DIR / "cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

COST_MONTHLY_DIR = BASE_DIR / "centercost_data"
BACKDATA_EXCEL_PATH = BASE_DIR / "3back_data_with_fake11_v2.xlsx"

REPORT_DATA_DIR = BASE_DIR / "report_data"
REPORT_DATA_DIR.mkdir(parents=True, exist_ok=True)

BASE_EXCEL_PATH = str(BASE_DIR / "코스트센터_2년치_가상데이터_전체.xlsx")  # (선택) 2년치 기준 데이터(구버전 호환용)

ADV_CLASS_XLSX_PATH = BASE_DIR / "코스트센터별_분류.xlsx"

# [OK] 서버 시작 시 1회 모델 로딩
forecast_payload = load_or_train()


def get_cache_path(name: str) -> str:
    return str(CACHE_DIR / name)


def _safe_int(value, default: int, *, min_value: Optional[int] = None, max_value: Optional[int] = None) -> int:
    """
    Best-effort int parsing that survives blanks/None and clamps to bounds.
    Useful for request payloads that may send "" or null.
    """
    try:
        s = str(value).strip()
        parsed = int(s) if s != "" else int(default)
    except Exception:
        parsed = int(default)

    if min_value is not None:
        parsed = max(min_value, parsed)
    if max_value is not None:
        parsed = min(max_value, parsed)
    return parsed


def get_connection():
    return pymysql.connect(
        host="192.168.2.186",
        user="shee",
        password="1111",
        db="iljitech",
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
    )


# =====================================================
# [OK] 심화분류(고정비/변동비/시즌·이벤트성만 표시되게 정규화)
# =====================================================
_ALLOWED_ADV = {"고정비", "변동비", "시즌/이벤트성"}


def _normalize_advanced(v) -> str:
    s = str(v or "").strip()
    if not s:
        return ""

    if s in ("시즌/이벤트", "시즌", "이벤트", "시즌성", "시즌·이벤트성", "시즌/이벤트성"):
        return "시즌/이벤트성"

    if s == "고정비":
        return "고정비"
    if s == "변동비":
        return "변동비"

    if re.search(r"고정", s):
        return "고정비"
    if re.search(r"변동", s):
        return "변동비"
    if re.search(r"시즌|이벤트", s):
        return "시즌/이벤트성"

    return ""


def load_advanced_class_map(use_cache: bool = True) -> Dict[str, Dict[str, str]]:
    """
    반환:
      {
        "byCcAcc": { "CC|ACC": "고정비|변동비|시즌/이벤트성" },
        "byAcc":   { "ACC": "고정비|변동비|시즌/이벤트성" }
      }
    """
    cache_path = get_cache_path("advanced_class_map.pkl")

    if use_cache and os.path.exists(cache_path):
        try:
            with open(cache_path, "rb") as f:
                payload = pickle.load(f)
            byCcAcc = {k: v for k, v in (payload.get("byCcAcc") or {}).items() if v in _ALLOWED_ADV}
            byAcc = {k: v for k, v in (payload.get("byAcc") or {}).items() if v in _ALLOWED_ADV}
            return {"byCcAcc": byCcAcc, "byAcc": byAcc}
        except Exception:
            pass

    if not ADV_CLASS_XLSX_PATH.exists():
        return {"byCcAcc": {}, "byAcc": {}}

    df = pd.read_excel(str(ADV_CLASS_XLSX_PATH))
    df = df.replace({np.nan: ""})

    def pick(row, keys):
        for k in keys:
            if k in row and str(row.get(k)).strip() != "":
                return row.get(k)
        return ""

    by_cc_acc: Dict[str, str] = {}
    by_acc: Dict[str, str] = {}

    for _, r in df.iterrows():
        row = r.to_dict()

        acc_raw = pick(row, ["계정코드", "account_code", "계정", "acc_code", "Code"])
        cc_raw = pick(row, ["코스트센터코드", "코스트센터", "CC", "cost_center", "코스트센터코드값"])
        cls_raw = pick(row, ["심화분류", "분류", "advanced", "class", "심화", "구분"])

        acc = str(acc_raw or "").strip()
        cc = str(cc_raw or "").strip()
        cls = _normalize_advanced(cls_raw)

        if not acc or cls not in _ALLOWED_ADV:
            continue

        if acc not in by_acc:
            by_acc[acc] = cls

        if cc:
            by_cc_acc[f"{cc}|{acc}"] = cls

    payload = {"byCcAcc": by_cc_acc, "byAcc": by_acc}

    try:
        with open(cache_path, "wb") as f:
            pickle.dump(payload, f)
    except Exception:
        pass

    return payload


# =====================================================
# [OK] 시즌/이벤트성 비용 규칙(상여/포상비/법인세)
# =====================================================
_SPECIAL_RULES = [
    # 노무비-상여: 2개월 주기(격월). 시작(홀/짝)은 데이터에서 자동 추정.
    {
        "key": "BONUS_BIMONTHLY",
        "name": "노무비-상여",
        "pattern": re.compile(r"노무비\s*[-–—]\s*상여", re.IGNORECASE),
        "type": "bimonthly",
        "tags": ["반복", "이벤트"],
    },
    # 복리후생비-포상비: 2,9,11월만 발생
    {
        "key": "REWARD_EVENT",
        "name": "복리후생비-포상비",
        "pattern": re.compile(r"복리후생비\s*[-–—]\s*포상비", re.IGNORECASE),
        "type": "fixed_months",
        "months": {2, 9, 11},
        "tags": ["시즌", "이벤트"],
    },
    # 법인세 비용: 3,6,9,12월만 발생
    {
        "key": "CORP_TAX_QUARTERLY",
        "name": "법인세 비용",
        "pattern": re.compile(r"법인세\s*비용", re.IGNORECASE),
        "type": "fixed_months",
        "months": {3, 6, 9, 12},
        "tags": ["반복", "이벤트"],
    },
]


def _match_special_rule(account_name: str) -> Optional[Dict[str, Any]]:
    s = str(account_name or "").strip()
    if not s:
        return None
    for rule in _SPECIAL_RULES:
        if rule["pattern"].search(s):
            return rule
    return None


def _is_missing_like_amount(x) -> bool:
    if x is None or pd.isna(x):
        return True
    try:
        return float(x) == 0.0
    except Exception:
        return True


def _ensure_list_tags(v):
    if v is None:
        return []
    if isinstance(v, list):
        return [str(x) for x in v if str(x).strip() != ""]
    if isinstance(v, tuple):
        return [str(x) for x in v if str(x).strip() != ""]
    if isinstance(v, str):
        s = v.strip()
        if not s:
            return []
        # "['a','b']" 같은 문자열이 들어오는 경우 대비
        if s.startswith("[") and s.endswith("]"):
            inner = s[1:-1].strip()
            if not inner:
                return []
            parts = [p.strip().strip("'").strip('"') for p in inner.split(",")]
            return [p for p in parts if p]
        return [s]
    try:
        return list(v)
    except Exception:
        return []


def _add_tags(existing: Any, add: List[str]) -> List[str]:
    base = _ensure_list_tags(existing)
    for t in add:
        if t not in base:
            base.append(t)
    return base


def _infer_bimonthly_parity_for_group(g: pd.DataFrame) -> int:
    """
    격월 패턴의 '발생 월(홀/짝)'을 과거 발생(>0) 데이터에서 추정.
    반환: 0(짝수월 발생) 또는 1(홀수월 발생)
    """
    # 최근 24개월 정도만 보되, 충분히 없으면 전체
    g2 = g.sort_values(["year", "month"]).tail(24).copy()

    occur = g2[~g2["amount"].apply(_is_missing_like_amount)]
    if occur.empty:
        # 근거가 없으면 관성적으로 "짝수월"로 둠(임의)
        return 0

    occur["parity"] = occur["month"].astype(int) % 2
    counts = occur["parity"].value_counts().to_dict()
    c0 = int(counts.get(0, 0))
    c1 = int(counts.get(1, 0))

    if c0 == c1:
        # 동률이면 최신 발생 월의 parity
        last_m = int(occur.iloc[-1]["month"])
        return last_m % 2
    return 0 if c0 > c1 else 1


def apply_season_event_rules(df: pd.DataFrame) -> pd.DataFrame:
    """
    시즌/이벤트성 규칙을 issue_type/anomaly_flag/severity_rank/reason에 반영.
    - 비발생 월: 0/결측은 정상 처리
    - 발생 월: 0/결측은 누락(결측 의심) 강화
    - 비발생 월: 금액 발생은 이상 강화
    """
    need = {"account_name", "year", "month", "amount", "cost_center", "account_code"}
    if (need - set(df.columns)):
        return df

    df = df.copy()

    # reason_kor / reason_tags 없을 수 있음
    if "reason_kor" not in df.columns:
        df["reason_kor"] = ""
    if "reason_tags" not in df.columns:
        df["reason_tags"] = [[] for _ in range(len(df))]

    # 기본 컬럼 방어
    if "issue_type" not in df.columns:
        df["issue_type"] = "정상"
    if "severity_rank" not in df.columns:
        df["severity_rank"] = 1
    if "anomaly_flag" not in df.columns:
        df["anomaly_flag"] = False

    # 격월(상여) parity 맵 추정
    bonus_mask = df["account_name"].astype(str).apply(lambda s: bool(_SPECIAL_RULES[0]["pattern"].search(s)))
    bonus_df = df[bonus_mask].copy()

    parity_map: Dict[str, int] = {}
    if not bonus_df.empty:
        for (cc, acc), g in bonus_df.groupby(["cost_center", "account_code"], dropna=False):
            key = f"{cc}|{acc}"
            parity_map[key] = _infer_bimonthly_parity_for_group(g)

    # row-by-row 적용 (데이터량이 큰 편이어도 보통 수만행 수준이라 이 정도는 OK)
    for idx, row in df.iterrows():
        rule = _match_special_rule(row.get("account_name"))
        if not rule:
            continue

        m = int(row.get("month"))
        key = f"{row.get('cost_center')}|{row.get('account_code')}"
        amt_missing_like = _is_missing_like_amount(row.get("amount"))

        expected_occurs = True
        rule_desc = ""

        if rule["type"] == "fixed_months":
            months_set = set(rule.get("months") or set())
            expected_occurs = (m in months_set)
            rule_desc = f"{sorted(list(months_set))}월 발생"
        elif rule["type"] == "bimonthly":
            parity = parity_map.get(key, 0)
            expected_occurs = (m % 2 == parity)
            rule_desc = "2개월 주기(격월) 발생"

        # 태그 추가(항상)
        df.at[idx, "reason_tags"] = _add_tags(df.at[idx, "reason_tags"], rule.get("tags", []))

        # -----------------------------
        # 케이스 1) 비발생 월인데 0/결측 -> 정상 처리(결측 잡혔어도 되돌림)
        # -----------------------------
        if (not expected_occurs) and amt_missing_like:
            # issue_type이 결측 의심이더라도 정상으로 되돌림
            df.at[idx, "issue_type"] = "정상"
            df.at[idx, "anomaly_flag"] = False
            df.at[idx, "severity_rank"] = 0

            # reason_kor는 "문제 행"에만 주로 쓰지만, 혹시 프론트에서 상세를 볼 때 도움이 되도록 남김
            msg = f"[규칙반영] {rule['name']}은(는) {rule_desc} → 해당 월은 비발생이 정상입니다."
            rk = str(df.at[idx, "reason_kor"] or "").strip()
            df.at[idx, "reason_kor"] = (rk + " " + msg).strip()

            # 결측/0값 태그는 굳이 붙이지 않음(정상 처리이므로)
            continue

        # -----------------------------
        # 케이스 2) 발생 월인데 0/결측 -> 누락(결측 의심) 강화
        # -----------------------------
        if expected_occurs and amt_missing_like:
            df.at[idx, "issue_type"] = "결측 의심"
            df.at[idx, "anomaly_flag"] = True
            df.at[idx, "severity_rank"] = max(int(df.at[idx, "severity_rank"] or 1), 4)
            df.at[idx, "reason_tags"] = _add_tags(df.at[idx, "reason_tags"], ["결측", "0값"])

            msg = f"[규칙반영] {rule['name']}은(는) {rule_desc}인데 금액이 0/결측입니다 → 누락 가능성이 큽니다."
            rk = str(df.at[idx, "reason_kor"] or "").strip()
            df.at[idx, "reason_kor"] = (rk + " " + msg).strip()
            continue

        # -----------------------------
        # 케이스 3) 비발생 월인데 금액 발생 -> 이상 강화
        # -----------------------------
        if (not expected_occurs) and (not amt_missing_like):
            df.at[idx, "issue_type"] = "이상치 의심"
            df.at[idx, "anomaly_flag"] = True
            df.at[idx, "severity_rank"] = max(int(df.at[idx, "severity_rank"] or 1), 4)
            df.at[idx, "reason_tags"] = _add_tags(df.at[idx, "reason_tags"], ["패턴이탈"])

            msg = f"[규칙반영] {rule['name']}은(는) {rule_desc}인데 비발생 월에 금액이 발생했습니다 → 패턴 이탈 가능성."
            rk = str(df.at[idx, "reason_kor"] or "").strip()
            df.at[idx, "reason_kor"] = (rk + " " + msg).strip()
            continue

        # -----------------------------
        # 케이스 4) 발생 월 & 금액 발생 -> 정상/이상 여부는 기존 모델 판단 유지
        #  - 다만 사유에 '이벤트성 발생월' 힌트만 추가
        # -----------------------------
        if expected_occurs and (not amt_missing_like):
            msg = f"[규칙반영] {rule['name']} 발생 월({rule_desc})입니다."
            rk = str(df.at[idx, "reason_kor"] or "").strip()
            # 너무 중복으로 길어질 수 있어, 같은 문구가 이미 있으면 추가하지 않음
            if msg not in rk:
                df.at[idx, "reason_kor"] = (rk + " " + msg).strip()

    return df


# =====================================================
# [OK] (수정) 사유 요약 생성 유틸: 전월대비 % 포함 + 3개월/12개월 유효값 룰
# =====================================================
def _summarize_reason(
    reason_kor: str,
    reason_tags,
    display_issue_type: str,
    mom_change_pct=None,
    lookback3_has_value: Optional[bool] = None,
    lookback12_has_value: Optional[bool] = None,
    *,
    zscore_12=None,
    dev_3m=None,
    iso_score=None,
    lof_score=None,
    corr_score=None,
) -> str:

    def _fmt_mom(pct):
        if pct is None or pd.isna(pct):
            return None
        try:
            v = float(pct)
            sign = "+" if v > 0 else ""
            return f"전월대비 {sign}{v:.1f}%"
        except Exception:
            return None

    def _as_list(x):
        if x is None:
            return []
        if isinstance(x, str):
            return [x]
        try:
            return list(x)
        except Exception:
            return []

    rk = str(reason_kor or "").strip()
    tags_in = _as_list(reason_tags)

    TAG_MAP = {
        "급증": "급증", "상승": "급증", "increase": "급증",
        "급감": "급감", "하락": "급감", "decrease": "급감",
        "결측": "결측", "누락": "결측", "missing": "결측",
        "0값": "0값", "0 값": "0값", "제로": "0값",
        "패턴이탈": "패턴이탈", "패턴 이탈": "패턴이탈",
        "밴드이탈": "패턴이탈", "band": "패턴이탈", "normal band": "패턴이탈",
        "zscore": "zscore", "z-score": "zscore", "z 점수": "zscore",
        "isolationforest": "IF", "isolation forest": "IF", "iforest": "IF",
        "lof": "LOF", "localoutlierfactor": "LOF", "local outlier factor": "LOF",
        "상관": "상관이상", "corr": "상관이상", "correlation": "상관이상",
        "반복": "반복",
        "계절": "시즌", "시즌": "시즌", "이벤트": "이벤트",
    }

    ORDER = ["결측", "0값", "급증", "급감", "패턴이탈", "zscore", "IF", "LOF", "상관이상", "반복", "시즌", "이벤트"]
    ALLOWED = set(ORDER)

    def _canonize(tag: str) -> Optional[str]:
        s = str(tag or "").strip()
        if not s:
            return None
        key = s.lower()
        canon = TAG_MAP.get(s, TAG_MAP.get(key, s))
        canon = str(canon).strip()
        return canon if canon in ALLOWED else None

    bag = []
    for t in tags_in:
        c = _canonize(t)
        if c:
            bag.append(c)

    rk_low = rk.lower()
    heuristics = [
        ("결측", [r"결측", r"누락", r"비어", r"없음", r"missing"]),
        ("0값",  [r"\b0\b", r"0원", r"영원", r"제로", r"0값"]),
        ("패턴이탈", [r"밴드", r"상한", r"하한", r"범위", r"pattern", r"패턴", r"이탈"]),
        ("zscore", [r"z\s*score", r"z-[OK]score", r"z점수"]),
        ("IF", [r"isolation", r"iforest", r"\biso\b"]),
        ("LOF", [r"\blof\b", r"local\s*outlier"]),
        ("상관이상", [r"상관", r"corr", r"correlation"]),
        ("반복", [r"주기", r"반복", r"격월", r"매월", r"분기"]),
        ("시즌", [r"계절", r"시즌"]),
        ("이벤트", [r"이벤트", r"명절", r"창립", r"연말", r"프로모션", r"감사"]),
    ]
    for canon, pats in heuristics:
        for p in pats:
            if re.search(p, rk_low):
                bag.append(canon)
                break

    bag_set = set(bag)
    norm_tags = [t for t in ORDER if t in bag_set]

    # -------------------------
    # (A) 누락 케이스
    # -------------------------
    if display_issue_type == "누락":
        def _yn(v):
            if v is True:
                return "있음"
            if v is False:
                return "없음"
            return "확인필요"

        if lookback3_has_value is True:
            core = "누락 · 유효값 존재(이전 3개월 중)"
        elif lookback3_has_value is False:
            core = f"누락 · 유효값 존재(이전 3개월 중): 없음 · 유효값 존재(이전 12개월 중): {_yn(lookback12_has_value)}"
        else:
            core = "누락 · 유효값 존재(이전 3개월 중): 확인필요"

        miss_tags = [t for t in norm_tags if t in ("결측", "0값")]
        if miss_tags:
            core += f" · 원인:{'/'.join(miss_tags)}"
        return core

    # -------------------------
    # (B) 이상/기타 케이스
    # -------------------------
    parts = []
    mom_txt = _fmt_mom(mom_change_pct)
    if mom_txt:
        parts.append(mom_txt)

    show_tags = [t for t in norm_tags if t not in ("결측", "0값")]

    def _safe_abs(x):
        try:
            if x is None or pd.isna(x):
                return 0.0
            return abs(float(x))
        except Exception:
            return 0.0

    tag_score = {t: 0.0 for t in show_tags}

    mom_abs = _safe_abs(mom_change_pct)
    if "급증" in tag_score:
        tag_score["급증"] = max(tag_score["급증"], mom_abs)
    if "급감" in tag_score:
        tag_score["급감"] = max(tag_score["급감"], mom_abs)

    zs = _safe_abs(zscore_12)
    if "zscore" in tag_score:
        tag_score["zscore"] = max(tag_score["zscore"], zs)

    dv = _safe_abs(dev_3m)
    if "패턴이탈" in tag_score:
        tag_score["패턴이탈"] = max(tag_score["패턴이탈"], dv)

    ifs = _safe_abs(iso_score)
    lofs = _safe_abs(lof_score)
    if "IF" in tag_score:
        tag_score["IF"] = max(tag_score["IF"], ifs)
    if "LOF" in tag_score:
        tag_score["LOF"] = max(tag_score["LOF"], lofs)

    cs = _safe_abs(corr_score)
    if "상관이상" in tag_score:
        tag_score["상관이상"] = max(tag_score["상관이상"], cs if cs > 0 else 0.5)

    for low in ("반복", "시즌", "이벤트"):
        if low in tag_score and tag_score[low] == 0.0:
            tag_score[low] = 0.1

    order_index = {k: i for i, k in enumerate(ORDER)}
    show_tags_sorted = sorted(
        show_tags,
        key=lambda t: (-tag_score.get(t, 0.0), order_index.get(t, 999)),
    )

    if show_tags_sorted:
        parts.append("원인 " + "/".join(show_tags_sorted))

    if not parts and rk:
        short = re.split(r"[.\n]", rk)[0].strip()
        if len(short) > 40:
            short = short[:40].rstrip() + "…"
        parts.append(short)

    return " · ".join(parts) if parts else ""



# =====================================================
# ✅ reason_kor 정리: '전월 금액 ... 대비 이번 달 금액 ... 증가/감소' 문장 제거
#  - (남길 것) '전월대비 ±x.x% 변동했습니다.' 1문장 + 나머지 사유(/ ... , [규칙반영] ...)
# =====================================================
_MOM_HEAD_RE = re.compile(r"^\s*(전월\s*대비\s*[+\-]?\d+(?:\.\d+)?%\s*변동했습니다\.)\s*", re.UNICODE)
_MOM_VERBOSE_SENT_RE = re.compile(
    r"^\s*전월\s*금액.*?이번\s*달\s*금액.*?(?:\d+(?:\.\d+)?)%\s*(?:증가|감소)했습니다\.(?:\s*\/\s*)?",
    re.UNICODE,
)
_MOM_VERBOSE_SENT_WITH_PCT_RE = re.compile(
    r"^\s*전월\s*금액.*?이번\s*달\s*금액.*?(?P<pct>[+\-]?\d+(?:\.\d+)?)%\s*(?P<dir>증가|감소)했습니다\.(?:\s*\/\s*)?",
    re.UNICODE,
)

def _normalize_mom_head(pct_str: str, direction: str) -> str:
    s = str(pct_str or "").strip()
    if not s:
        return ""
    # 부호가 없으면 증가/감소로 부호 보정
    if not s.startswith(("+", "-")):
        sign = "+" if direction == "증가" else "-"
        s = sign + s
    return f"전월대비 {s}% 변동했습니다."

def clean_reason_kor_mom(df: pd.DataFrame) -> pd.DataFrame:
    if df is None or df.empty:
        return df
    if "reason_kor" not in df.columns:
        return df

    def _clean_one(s: Any) -> Any:
        if s is None or (isinstance(s, float) and pd.isna(s)):
            return s
        txt = str(s)

        # 케이스 A) 이미 '전월대비 ... 변동했습니다.'로 시작
        m = _MOM_HEAD_RE.match(txt)
        if m:
            head = m.group(1).strip()
            rest = txt[m.end():]
            # 바로 뒤에 붙는 verbose 문장 제거 (있으면)
            rest2 = _MOM_VERBOSE_SENT_RE.sub("", rest, count=1).lstrip()
            # 'head + rest2' 형태로 정리
            if rest2:
                # rest2가 슬래시로 시작하면 공백 하나만
                if rest2.startswith("/"):
                    return f"{head} {rest2}"
                return f"{head} {rest2}"
            return head

        # 케이스 B) verbose 문장만 있는 경우 → pct 추출해서 head로 치환
        m2 = _MOM_VERBOSE_SENT_WITH_PCT_RE.match(txt)
        if m2:
            pct = m2.group("pct")
            direction = m2.group("dir")
            head = _normalize_mom_head(pct, direction)
            rest = txt[m2.end():].lstrip()
            if rest:
                if rest.startswith("/"):
                    return f"{head} {rest}"
                return f"{head} {rest}"
            return head

        return txt

    out = df.copy()
    out["reason_kor"] = out["reason_kor"].apply(_clean_one)
    return out

# =====================================================
# ✅ 전월 금액 / 전월대비 % 계산
# =====================================================
def add_mom_change(df: pd.DataFrame) -> pd.DataFrame:
    need = {"cost_center", "account_code", "year", "month", "amount"}
    miss = need - set(df.columns)
    if miss:
        return df

    df = df.copy().sort_values(["cost_center", "account_code", "year", "month"])
    df["prev_amount"] = df.groupby(["cost_center", "account_code"])["amount"].shift(1)

    def _calc(row):
        cur = row.get("amount")
        prev = row.get("prev_amount")
        if pd.isna(cur) or pd.isna(prev):
            return None
        try:
            prev_f = float(prev)
            cur_f = float(cur)
        except Exception:
            return None

        if cur_f == 0.0:
            return None
        if prev_f == 0.0:
            return None

        return (cur_f - prev_f) / abs(prev_f) * 100.0

    df["mom_change_pct"] = df.apply(_calc, axis=1)
    return df


# =====================================================
# ✅ 사유(상세) 전월대비 변동% 표기 보정 (음수/부호 혼합 케이스 대응)
#  - 사유(요약) 로직은 건드리지 않음
#  - 상세(reason_kor) 안에 기존 전월대비 문구가 있으면 교체, 없으면 앞에 추가
#  - 부호: 당월 > 전월이면 '+', 당월 < 전월이면 '-', 같으면 ''(0.0%)
#  - 퍼센트: (당월-전월)/abs(전월)*100
# =====================================================
_MOM_DETAIL_RE = re.compile(r"(전월\s*대비\s*[+\-]?\d+(?:\.\d+)?\s*%[^\n\.]*[\n\.]?)", re.IGNORECASE)

def _format_mom_change_detail(cur, prev) -> Optional[str]:
    if cur is None or prev is None or pd.isna(cur) or pd.isna(prev):
        return None
    try:
        cur_f = float(cur)
        prev_f = float(prev)
    except Exception:
        return None

    # 기존 mom_change_pct와 동일하게 0/0은 표시하지 않음
    if cur_f == 0.0 or prev_f == 0.0:
        return None

    delta = cur_f - prev_f
    pct = (delta / abs(prev_f)) * 100.0

    if pct == 0.0:
        sign = ""
    else:
        sign = "+" if cur_f > prev_f else "-"

    return f"전월대비 {sign}{abs(pct):.1f}% 변동했습니다."

def _apply_mom_detail_to_reason(reason_kor: str, cur, prev) -> str:
    base = str(reason_kor or "").strip()
    mom_txt = _format_mom_change_detail(cur, prev)
    if not mom_txt:
        return base

    # 기존 전월대비 문구가 있으면 교체
    if base and _MOM_DETAIL_RE.search(base):
        base = _MOM_DETAIL_RE.sub(mom_txt + " ", base).strip()

    # 없으면 앞에 추가
    if base:
        if not base.startswith(mom_txt):
            return (mom_txt + " " + base).strip()
        return base
    return mom_txt

# =====================================================
# ✅ 직전 3개월/12개월 유효값 존재 여부
# =====================================================
def add_lookback_valid_flags(df: pd.DataFrame) -> pd.DataFrame:
    need = {"cost_center", "account_code", "year", "month", "amount"}
    if (need - set(df.columns)):
        return df

    df = df.copy().sort_values(["cost_center", "account_code", "year", "month"])

    def _is_valid(x):
        if pd.isna(x):
            return False
        try:
            return float(x) != 0.0
        except Exception:
            return False

    df["_valid_amt"] = df["amount"].apply(_is_valid)

    def _calc_flags(g):
        pv = g["_valid_amt"].shift(1).fillna(False)
        g["lookback3_has_value"] = pv.rolling(3, min_periods=1).max().astype(bool)
        g["lookback12_has_value"] = pv.rolling(12, min_periods=1).max().astype(bool)
        return g

    df = df.groupby(["cost_center", "account_code"], group_keys=False).apply(_calc_flags)
    df.drop(columns=["_valid_amt"], inplace=True, errors="ignore")
    return df


# =====================================================
# 유틸: 파일명에서 연/월 추출 (통합보고서 파일명용)
# =====================================================
def _parse_year_month_from_report_filename(path: Path) -> Optional[Tuple[int, int]]:
    name = path.name
    m = re.search(r"(\d{2})년[_\s](\d{2})월", name)
    if not m:
        return None
    yy = int(m.group(1))
    mm = int(m.group(2))
    if not (1 <= mm <= 12):
        return None
    year = 2000 + yy
    return year, mm


# =====================================================
# 유틸: 업로드 파일명에서 연/월 추출 (back_data 업로드용)
# =====================================================
def _parse_year_month_from_upload_filename(filename: str) -> Optional[Tuple[int, int]]:
    s = str(filename or "")

    m1 = re.search(r"(20\d{2})\s*년\D*([0-1][OK]\d)\s*월", s)
    if m1:
        y = int(m1.group(1))
        m = int(m1.group(2))
        if 1 <= m <= 12:
            return (y, m)

    m2 = re.search(r"(\d{2})\s*년[_\s-]*([0-1][OK]\d)\s*월", s)
    if m2:
        yy = int(m2.group(1))
        m = int(m2.group(2))
        if 1 <= m <= 12:
            return (2000 + yy, m)

    m3 = re.search(r"(20\d{2})([0-1]\d)", s)
    if m3:
        y = int(m3.group(1))
        m = int(m3.group(2))
        if 1 <= m <= 12:
            return (y, m)

    m4 = re.search(r"(\d{2})([0-1]\d)", s)
    if m4 and "20" not in s:
        yy = int(m4.group(1))
        m = int(m4.group(2))
        if 1 <= m <= 12:
            return (2000 + yy, m)

    return None


def _find_existing_pl_files_for_period(year: int, month: int) -> Dict[str, List[Path]]:
    REPORT_DATA_DIR.mkdir(parents=True, exist_ok=True)
    yy2 = year % 100

    report_pattern = f"{yy2:02d}년_{month:02d}월*결산보고서_통합*.xlsx"
    reports = list(REPORT_DATA_DIR.glob(report_pattern))

    back_pattern = f"{yy2:02d}년_{month:02d}월*back*.xlsx"
    backs = list(REPORT_DATA_DIR.glob(back_pattern))

    reports += list(REPORT_DATA_DIR.glob(f"{year}년*{month:02d}월*결산보고서_통합*.xlsx"))
    backs += list(REPORT_DATA_DIR.glob(f"{year}년*{month:02d}월*back*.xlsx"))

    return {
        "reports": sorted(set(reports), key=lambda p: p.stat().st_mtime, reverse=True),
        "backs": sorted(set(backs), key=lambda p: p.stat().st_mtime, reverse=True),
    }


# =====================================================
# Health
# =====================================================
@app.route("/api/health", methods=["GET"])
def health_check():
    return jsonify({"status": "ok"})


# =====================================================
# Auth
# =====================================================
@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.get_json() or {}

    username = (data.get("username") or data.get("userId") or "").strip()
    password = data.get("password") or ""

    if not username or not password:
        return jsonify({"success": False, "message": "아이디와 비밀번호를 입력해주세요."}), 400

    if not USE_DB_AUTH:
        return jsonify(
            {
                "success": True,
                "user": {"id": 0, "username": username, "role": "demo"},
                "mode": "demo_no_db",
            }
        ), 200

    conn = None
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, username, password_hash, role
                FROM users
                WHERE username = %s
                LIMIT 1
                """,
                (username,),
            )
            user = cur.fetchone()
    except Exception as e:
        print("[/api/login] DB error:", e)
        return jsonify({"success": False, "message": "로그인 중 서버 오류가 발생했습니다."}), 500
    finally:
        try:
            if conn:
                conn.close()
        except Exception:
            pass

    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify({"success": False, "message": "아이디 또는 비밀번호가 올바르지 않습니다."}), 401

    return jsonify(
        {
            "success": True,
            "user": {"id": user["id"], "username": user["username"], "role": user.get("role", "user")},
            "mode": "db",
        }
    ), 200


@app.route("/api/signup", methods=["POST"])
def api_signup():
    data = request.get_json() or {}

    user_id = (data.get("userId") or data.get("username") or "").strip()
    password = data.get("password") or ""

    if not user_id or not password:
        return jsonify({"success": False, "message": "아이디와 비밀번호를 입력해주세요."}), 400

    if not USE_DB_AUTH:
        return jsonify({"success": True, "message": "회원가입이 완료되었습니다. (데모/DB 미사용)"}), 200

    conn = None
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s LIMIT 1", (user_id,))
            exists = cur.fetchone()
            if exists:
                return jsonify({"success": False, "message": "이미 사용 중인 아이디입니다."}), 400

            pw_hash = generate_password_hash(password)
            cur.execute(
                """
                INSERT INTO users (username, password_hash, role)
                VALUES (%s, %s, %s)
                """,
                (user_id, pw_hash, "user"),
            )
            conn.commit()
    except Exception as e:
        print("[/api/signup] DB error:", e)
        return jsonify({"success": False, "message": "회원가입 중 서버 오류가 발생했습니다."}), 500
    finally:
        try:
            if conn:
                conn.close()
        except Exception:
            pass

    return jsonify({"success": True, "message": "회원가입이 완료되었습니다."}), 200


@app.route("/api/reset-password", methods=["POST"])
def reset_password():
    data = request.get_json() or {}
    identifier = (data.get("userIdOrEmail") or "").strip()

    if not identifier:
        return jsonify({"success": False, "message": "아이디 또는 이메일을 입력해주세요."}), 400

    if not USE_DB_AUTH:
        return jsonify({"success": True, "message": "재설정 링크를 전송했다고 가정합니다. (데모/DB 미사용)"}), 200

    conn = None
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE username = %s LIMIT 1", (identifier,))
            user = cur.fetchone()
    except Exception as e:
        print("[/api/reset-password] DB error:", e)
        return jsonify({"success": False, "message": "비밀번호 재설정 중 서버 오류가 발생했습니다."}), 500
    finally:
        try:
            if conn:
                conn.close()
        except Exception:
            pass

    if not user:
        return jsonify({"success": False, "message": "해당 아이디(또는 이메일)를 사용하는 사용자를 찾을 수 없습니다."}), 404

    return jsonify({"success": True, "message": "재설정 링크를 전송했다고 가정합니다."}), 200


# =====================================================
# 4. 단일 월 업로드 엑셀 파싱 (유연 파서)
# =====================================================
def _normalize_year_month_label(label: str) -> Tuple[str, int, int]:
    s = str(label)

    # 1) "2024년 4월" / "2024년4월" / "2024년 10 월" 전부 허용
    m = re.search(r"(20\d{2})\s*년\s*([0-9]{1,2})\s*월", s)
    if not m:
        # 2) 보조: "2024-04", "2024/04" 같은 형식도 허용
        m = re.search(r"(20\d{2})\D+([0-9]{1,2})\b", s)

    if not m:
        raise ValueError(f"연-월 정보를 찾을 수 없습니다: {label}")

    year = int(m.group(1))
    month = int(m.group(2))
    if not (1 <= month <= 12):
        raise ValueError(f"월(month) 값이 범위를 벗어났습니다: {label}")

    ym = f"{year:04d}-{month:02d}"
    return ym, year, month



def parse_single_month_excel(file_stream: io.BytesIO) -> pd.DataFrame:
    raw = pd.read_excel(file_stream, header=None)

    if raw.shape[1] < 5:
        raise ValueError("예상보다 적은 컬럼 수입니다. 업로드 양식을 확인하세요.")

    header = raw.iloc[0]
    header_str = header.astype(str)

    month_col_idx = None
    for i, v in enumerate(header_str):
        if re.search(r"20\d{2}\s*년\s*\d{1,2}\s*월", v):
            month_col_idx = i
            break
    if month_col_idx is None:
        month_col_idx = raw.shape[1] - 1

    month_label = header.iloc[month_col_idx]
    year_month, year, month = _normalize_year_month_label(month_label)

    df = raw.iloc[1:].copy()

    def find_col(keyword_list, default_idx):
        for i, v in enumerate(header_str):
            for kw in keyword_list:
                if kw in v:
                    return i
        return default_idx

    cc_code_idx = find_col(["코스트센터코드", "코스트센터 코드", "코스트센터"], 0)
    cc_name_idx = find_col(["코스트센터명", "코스트센터 명"], 1)
    acc_code_idx = find_col(["계정코드", "계정 코드"], 2)
    acc_name_idx = find_col(["계정명", "계정 명"], 3)

    rename_map = {
        cc_code_idx: "cost_center",
        cc_name_idx: "cc_name",
        acc_code_idx: "account_code",
        acc_name_idx: "account_name",
        month_col_idx: "amount",
    }

    df = df.rename(columns=rename_map)

    needed_cols = ["cost_center", "cc_name", "account_code", "account_name", "amount"]
    missing = [c for c in needed_cols if c not in df.columns]
    if missing:
        raise ValueError(f"필수 컬럼이 누락되었습니다: {', '.join(missing)}")

    df = df[needed_cols]

    for col in ["cost_center", "cc_name", "account_code", "account_name"]:
        df[col] = df[col].astype(str).str.strip()

    df["amount"] = pd.to_numeric(df["amount"], errors="coerce")

    df["year_month"] = year_month
    df["year"] = year
    df["month"] = month

    if "cost_nature" not in df.columns:
        df["cost_nature"] = "기타"

    df = df[df["cost_center"].notna() & (df["cost_center"].astype(str) != "nan")]
    return df.reset_index(drop=True)


# =====================================================
# 1-A. 월별 엑셀 여러 개를 long 포맷으로 로딩
# =====================================================
def load_all_monthly_cost_long() -> pd.DataFrame:
    if not COST_MONTHLY_DIR.exists():
        raise FileNotFoundError(f"월별 코스트센터 폴더가 없습니다: {COST_MONTHLY_DIR}")

    all_dfs: List[pd.DataFrame] = []

    for fname in sorted(os.listdir(str(COST_MONTHLY_DIR))):
        if not fname.lower().endswith((".xlsx", ".xls")):
            continue
        fpath = COST_MONTHLY_DIR / fname
        try:
            with open(fpath, "rb") as f:
                data = f.read()
            df = parse_single_month_excel(io.BytesIO(data))
            df["source_file"] = fname
            all_dfs.append(df)
            print(f"[load_all_monthly_cost_long] loaded {fname}, rows={len(df)}")
        except Exception as e:
            print(f"[load_all_monthly_cost_long] {fname} 읽는 중 오류:", e)

    if not all_dfs:
        raise ValueError(f"{COST_MONTHLY_DIR} 안에서 유효한 월별 엑셀(.xlsx/.xls)을 찾지 못했습니다.")

    df_all = pd.concat(all_dfs, ignore_index=True)

    if "year" not in df_all.columns or "month" not in df_all.columns:
        raise ValueError("월별 데이터에 year/month 컬럼이 없습니다.")

    df_all["year_month"] = df_all["year_month"].astype(str)
    df_all = df_all.sort_values(["year", "month"]).reset_index(drop=True)

    if "cost_nature" not in df_all.columns:
        df_all["cost_nature"] = "기타"

    return df_all


def build_wide_cost_data(df: pd.DataFrame) -> pd.DataFrame:
    required_cols = ["cost_center", "cc_name", "account_code", "account_name", "year_month", "amount"]
    missing = [c for c in required_cols if c not in df.columns]
    if missing:
        raise ValueError("build_wide_cost_data: missing columns: " + ", ".join(missing))

    df_use = df[required_cols].copy()
    for col in ["cost_center", "cc_name", "account_code", "account_name", "year_month"]:
        df_use[col] = df_use[col].astype(str)

    pivot = (
        df_use.pivot_table(
            index=["cost_center", "cc_name", "account_code", "account_name"],
            columns="year_month",
            values="amount",
            aggfunc="sum",
            fill_value=0.0,
        )
        .reset_index()
    )

    pivot.columns = [str(c) for c in pivot.columns]

    if "cc_name" in pivot.columns:
        if "코스트센터명" not in pivot.columns:
            idx = pivot.columns.get_loc("cc_name") + 1
            pivot.insert(idx, "코스트센터명", pivot["cc_name"])
        if "부서명" not in pivot.columns:
            idx2 = pivot.columns.get_loc("코스트센터명") + 1 if "코스트센터명" in pivot.columns else pivot.columns.get_loc("cc_name") + 1
            pivot.insert(idx2, "부서명", pivot["cc_name"])

    if "cost_center" in pivot.columns and "코스트센터" not in pivot.columns:
        idx = pivot.columns.get_loc("cost_center") + 1
        pivot.insert(idx, "코스트센터", pivot["cost_center"])

    return pivot


def load_cost_center_data(use_cache: bool = True) -> pd.DataFrame:
    cache_path = get_cache_path("costData_wide.pkl")

    if use_cache and os.path.exists(cache_path):
        try:
            df_wide = pd.read_pickle(cache_path)
            print("[load_cost_center_data] loaded from cache:", cache_path)
            return df_wide
        except Exception as e:
            print("[load_cost_center_data] cache load error, 재계산:", e)

    df_long = load_all_monthly_cost_long()
    df_wide = build_wide_cost_data(df_long)

    try:
        df_wide.to_pickle(cache_path)
        print("[load_cost_center_data] saved cache:", cache_path)
    except Exception as e:
        print("[load_cost_center_data] cache save error:", e)

    return df_wide


def load_pl_backdata():
    if not BACKDATA_EXCEL_PATH.exists():
        raise FileNotFoundError(f"Backdata file not found: {BACKDATA_EXCEL_PATH}")

    xls = pd.ExcelFile(str(BACKDATA_EXCEL_PATH))
    print("[load_pl_backdata] sheet names:", xls.sheet_names)

    back_sheet_name = None
    for name in xls.sheet_names:
        if re.search(r"back\s*data", name, re.IGNORECASE):
            back_sheet_name = name
            break
    if back_sheet_name is None:
        back_sheet_name = xls.sheet_names[0]

    df_back = pd.read_excel(xls, sheet_name=back_sheet_name)
    df_back = df_back.replace({np.nan: None})
    back_records = df_back.to_dict(orient="records")

    codeNameMap: Dict[str, str] = {}
    mapping_sheet_name = None
    for name in xls.sheet_names:
        if re.search(r"코드분류표|code.[OK]map|코드맵", name, re.IGNORECASE):
            mapping_sheet_name = name
            break

    if mapping_sheet_name is not None:
        df_map = pd.read_excel(xls, sheet_name=mapping_sheet_name)
        for _, row in df_map.iterrows():
            rawCode = (
                (row.get("코드") if "코드" in row else None)
                or (row.get("계정코드") if "계정코드" in row else None)
                or (row.get("코스트센터") if "코스트센터" in row else None)
                or (row.get("코드값") if "코드값" in row else None)
                or (row.get("Code") if "Code" in row else None)
            )
            rawName = (
                (row.get("내역") if "내역" in row else None)
                or (row.get("계정명") if "계정명" in row else None)
                or (row.get("코스트센터명") if "코스트센터명" in row else None)
                or (row.get("Name") if "Name" in row else None)
                or (row.get("설명") if "설명" in row else None)
            )

            if rawCode is None or rawName is None:
                continue
            if pd.isna(rawCode) or pd.isna(rawName):
                continue

            code = str(rawCode).strip()
            name = str(rawName).strip()
            if code:
                codeNameMap[code] = name

    return back_records, codeNameMap


@app.route("/api/init-data", methods=["GET"])
def init_data():
    try:
        df_cost = load_cost_center_data(use_cache=True)
        costData = df_cost.to_dict(orient="records")
    except Exception as e:
        print("[init-data] costData load error:", e)
        costData = []

    try:
        backData, codeNameMap = load_pl_backdata()
    except Exception as e:
        print("[init-data] backData load error:", e)
        backData = []
        codeNameMap = {}

    try:
        advancedMap = load_advanced_class_map(use_cache=True)
    except Exception as e:
        print("[init-data] advancedMap load error:", e)
        advancedMap = {"byCcAcc": {}, "byAcc": {}}

    anomalyData: List[Dict[str, Any]] = []
    return jsonify(
        {
            "costData": costData,
            "backData": backData,
            "codeNameMap": codeNameMap,
            "anomalyData": anomalyData,
            "advancedMap": advancedMap,
        }
    )


def build_history_map(df: pd.DataFrame) -> Dict[str, List[Dict[str, Any]]]:
    hist: Dict[str, List[Dict[str, Any]]] = {}
    df = df.copy()
    df["year_month"] = df["year_month"].astype(str)

    has_upper = "normal_upper" in df.columns
    has_lower = "normal_lower" in df.columns
    has_flag = "anomaly_flag" in df.columns

    for (cc, acc), grp in df.groupby(["cost_center", "account_code"], dropna=False):
        key = f"{cc}|{acc}"
        grp_sorted = grp.sort_values("year_month")

        records: List[Dict[str, Any]] = []
        for _, row in grp_sorted.iterrows():
            ym = str(row.get("year_month"))
            amt = row.get("amount")

            nu = row.get("normal_upper") if has_upper else None
            nl = row.get("normal_lower") if has_lower else None
            af = bool(row.get("anomaly_flag", False)) if has_flag else False

            records.append(
                {
                    "month": ym,
                    "amount": float(amt) if pd.notna(amt) else None,
                    "normalUpper": float(nu) if (nu is not None and pd.notna(nu)) else None,
                    "normalLower": float(nl) if (nl is not None and pd.notna(nl)) else None,
                    "anomalyFlag": af,
                }
            )

        hist[key] = records

    return hist


def add_normal_band(df: pd.DataFrame, window: int = 6, min_periods: int = 1) -> pd.DataFrame:
    if "amount" not in df.columns:
        raise ValueError("add_normal_band: 'amount' 컬럼이 없습니다.")
    for col in ["year", "month"]:
        if col not in df.columns:
            raise ValueError(f"add_normal_band: '{col}' 컬럼이 없습니다.")

    df = df.copy()
    df = df.sort_values(["cost_center", "account_code", "year", "month"])
    df["normal_upper"] = np.nan
    df["normal_lower"] = np.nan

    has_flag = "anomaly_flag" in df.columns

    for (cc, acc), grp in df.groupby(["cost_center", "account_code"], dropna=False):
        vals = grp["amount"].astype(float)

        if has_flag:
            flag = grp["anomaly_flag"].astype(bool)
            valid_vals = vals.where(~flag, np.nan)
        else:
            valid_vals = vals

        roll_mean = valid_vals.rolling(window=window, min_periods=min_periods).mean()
        roll_std = valid_vals.rolling(window=window, min_periods=min_periods).std(ddof=0)

        fallback_mean = vals.rolling(window=window, min_periods=min_periods).mean()
        fallback_std = vals.rolling(window=window, min_periods=min_periods).std(ddof=0)

        mean_final = roll_mean.fillna(fallback_mean)
        std_final = roll_std.fillna(fallback_std)

        upper = mean_final + 2 * std_final
        lower = mean_final - 2 * std_final

        df.loc[grp.index, "normal_upper"] = upper.values
        df.loc[grp.index, "normal_lower"] = lower.values

    return df


def run_monthly_anomaly_pipeline(upload_df: pd.DataFrame) -> Dict[str, Any]:
    if upload_df.empty:
        raise ValueError("업로드된 데이터에 내용이 없습니다.")

    target_ym = upload_df["year_month"].iloc[0]

    base_df = load_all_monthly_cost_long()
    base_df = base_df[base_df["year_month"] != target_ym].copy()
    df_all = pd.concat([base_df, upload_df], ignore_index=True)

    df_all = detect_potential_missing(df_all, lookback_months=3)
    df_all = build_features(df_all)
    df_all = compute_corr_pairs(df_all)
    df_all = run_ensemble_outlier(df_all)
    df_all = build_human_explanations(df_all)

    # [OK] 밴드 계산 전에 일단 밴드(기존대로)
    df_all = add_normal_band(df_all)

    # [OK] 전월대비/룩백
    df_all = add_mom_change(df_all)
    df_all = add_lookback_valid_flags(df_all)



    # ✅ reason_kor에서 전월 금액/이번 달 금액 verbose 문장 제거
    df_all = clean_reason_kor_mom(df_all)

    # ✅ 시즌/이벤트 규칙 반영(여기서 issue_type / severity / reason 보정)
    df_all = apply_season_event_rules(df_all)

    wide_df = build_wide_cost_data(df_all)
    cost_data_updated = wide_df.to_dict(orient="records")

    history_map = build_history_map(df_all)

    df_month = df_all[df_all["year_month"] == target_ym].copy()
    if df_month.empty:
        raise ValueError(f"파이프라인 이후에도 {target_ym} 데이터가 없습니다.")

    def _status_from_row(row):
        issue_type = row.get("issue_type")
        if issue_type == "결측 의심":
            return "issue"
        if issue_type == "정상":
            return "ok"
        if issue_type == "이상치 의심":
            return "check"
        return "check"

    df_month["status"] = df_month.apply(_status_from_row, axis=1)
    df_month["is_issue"] = df_month["status"] != "ok"

    total_rows = int(len(df_month))
    issue_rows = int(df_month["is_issue"].sum())
    missing_rows = int((df_month["issue_type"] == "결측 의심").sum())
    anomaly_rows = int((df_month["issue_type"] == "이상치 의심").sum())
    total_amount = float(df_month["amount"].sum(skipna=True))

    summary = {
        "year_month": target_ym,
        "total_rows": total_rows,
        "issue_rows": issue_rows,
        "missing_rows": missing_rows,
        "anomaly_rows": anomaly_rows,
        "total_amount": total_amount,
        "issue_ratio": float(issue_rows / total_rows) if total_rows else 0.0,
    }

    center_group = (
        df_month.groupby(["cost_center", "cc_name"], dropna=False)
        .agg(
            total_rows=("is_issue", "count"),
            issue_rows=("is_issue", "sum"),
            missing_rows=("issue_type", lambda s: (s == "결측 의심").sum()),
            anomaly_rows=("issue_type", lambda s: (s == "이상치 의심").sum()),
            total_amount=("amount", "sum"),
        )
        .reset_index()
    )

    center_group["issue_ratio"] = center_group["issue_rows"] / center_group["total_rows"].replace(0, np.nan)
    center_group = center_group.sort_values(["issue_rows", "total_amount"], ascending=[False, False])

    centers: List[Dict[str, Any]] = []
    for _, row in center_group.iterrows():
        centers.append(
            {
                "cost_center": str(row["cost_center"]),
                "cc_name": str(row["cc_name"]),
                "total_rows": int(row["total_rows"]),
                "issue_rows": int(row["issue_rows"]),
                "missing_rows": int(row["missing_rows"]),
                "anomaly_rows": int(row["anomaly_rows"]),
                "total_amount": float(row["total_amount"]),
                "issue_ratio": float(row["issue_ratio"]) if pd.notna(row["issue_ratio"]) else 0.0,
            }
        )

    issue_df = df_month[df_month["is_issue"]].copy()
    order_map = {"issue": 0, "check": 1, "ok": 2}
    issue_df["__order"] = issue_df["status"].map(order_map).fillna(1)
    issue_df = issue_df.sort_values(["__order", "severity_rank", "amount"], ascending=[True, False, False])

    issues: List[Dict[str, Any]] = []
    for _, row in issue_df.iterrows():
        row_key = f"{row.get('cost_center')}|{row.get('account_code')}"

        nu = row.get("normal_upper")
        nl = row.get("normal_lower")
        pattern_upper = float(nu) if (nu is not None and pd.notna(nu)) else None
        pattern_lower = float(nl) if (nl is not None and pd.notna(nl)) else None
        pattern_mean = (
            (pattern_upper + pattern_lower) / 2.0
            if (pattern_upper is not None and pattern_lower is not None)
            else None
        )

        amt_val = row.get("amount")
        is_missing_like = False
        try:
            if pd.isna(amt_val) or float(amt_val) == 0.0:
                is_missing_like = True
        except Exception:
            pass

        if is_missing_like:
            display_issue_type = "누락"
        elif str(row.get("issue_type")) == "이상치 의심":
            display_issue_type = "이상"
        else:
            display_issue_type = str(row.get("issue_type"))

        reason_kor = str(row.get("reason_kor") or "")
        # ✅ 사유(상세) 전월대비 변동% 부호 보정
        reason_kor = _apply_mom_detail_to_reason(reason_kor, row.get("amount"), row.get("prev_amount"))
        reason_tags = row.get("reason_tags", [])

        mom_pct = row.get("mom_change_pct")
        lb3 = row.get("lookback3_has_value")
        lb12 = row.get("lookback12_has_value")

        reason_summary = _summarize_reason(
            reason_kor,
            reason_tags,
            display_issue_type,
            mom_pct,
            lb3,
            lb12,
            zscore_12=row.get("zscore_12"),
            dev_3m=row.get("dev_3m"),
            iso_score=row.get("iso_score"),
            lof_score=row.get("lof_score"),
            corr_score=row.get("corr_score") or row.get("corr_anom_score"),
        )

        issues.append(
            {
                "row_key": row_key,
                "year_month": str(row.get("year_month")),
                "year": int(row.get("year")),
                "month": int(row.get("month")),
                "cost_center": str(row.get("cost_center")),
                "cc_name": str(row.get("cc_name")),
                "account_code": str(row.get("account_code")),
                "account_name": str(row.get("account_name")),
                "cost_nature": str(row.get("cost_nature")),
                "amount": float(row.get("amount")) if pd.notna(row.get("amount")) else None,

                "prev_amount": float(row.get("prev_amount")) if pd.notna(row.get("prev_amount")) else None,
                "mom_change_pct": float(mom_pct) if (mom_pct is not None and pd.notna(mom_pct)) else None,

                "lookback3_has_value": bool(lb3) if pd.notna(lb3) else None,
                "lookback12_has_value": bool(lb12) if pd.notna(lb12) else None,

                "issue_type": str(row.get("issue_type")),
                "severity_rank": int(row.get("severity_rank", 1)),
                "status": row.get("status"),
                "reason_kor": reason_kor,
                "reason_summary": reason_summary,
                "reason_tags": reason_tags,
                "zscore_12": float(row.get("zscore_12")) if pd.notna(row.get("zscore_12")) else None,
                "dev_3m": float(row.get("dev_3m")) if pd.notna(row.get("dev_3m")) else None,
                "iso_score": float(row.get("iso_score")) if pd.notna(row.get("iso_score")) else None,
                "lof_score": float(row.get("lof_score")) if pd.notna(row.get("lof_score")) else None,
                "anomaly_flag": bool(row.get("anomaly_flag", False)),
                "patternMean": pattern_mean,
                "patternUpper": pattern_upper,
                "patternLower": pattern_lower,
                "display_issue_type": display_issue_type,
            }
        )

    return {
        "summary": summary,
        "centers": centers,
        "issues": issues,
        "history": history_map,
        "costData": cost_data_updated,
    }


@app.route("/api/cost-center/analyze", methods=["POST"])
def analyze_cost_center():
    if "file" not in request.files:
        return jsonify({"error": "file 필드가 없습니다."}), 400

    f = request.files["file"]
    if f.filename == "":
        return jsonify({"error": "업로드된 파일명이 비어 있습니다."}), 400

    try:
        upload_df = parse_single_month_excel(io.BytesIO(f.read()))
        result = run_monthly_anomaly_pipeline(upload_df)
        return jsonify(result)
    except Exception as e:
        print("[/api/cost-center/analyze] error:", e)
        return jsonify({"error": str(e)}), 500


def run_default_cost_center_anomaly(use_cache: bool = True) -> Dict[str, Any]:
    cache_path = get_cache_path("default_anomaly_result.pkl")

    if use_cache and os.path.exists(cache_path):
        try:
            with open(cache_path, "rb") as f:
                result = pickle.load(f)
            print("[run_default_cost_center_anomaly] loaded from cache:", cache_path)
            return result
        except Exception as e:
            print("[run_default_cost_center_anomaly] cache load error, 재계산:", e)

    df = load_all_monthly_cost_long()
    df = detect_potential_missing(df, lookback_months=3)
    df = build_features(df)
    df = compute_corr_pairs(df)
    df = run_ensemble_outlier(df)
    df = build_human_explanations(df)
    df = add_normal_band(df)

    df = add_mom_change(df)
    df = add_lookback_valid_flags(df)


    # ✅ reason_kor에서 전월 금액/이번 달 금액 verbose 문장 제거
    df = clean_reason_kor_mom(df)

    # ✅ 시즌/이벤트 규칙 반영
    df = apply_season_event_rules(df)

    df["year_month"] = df["year_month"].astype(str)
    unique_ym = sorted(df["year_month"].unique())
    if not unique_ym:
        raise ValueError("year_month 값이 없습니다.")
    target_ym = unique_ym[-1]

    history_map = build_history_map(df)
    df_month = df[df["year_month"] == target_ym].copy()
    if df_month.empty:
        raise ValueError(f"{target_ym} 월 데이터가 없습니다.")

    def _status_from_row(row):
        if row.get("issue_type") == "정상":
            return "ok"
        if row.get("issue_type") == "결측 의심" or row.get("severity_rank", 1) >= 4:
            return "issue"
        return "check"

    df_month["status"] = df_month.apply(_status_from_row, axis=1)
    df_month["is_issue"] = df_month["status"] != "ok"

    total_rows = int(len(df_month))
    issue_rows = int(df_month["is_issue"].sum())
    missing_rows = int((df_month["issue_type"] == "결측 의심").sum())
    anomaly_rows = int((df_month["issue_type"] == "이상치 의심").sum())
    total_amount = float(df_month["amount"].sum(skipna=True))

    summary = {
        "year_month": target_ym,
        "total_rows": total_rows,
        "issue_rows": issue_rows,
        "missing_rows": missing_rows,
        "anomaly_rows": anomaly_rows,
        "total_amount": total_amount,
        "issue_ratio": float(issue_rows / total_rows) if total_rows else 0.0,
    }

    center_group = (
        df_month.groupby(["cost_center", "cc_name"], dropna=False)
        .agg(
            total_rows=("is_issue", "count"),
            issue_rows=("is_issue", "sum"),
            missing_rows=("issue_type", lambda s: (s == "결측 의심").sum()),
            anomaly_rows=("issue_type", lambda s: (s == "이상치 의심").sum()),
            total_amount=("amount", "sum"),
        )
        .reset_index()
    )
    center_group["issue_ratio"] = center_group["issue_rows"] / center_group["total_rows"].replace(0, np.nan)
    center_group = center_group.sort_values(["issue_rows", "total_amount"], ascending=[False, False])

    centers: List[Dict[str, Any]] = []
    for _, row in center_group.iterrows():
        centers.append(
            {
                "cost_center": str(row["cost_center"]),
                "cc_name": str(row["cc_name"]),
                "total_rows": int(row["total_rows"]),
                "issue_rows": int(row["issue_rows"]),
                "missing_rows": int(row["missing_rows"]),
                "anomaly_rows": int(row["anomaly_rows"]),
                "total_amount": float(row["total_amount"]),
                "issue_ratio": float(row["issue_ratio"]) if pd.notna(row["issue_ratio"]) else 0.0,
            }
        )

    issue_df = df_month[df_month["is_issue"]].copy()
    order_map = {"issue": 0, "check": 1, "ok": 2}
    issue_df["__order"] = issue_df["status"].map(order_map).fillna(1)
    issue_df = issue_df.sort_values(["__order", "severity_rank", "amount"], ascending=[True, False, False])

    issues: List[Dict[str, Any]] = []
    for _, row in issue_df.iterrows():
        row_key = f"{row.get('cost_center')}|{row.get('account_code')}"

        amt_val = row.get("amount")
        is_missing_like = False
        try:
            if pd.isna(amt_val) or float(amt_val) == 0.0:
                is_missing_like = True
        except Exception:
            pass

        if is_missing_like:
            display_issue_type = "누락"
        elif str(row.get("issue_type")) == "이상치 의심":
            display_issue_type = "이상"
        else:
            display_issue_type = str(row.get("issue_type"))

        reason_kor = str(row.get("reason_kor") or "")
        # ✅ 사유(상세) 전월대비 변동% 부호 보정
        reason_kor = _apply_mom_detail_to_reason(reason_kor, row.get("amount"), row.get("prev_amount"))
        reason_tags = row.get("reason_tags", [])

        mom_pct = row.get("mom_change_pct")
        lb3 = row.get("lookback3_has_value")
        lb12 = row.get("lookback12_has_value")

        reason_summary = _summarize_reason(
            reason_kor,
            reason_tags,
            display_issue_type,
            mom_pct,
            lb3,
            lb12,
            zscore_12=row.get("zscore_12"),
            dev_3m=row.get("dev_3m"),
            iso_score=row.get("iso_score"),
            lof_score=row.get("lof_score"),
            corr_score=row.get("corr_score") or row.get("corr_anom_score"),
        )

        issues.append(
            {
                "row_key": row_key,
                "year_month": str(row.get("year_month")),
                "year": int(row.get("year")),
                "month": int(row.get("month")),
                "cost_center": str(row.get("cost_center")),
                "cc_name": str(row.get("cc_name")),
                "account_code": str(row.get("account_code")),
                "account_name": str(row.get("account_name")),
                "cost_nature": str(row.get("cost_nature")),
                "amount": float(row.get("amount")) if pd.notna(row.get("amount")) else None,

                "prev_amount": float(row.get("prev_amount")) if pd.notna(row.get("prev_amount")) else None,
                "mom_change_pct": float(mom_pct) if (mom_pct is not None and pd.notna(mom_pct)) else None,

                "lookback3_has_value": bool(lb3) if pd.notna(lb3) else None,
                "lookback12_has_value": bool(lb12) if pd.notna(lb12) else None,

                "issue_type": str(row.get("issue_type")),
                "severity_rank": int(row.get("severity_rank", 1)),
                "status": row.get("status"),
                "reason_kor": reason_kor,
                "reason_summary": reason_summary,
                "reason_tags": reason_tags,
                "zscore_12": float(row.get("zscore_12")) if pd.notna(row.get("zscore_12")) else None,
                "dev_3m": float(row.get("dev_3m")) if pd.notna(row.get("dev_3m")) else None,
                "iso_score": float(row.get("iso_score")) if pd.notna(row.get("iso_score")) else None,
                "lof_score": float(row.get("lof_score")) if pd.notna(row.get("lof_score")) else None,
                "anomaly_flag": bool(row.get("anomaly_flag", False)),
            }
        )

    result = {"summary": summary, "centers": centers, "issues": issues, "history": history_map}

    try:
        with open(cache_path, "wb") as f:
            pickle.dump(result, f)
        print("[run_default_cost_center_anomaly] saved cache:", cache_path)
    except Exception as e:
        print("[run_default_cost_center_anomaly] cache save error:", e)

    return result


@app.route("/api/cost-center/analyze-default", methods=["GET"])
def analyze_cost_center_default():
    try:
        result = run_default_cost_center_anomaly(use_cache=True)
        return jsonify(result)
    except Exception as e:
        print("[/api/cost-center/analyze-default] error:", e)
        return jsonify({"error": str(e)}), 500


# =====================================================
# Topic3: P&L Back data 업로드 + 통합 리포트 생성
# =====================================================
@app.route("/api/pl-report/back-data", methods=["POST"])
def upload_pl_back_data():
    if "file" not in request.files:
        return jsonify({"error": "file 필드가 없습니다."}), 400

    f = request.files["file"]
    if f.filename == "":
        return jsonify({"error": "업로드된 파일명이 비어 있습니다."}), 400

    force = request.args.get("force") == "1"

    try:
        REPORT_DATA_DIR.mkdir(parents=True, exist_ok=True)

        original_name = f.filename
        ym = _parse_year_month_from_upload_filename(original_name)
        original_path = REPORT_DATA_DIR / original_name

        if ym:
            year, month = ym
            yy2 = year % 100
            report_stem = f"{yy2:02d}년_{month:02d}월_결산보고서_통합"
        else:
            stem = Path(original_name).stem
            if "결산보고서_back_data" in stem:
                report_stem = stem.replace("결산보고서_back_data", "결산보고서_통합")
            elif "back_data" in stem:
                report_stem = stem.replace("back_data", "결산보고서_통합")
            else:
                report_stem = stem + "_결산보고서_통합"

        report_path = REPORT_DATA_DIR / f"{report_stem}.xlsx"

        if ym:
            year, month = ym
            existing = _find_existing_pl_files_for_period(year, month)
            has_existing = bool(existing["reports"] or existing["backs"] or report_path.exists() or original_path.exists())

            if has_existing and not force:
                return jsonify(
                    {
                        "status": "ok",
                        "need_confirm": True,
                        "message": "이미 해당 연도와 월에 해당하는 데이터가 있습니다. 다시 저장할까요[OK]",
                        "year": year,
                        "month": month,
                    }
                )

            if force:
                for p in existing["reports"] + existing["backs"]:
                    try:
                        p.unlink()
                    except Exception:
                        pass
                if original_path.exists():
                    try:
                        original_path.unlink()
                    except Exception:
                        pass
                if report_path.exists():
                    try:
                        report_path.unlink()
                    except Exception:
                        pass

        else:
            if report_path.exists() and not force:
                return jsonify(
                    {"status": "ok", "need_confirm": True, "message": "이미 해당 연도와 월에 해당하는 데이터가 있습니다. 다시 저장할까요[OK]"}
                )
            if force:
                if original_path.exists():
                    try:
                        original_path.unlink()
                    except Exception:
                        pass
                if report_path.exists():
                    try:
                        report_path.unlink()
                    except Exception:
                        pass

        f.save(str(original_path))

        try:
            df = generate_pl_report_df(back_data_file=str(original_path))
        except TypeError:
            df = generate_pl_report_df()

        df.to_excel(report_path, sheet_name="보고서", index=False)

        return jsonify(
            {"status": "ok", "overwritten": bool(force), "back_data_file": str(original_path), "report_file": str(report_path)}
        )

    except Exception as e:
        print("[ERROR] /api/pl-report/back-data:", e)
        return jsonify({"error": str(e)}), 500


@app.route("/api/pl-report/periods", methods=["GET"])
def get_pl_report_periods():
    try:
        REPORT_DATA_DIR.mkdir(parents=True, exist_ok=True)

        periods: Dict[Tuple[int, int], Dict[str, Any]] = {}

        for path in REPORT_DATA_DIR.glob("*결산보고서_통합*.xlsx"):
            parsed = _parse_year_month_from_report_filename(path)
            if not parsed:
                continue
            year, month = parsed
            key = (year, month)
            if key not in periods:
                yy2 = year % 100
                label = f"{yy2:02d}년 {month:02d}월"
                periods[key] = {"year": year, "month": month, "year2": yy2, "month2": month, "label": label}

        sorted_periods = [periods[k] for k in sorted(periods.keys(), key=lambda x: (x[0], x[1]))]
        return jsonify({"periods": sorted_periods})

    except Exception as e:
        print("[ERROR] /api/pl-report/periods:", e)
        return jsonify({"error": str(e)}), 500


@app.route("/api/pl-cause/periods", methods=["GET"])
def get_pl_cause_periods():
    try:
        periods = list_available_periods()
        return jsonify({"periods": periods})
    except Exception as e:
        print("[ERROR] /api/pl-cause/periods:", e)
        return jsonify({"error": str(e)}), 500


@app.route("/api/pl-cause", methods=["GET"])
def get_pl_cause():
    try:
        year = request.args.get("year", type=int)
        month = request.args.get("month", type=int)

        if not year or not month:
            return jsonify({"error": "year, month 쿼리 파라미터가 필요합니다."}), 400

        ym = year * 100 + month
        result = analyze_pl_cause(ym)
        return jsonify(result)

    except ValueError as ve:
        return jsonify({"error": str(ve)}), 400
    except Exception as e:
        print("[ERROR] /api/pl-cause:", e)
        return jsonify({"error": str(e)}), 500


@app.route("/api/pl-report", methods=["GET"])
def get_pl_report():
    try:
        REPORT_DATA_DIR.mkdir(parents=True, exist_ok=True)

        year_param = request.args.get("year")
        month_param = request.args.get("month")

        candidates: List[Path] = []

        if year_param and month_param:
            try:
                year = int(year_param)
                month = int(month_param)
            except ValueError:
                return jsonify({"error": "year, month 파라미터는 정수여야 합니다."}), 400

            if not (1 <= month <= 12):
                return jsonify({"error": "month 파라미터는 1~12 사이여야 합니다."}), 400

            yy2 = year % 100
            pattern = f"{yy2:02d}년_{month:02d}월*결산보고서_통합*.xlsx"
            candidates = sorted(REPORT_DATA_DIR.glob(pattern), key=lambda p: p.stat().st_mtime, reverse=True)

            if not candidates:
                return jsonify({"error": f"요청한 연도/월({year}-{month:02d})의 PL Report 파일을 찾을 수 없습니다."}), 404
        else:
            candidates = sorted(REPORT_DATA_DIR.glob("*결산보고서_통합*.xlsx"), key=lambda p: p.stat().st_mtime, reverse=True)

        if candidates:
            latest_path = candidates[0]
            df = pd.read_excel(latest_path, sheet_name="보고서")
            rows = df.to_dict(orient="records")
            return jsonify({"rows": rows, "filename": latest_path.name})

        cache_path = get_cache_path("pl_report_df.pkl")
        if os.path.exists(cache_path):
            try:
                df = pd.read_pickle(cache_path)
                rows = df.to_dict(orient="records")
                return jsonify({"rows": rows, "filename": "pl_report_df.pkl"})
            except Exception as e:
                print("[/api/pl-report] cache load error, 재계산:", e)

        try:
            df = generate_pl_report_df(back_data_file=str(BACKDATA_EXCEL_PATH))
        except TypeError:
            df = generate_pl_report_df()

        try:
            df.to_pickle(cache_path)
        except Exception:
            pass

        rows = df.to_dict(orient="records")
        return jsonify({"rows": rows, "filename": "generated_from_backdata"})

    except Exception as e:
        print("[ERROR] /api/pl-report:", e)
        return jsonify({"error": str(e)}), 500


# =====================================================
# Topic4: 최신 결산 반영 + 재학습 (백그라운드)
# =====================================================
_topic4_state = {
    "running": False,
    "step": "idle",
    "started_at": None,
    "finished_at": None,
    "ok": None,
    "error": None,
    "detail": None,
}
_topic4_lock = threading.Lock()


def _topic4_run_sync_and_retrain():
    global forecast_payload

    with _topic4_lock:
        _topic4_state.update(
            {
                "running": True,
                "step": "update_excel",
                "started_at": datetime.now().isoformat(timespec="seconds"),
                "finished_at": None,
                "ok": None,
                "error": None,
                "detail": None,
            }
        )

    try:
        update_script = str(BASE_DIR / "update_forecast_data.py")
        proc = subprocess.run(
            [sys.executable, update_script],
            cwd=str(BASE_DIR),
            capture_output=True,
            text=True,
        )

        if proc.returncode != 0:
            raise RuntimeError(
                "[주제4] update_forecast_data.py 실패\n"
                f"STDOUT:\n{(proc.stdout or '')[-2000:]}\n"
                f"STDERR:\n{(proc.stderr or '')[-2000:]}"
            )

        with _topic4_lock:
            _topic4_state["detail"] = {"update_stdout": (proc.stdout or "")[-3000:]}

        with _topic4_lock:
            _topic4_state["step"] = "train_prophet"

        trained = train_prophet_models(test_horizon=6)
        forecast_payload = trained if trained is not None else load_or_train()

        with _topic4_lock:
            _topic4_state.update(
                {
                    "running": False,
                    "step": "done",
                    "finished_at": datetime.now().isoformat(timespec="seconds"),
                    "ok": True,
                }
            )

    except Exception as e:
        with _topic4_lock:
            _topic4_state.update(
                {
                    "running": False,
                    "step": "failed",
                    "finished_at": datetime.now().isoformat(timespec="seconds"),
                    "ok": False,
                    "error": str(e),
                    "detail": {"trace": traceback.format_exc()[-5000:]},
                }
            )


def _topic4_start_background_job():
    with _topic4_lock:
        if _topic4_state["running"]:
            return {"ok": True, "already_running": True, **_topic4_state}

        t = threading.Thread(target=_topic4_run_sync_and_retrain, daemon=True)
        t.start()
        return {"ok": True, "started": True, **_topic4_state}


@app.route("/api/topic4/sync-and-retrain", methods=["POST"])
def topic4_sync_and_retrain():
    payload = _topic4_start_background_job()
    return jsonify(payload), 200


@app.route("/api/topic4/sync-and-retrain/status", methods=["GET"])
def topic4_sync_and_retrain_status():
    with _topic4_lock:
        return jsonify({"ok": True, **_topic4_state}), 200


@app.route("/api/closing/sync-and-retrain", methods=["POST"])
def closing_sync_and_retrain_alias():
    payload = _topic4_start_background_job()
    return jsonify(payload), 200


@app.route("/api/closing/sync-and-retrain/status", methods=["GET"])
def closing_sync_and_retrain_status_alias():
    with _topic4_lock:
        return jsonify({"ok": True, **_topic4_state}), 200


@app.route("/api/closing/forecast", methods=["POST"])
def api_closing_forecast():
    try:
        body = request.get_json(silent=True) or {}
        months = _safe_int(body.get("months", 12), 12, min_value=1, max_value=120)
        raw_scenario = body.get("scenario", {}) or {}

        preds = forecast_next_n(
            forecast_payload,
            n=months,
            scenario=raw_scenario if raw_scenario else None,
        )
        history_payload = get_forecast_history_series(months=36)
        return jsonify({"ok": True, "months": months, "predictions": preds, "scenario": raw_scenario, "history": history_payload, }), 200

    except Exception as e:
        print("[/api/closing/forecast] error:", e)
        traceback.print_exc()
        return jsonify({"ok": False, "error": str(e)}), 500


def test_db_connection():
    if not USE_DB_AUTH:
        print("[DB TEST] 데모 모드(USE_DB_AUTH=False) → DB 연결 테스트 스킵")
        return

    conn = None
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT 1 AS ok")
            row = cur.fetchone()
            print("[DB TEST] 연결 성공:", row)
    except Exception as e:
        print("[DB TEST] 연결 실패:", e)
    finally:
        try:
            if conn:
                conn.close()
        except Exception:
            pass



@app.route("/")
@app.route("/<path:path>")
def serve_react(path="index.html"):
    if path.startswith("api"):
        return "Not Found", 404

    file_path = os.path.join(app.static_folder, path)
    if path != "" and os.path.exists(file_path):
        return send_from_directory(app.static_folder, path)

    return send_from_directory(app.static_folder, "index.html")

# =====================================================
# ✅ Forecast: 과거(실적) 시계열 추출 유틸 + API
# =====================================================
def _coerce_to_datetime(s):
    try:
        return pd.to_datetime(s)
    except Exception:
        return pd.NaT

def _to_ym_str(dt):
    if dt is None or pd.isna(dt):
        return None
    try:
        return pd.to_datetime(dt).strftime("%Y-%m")
    except Exception:
        return None

def _extract_series_from_payload(payload) -> Dict[str, pd.DataFrame]:
    """
    payload 내부에서 (ds/date/year_month + 값) 형태의 히스토리를 최대한 추출.
    반환: { series_name: DataFrame(columns=["ym","value"]) }
    """
    out: Dict[str, pd.DataFrame] = {}

    def _df_to_series(df: pd.DataFrame, prefix: str = ""):
        if df is None or df.empty:
            return

        cols = list(df.columns)
        # 날짜 컬럼 후보
        date_col = None
        for c in ["ds", "date", "datetime", "year_month", "ym", "month"]:
            if c in cols:
                date_col = c
                break
        if date_col is None:
            return

        tmp = df.copy()

        # ym 만들기
        if date_col in ("year_month", "ym"):
            tmp["ym"] = tmp[date_col].astype(str)
        else:
            tmp["_dt"] = tmp[date_col].apply(_coerce_to_datetime)
            tmp["ym"] = tmp["_dt"].apply(_to_ym_str)

        tmp = tmp.dropna(subset=["ym"])
        tmp = tmp.sort_values("ym")

        # 값 컬럼 후보: 숫자 컬럼들
        num_cols = []
        for c in cols:
            if c in [date_col, "ym", "_dt"]:
                continue
            if pd.api.types.is_numeric_dtype(tmp[c]):
                num_cols.append(c)

        # Prophet 단일 타깃이면 보통 y / value / actual 같은 컬럼이 있음
        preferred = [c for c in ["y", "value", "actual", "amount"] if c in num_cols]
        if preferred:
            num_cols = preferred + [c for c in num_cols if c not in preferred]

        # 너무 많으면 앞쪽 몇 개만(프론트에서 선택 가능)
        for c in num_cols[:20]:
            name = f"{prefix}{c}" if prefix else c
            s = tmp[["ym", c]].rename(columns={c: "value"}).copy()
            # 같은 월 중복이면 합계(혹은 평균이 맞으면 mean으로 바꿔도 됨)
            s["value"] = pd.to_numeric(s["value"], errors="coerce")
            s = s.dropna(subset=["value"])
            s = s.groupby("ym", as_index=False)["value"].sum()
            out[name] = s

    # 1) payload 자체가 DataFrame인 케이스
    if isinstance(payload, pd.DataFrame):
        _df_to_series(payload, prefix="")
        return out

    # 2) payload가 dict인 케이스(대부분)
    if isinstance(payload, dict):
        # 흔한 키 후보들
        for k in ["history", "train_df", "train", "df", "data", "actuals"]:
            v = payload.get(k)
            if isinstance(v, pd.DataFrame):
                _df_to_series(v, prefix="")
            elif isinstance(v, dict):
                # dict of dfs
                for kk, vv in v.items():
                    if isinstance(vv, pd.DataFrame):
                        _df_to_series(vv, prefix=f"{kk}::")

        # models/series 형태로 들어있는 경우
        v = payload.get("series")
        if isinstance(v, dict):
            for kk, vv in v.items():
                if isinstance(vv, pd.DataFrame):
                    _df_to_series(vv, prefix=f"{kk}::")

    return out

def get_forecast_history_series(months: int = 36) -> Dict[str, Any]:
    """
    app 시작 시 로딩된 forecast_payload에서 가능한 히스토리를 추출해 반환
    """
    series_map = _extract_series_from_payload(forecast_payload)

    # 아무것도 못 찾으면 빈 값
    if not series_map:
        return {"ok": True, "series_names": [], "default_series": None, "rows": []}

    # default: 첫 번째 시리즈
    series_names = sorted(series_map.keys())
    default_series = series_names[0]

    # months 컷
    def _tail(df):
        if df is None or df.empty:
            return []
        dd = df.copy().sort_values("ym")
        if months and months > 0:
            dd = dd.tail(int(months))
        return dd.to_dict(orient="records")

    return {
        "ok": True,
        "series_names": series_names,
        "default_series": default_series,
        "series_map": {k: _tail(v) for k, v in series_map.items()},
    }


@app.route("/api/closing/history", methods=["GET"])
def api_closing_history():
    """
    ✅ 과거(실적) 시계열 제공
    - months: 최근 N개월만(기본 36)
    - series: 특정 시리즈만 받고 싶으면(프론트 드롭다운용)
    """
    try:
        months = request.args.get("months", default=36, type=int)
        series = (request.args.get("series") or "").strip()

        payload = get_forecast_history_series(months=months)
        if not payload.get("series_map"):
            return jsonify(payload), 200

        if series:
            # 요청한 시리즈만 반환
            rows = payload["series_map"].get(series, [])
            return jsonify(
                {
                    "ok": True,
                    "series_names": payload["series_names"],
                    "default_series": payload["default_series"],
                    "selected_series": series,
                    "rows": rows,
                }
            ), 200

        # series 지정 없으면 전체 맵 반환(프론트에서 선택 가능)
        return jsonify(payload), 200

    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500



# =====================================================
# FX / Tariff External APIs
# =====================================================
_DEFAULT_FX_FILE = BASE_DIR / "usdkrw_5y_actual.xlsx"

@app.route("/api/external/fx/forecast", methods=["GET", "OPTIONS"])
def api_external_fx_forecast():
    # CORS preflight
    if request.method == "OPTIONS":
        return ("", 204)

    try:
        months = int(request.args.get("months", "12"))
        months = max(1, min(120, months))
    except Exception:
        months = 12

    fx_file = (request.args.get("file", "") or "").strip()
    fx_path = Path(fx_file) if fx_file else _DEFAULT_FX_FILE
    if not fx_path.is_absolute():
        fx_path = (BASE_DIR / fx_path).resolve()
    if not fx_path.exists():
        return jsonify({"ok": False, "error": f"환율 파일을 찾을 수 없습니다: {fx_path}"}), 400

    try:
        fc = FxEnsembleForecaster(str(fx_path)).forecast(months=months)
        return jsonify({"ok": True, "rates": fc.rates or {}, "meta": fc.meta or {}})
    except Exception as e:
        print("[/api/external/fx/forecast] error:", e)
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/external/fx-tariff/v2/options", methods=["POST"])
def api_fx_tariff_v2_options():
    try:
        if "file" not in request.files:
            return jsonify({"ok": False, "error": "file 업로드가 필요합니다"}), 400
        b = request.files["file"].read()
        an = FxTariffAnalyzer(b)
        return jsonify({"ok": True, "options": an.options()})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 400

@app.route("/api/external/fx-tariff/v2/analyze", methods=["POST"])
def api_fx_tariff_v2_analyze():
    try:
        if "file" not in request.files:
            return jsonify({"ok": False, "error": "file 업로드가 필요합니다"}), 400
        b = request.files["file"].read()
        an = FxTariffAnalyzer(b)

        plan_fx = float(request.form.get("plan_fx", "1350") or 1350)
        tariff_pct = float(request.form.get("tariff_pct", "0") or 0)
        fx_mode = (request.form.get("fx_mode", "pct") or "pct").strip()
        fx_change_pct = float(request.form.get("fx_change_pct", "0") or 0)
        try:
            forecast_months = int(request.form.get("forecast_months", "").strip() or 0)
        except Exception:
            forecast_months = 0
        if forecast_months <= 0:
            forecast_months = None
        else:
            forecast_months = max(1, min(120, forecast_months))

        car = (request.form.get("car", "") or "").strip()
        group = (request.form.get("group", "") or "").strip()
        market = (request.form.get("market", "") or "").strip()
        q = (request.form.get("q", "") or "").strip()

        cost_rate_pct_raw = request.form.get("cost_rate_pct", "")
        cost_rate_pct = None if cost_rate_pct_raw is None or str(cost_rate_pct_raw).strip()=="" else float(cost_rate_pct_raw)

        # 수동 환율 입력(사용자가 직접 입력한 예측 환율 맵)
        manual_fx_raw = request.form.get("manual_fx_rates", "")
        manual_fx_rates = None
        if manual_fx_raw:
            try:
                parsed = json.loads(manual_fx_raw)
                if isinstance(parsed, dict):
                    manual_fx_rates = {str(k): float(v) for k, v in parsed.items() if v is not None}
            except Exception:
                manual_fx_rates = None

        # 사용자 정의 EBIT 시나리오 입력(선택)
        def _parse(name, default):
            try:
                return float(request.form.get(name, default) or default)
            except Exception:
                return float(default)
        scenario_best_exp_pct = _parse("scenario_best_exp_pct", 5.0)
        scenario_best_tariff_delta_pct = _parse("scenario_best_tariff_delta_pct", 0.0)
        scenario_worst_exp_pct = _parse("scenario_worst_exp_pct", -5.0)
        scenario_worst_tariff_delta_pct = _parse("scenario_worst_tariff_delta_pct", 5.0)

        forecast_rates = manual_fx_rates if manual_fx_rates else None
        if fx_mode == "auto" and forecast_rates is None and _DEFAULT_FX_FILE.exists():
            months = forecast_months or (len((an.options() or {}).get("months", [])) or 12)
            fc = FxEnsembleForecaster(str(_DEFAULT_FX_FILE)).forecast(months=months)
            forecast_rates = fc.rates

        out = an.analyze(
            plan_fx=plan_fx,
            tariff_pct=tariff_pct,
            fx_mode=fx_mode,
            fx_change_pct=fx_change_pct,
            forecast_rates=forecast_rates,
            car=car,
            group=group,
            market=market,
            q=q,
            cost_rate_pct=cost_rate_pct,
            limit_rows=4000,
            forecast_months=forecast_months,
            scenario_best_exp_pct=scenario_best_exp_pct,
            scenario_best_tariff_delta_pct=scenario_best_tariff_delta_pct,
            scenario_worst_exp_pct=scenario_worst_exp_pct,
            scenario_worst_tariff_delta_pct=scenario_worst_tariff_delta_pct,
        )
        return jsonify(out)
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 400

if __name__ == "__main__":
    print("[INFO] Flask 서버 시작")
    test_db_connection()
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=False)
