# flaskbackend/update_forecast_data.py
"""
report_data 폴더의 결산보고서(예: 25년_12월_결산보고서_통합.xlsx)를 읽어서,
- 엑셀의 '항목' 열(또는 항목명) + '전체' 열(또는 금액열)을 기반으로
- predict_data/주제4_5년치_데이터.xlsx 의 컬럼과 매칭되는 것들을 찾아
- (연도, 월) 행에 값 주입(덮어쓰기/추가)

★ 조건: 보고서 파일의 (연도,월)이 "현재 시스템 연/월"과 정확히 일치할 때만 업데이트

★ 추가: 운반비는 보고서에 2줄(원가/판관비) 존재 → 등장 순서로 분리 주입
  - 1번째 운반비 -> 운반비_원가
  - 2번째 운반비 -> 운반비_판관비
"""

import os
import re
from typing import Optional, Tuple, Dict

import pandas as pd
from pandas.api.types import is_numeric_dtype
from datetime import datetime

# ---------------------------------------------------------------------
# 경로 설정
# ---------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
REPORT_DIR = os.path.join(BASE_DIR, "report_data")
FIVE_YEAR_PATH = os.path.join(BASE_DIR, "predict_data", "주제4_5년치_데이터.xlsx")

# 파일명 패턴: 25년_12월_결산보고서_통합.xlsx
REPORT_PATTERN = re.compile(r"(\d{2})년_(\d{1,2})월_결산보고서_통합\.xlsx")

# ---------------------------------------------------------------------
# 같은 항목이 여러 줄로 존재할 때 "등장 순서"로 분리 매핑하는 규칙
# ---------------------------------------------------------------------
SPLIT_DUPLICATES = {
    "운반비": ["운반비_원가", "운반비_판관비"],
}


# ---------------------------------------------------------------------
# 유틸
# ---------------------------------------------------------------------
def parse_year_month_from_filename(filename: str) -> Optional[Tuple[int, int]]:
    m = REPORT_PATTERN.search(filename)
    if not m:
        return None
    yy = int(m.group(1))
    mm = int(m.group(2))
    return 2000 + yy, mm


def find_latest_report_file() -> Optional[str]:
    """report_data 폴더에서 (연,월)이 가장 최신인 결산보고서 파일 경로 반환"""
    if not os.path.isdir(REPORT_DIR):
        return None

    latest_path = None
    latest_ym: Optional[Tuple[int, int]] = None

    for fname in os.listdir(REPORT_DIR):
        parsed = parse_year_month_from_filename(fname)
        if not parsed:
            continue
        ym = parsed
        if latest_ym is None or ym > latest_ym:
            latest_ym = ym
            latest_path = os.path.join(REPORT_DIR, fname)

    return latest_path


def _norm_name(x: str) -> str:
    """
    항목/컬럼 매칭용 정규화:
    - 공백, 하이픈, 슬래시, 괄호, 밑줄, 점 등 제거
    - 소문자
    """
    s = str(x)
    s = re.sub(r"[\s\-_/\(\)\[\]\{\}·\.]", "", s)
    return s.lower()


def _pick_item_col(df: pd.DataFrame) -> str:
    for c in ["항목", "항목명", "계정", "계정명"]:
        if c in df.columns:
            return c
    raise KeyError(f"'항목' 컬럼을 찾을 수 없습니다. cols={list(df.columns)}")


def _pick_amount_col(df: pd.DataFrame) -> str:
    # 1) 우선순위 후보
    candidates = ["전체", "금액", "금액(원)", "당기금액", "당기금액(원)", "실적", "실적(원)"]
    for c in candidates:
        if c in df.columns:
            return c

    # 2) 숫자형 컬럼 중 키워드 포함
    numeric_cols = [c for c in df.columns if is_numeric_dtype(df[c])]
    preferred_keywords = ["전체", "당기", "금액", "실적"]
    for c in numeric_cols:
        name = str(c)
        if any(k in name for k in preferred_keywords):
            return c

    # 3) 그래도 없으면 첫 숫자형 컬럼
    if numeric_cols:
        return numeric_cols[0]

    raise KeyError(f"금액으로 쓸 숫자형 컬럼을 찾을 수 없습니다. cols={list(df.columns)}")


def _build_report_value_map(report_path: str) -> Tuple[int, int, Dict[str, float]]:
    """
    report 엑셀에서
    - 항목(행) -> 전체(값) dict 생성
    - 단, SPLIT_DUPLICATES에 있는 항목은 '등장 순서'로 분리 매핑
      (예: 운반비 1번째 -> 운반비_원가, 2번째 -> 운반비_판관비)
    """
    basename = os.path.basename(report_path)
    parsed = parse_year_month_from_filename(basename)
    if not parsed:
        raise ValueError(f"파일명에서 연/월을 파싱할 수 없습니다: {basename}")
    year, month = parsed

    df = pd.read_excel(report_path)

    col_item = _pick_item_col(df)
    col_amount = _pick_amount_col(df)

    value_map: Dict[str, float] = {}
    seen_count: Dict[str, int] = {}  # 항목별 등장 횟수(운반비 등)

    for _, row in df.iterrows():
        item = row.get(col_item, None)
        if pd.isna(item):
            continue

        item_raw = str(item).strip()
        item_key = _norm_name(item_raw)

        raw = row.get(col_amount, 0)
        if pd.isna(raw):
            val = 0.0
        else:
            try:
                val = float(raw)
            except Exception:
                val = 0.0

        # ✅ (1) 중복 분리 규칙 적용 (운반비 등)
        if item_raw in SPLIT_DUPLICATES:
            idx = seen_count.get(item_raw, 0)  # 0부터 시작
            targets = SPLIT_DUPLICATES[item_raw]

            if idx < len(targets):
                target_col = targets[idx]
                target_key = _norm_name(target_col)
                value_map[target_key] = val
            else:
                value_map[item_key] = value_map.get(item_key, 0.0) + val

            seen_count[item_raw] = idx + 1
            continue

        # ✅ (2) 일반 항목: 중복이면 합산
        value_map[item_key] = value_map.get(item_key, 0.0) + val

    return year, month, value_map


def update_5year_data_by_item_mapping(
    report_path: str,
    five_year_path: str = FIVE_YEAR_PATH,
    *,
    only_if_current_month: bool = True,
) -> bool:
    """
    1) report에서 (항목->전체값) dict 생성
    2) five_year 엑셀 컬럼명과 norm 매칭해서 값 주입
    3) (연도,월) 행이 있으면 덮어쓰기, 없으면 새 행 추가

    반환: 업데이트 수행하면 True, 조건 불일치로 스킵이면 False
    """
    if not os.path.isfile(report_path):
        raise FileNotFoundError(f"보고서 파일을 찾을 수 없습니다: {report_path}")
    if not os.path.isfile(five_year_path):
        raise FileNotFoundError(f"5년치 데이터 파일을 찾을 수 없습니다: {five_year_path}")

    year, month, report_map = _build_report_value_map(report_path)

    # ✅ 현재 연/월 일치할 때만 업데이트
    if only_if_current_month:
        now = datetime.now()
        if not (now.year == year and now.month == month):
            print(
                f"[SKIP] 보고서({year}-{month:02d})가 현재({now.year}-{now.month:02d})와 달라 업데이트하지 않음."
            )
            return False

    df_5 = pd.read_excel(five_year_path)

    # five-year 컬럼 norm -> 실제 컬럼명 매핑
    col_norm_to_col = {_norm_name(c): c for c in df_5.columns}

    # (연도,월) 행 찾기 / 없으면 추가
    if "연도" not in df_5.columns or "월" not in df_5.columns:
        raise KeyError("5년치 데이터에는 최소 '연도', '월' 컬럼이 있어야 합니다.")

    mask = (df_5["연도"] == year) & (df_5["월"] == month)
    if mask.any():
        row_idx = df_5.index[mask][0]
    else:
        new_row = {c: None for c in df_5.columns}
        new_row["연도"] = year
        new_row["월"] = month
        df_5 = pd.concat([df_5, pd.DataFrame([new_row])], ignore_index=True)
        row_idx = df_5.index[-1]

    updated_cols = 0
    missing_keys = []

    for item_key, val in report_map.items():
        if item_key in col_norm_to_col:
            target_col = col_norm_to_col[item_key]
            df_5.at[row_idx, target_col] = val
            updated_cols += 1
        else:
            missing_keys.append(item_key)

    df_5 = df_5.sort_values(["연도", "월"]).reset_index(drop=True)
    df_5.to_excel(five_year_path, index=False)

    print(f"[OK] {year}-{month:02d} 업데이트 완료. 매핑된 컬럼 수: {updated_cols}")
    if missing_keys:
        sample = missing_keys[:20]
        print(f"[INFO] 5년치 파일에 컬럼이 없어 매핑 못한 항목(norm) 예시 {len(sample)}개: {sample}")

    return True


# ✅✅✅ 호환용 별칭(중요)
# app.py에서 예전 이름(update_5year_data)을 import 하더라도 ImportError 안 나게 함
def update_5year_data(*args, **kwargs):
    return update_5year_data_by_item_mapping(*args, **kwargs)


# ---------------------------------------------------------------------
# 단독 실행
# ---------------------------------------------------------------------
if __name__ == "__main__":
    latest = find_latest_report_file()
    if latest is None:
        print(f"[WARN] {REPORT_DIR} 에 결산보고서 파일이 없습니다.")
    else:
        update_5year_data_by_item_mapping(latest, only_if_current_month=True)
