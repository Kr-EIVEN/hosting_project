import warnings
warnings.filterwarnings("ignore")

import pandas as pd
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.neighbors import LocalOutlierFactor
from sklearn.preprocessing import StandardScaler
from typing import Union, IO, Optional


# ============================================================
# 1. 엑셀 파싱
# ============================================================

def _normalize_year_month(label):
    """
    '2024년 12월', '2025-01', 숫자 202412 등 다양한 형태를
    'YYYY-MM' 형태로 통일
    """
    if pd.isna(label):
        return None
    s = str(label).strip()
    if not s:
        return None

    # 이미 YYYY-MM 형태면 그대로 사용
    try:
        if len(s) == 7 and s[4] == "-":
            int(s[:4])
            int(s[5:])
            return s
    except Exception:
        pass

    # "2024년 12월" / "2024 12" 등 숫자만 뽑아서 처리
    digits = "".join(ch if ch.isdigit() else " " for ch in s).split()
    if len(digits) >= 2:
        year = int(digits[0])
        month = int(digits[1])
        return f"{year:04d}-{month:02d}"

    # 마지막 fallback
    try:
        year = int(s[:4])
        month = int(s[-2:])
        return f"{year:04d}-{month:02d}"
    except Exception:
        return None


def _ensure_series(obj, length):
    """
    DataFrame/Series/ndarray 어떤 형태가 와도
    길이 `length`의 Series 한 개로 맞춰주는 유틸.
    """
    if isinstance(obj, pd.DataFrame):
        ser = obj.iloc[:, 0]
    else:
        ser = pd.Series(obj)

    ser = ser.reset_index(drop=True)

    if len(ser) < length:
        ser = ser.reindex(range(length))
    elif len(ser) > length:
        ser = ser.iloc[:length]

    return ser


def parse_cost_center_excel(file_source: Union[str, IO, bytes]):
    """
    코스트센터별 2년치 관리회계 엑셀을 Long 형태로 파싱

    - file_source: 파일 경로(str) 또는 BytesIO/파일 객체/bytes
      (Flask에서 업로드 받은 파일을 BytesIO로 넘겨도 됨)

    반환 컬럼:
      - cost_center, cc_name, year_month, year, month,
        account_code, account_name, amount, cost_nature(선택)
    """
    # bytes면 BytesIO로 래핑
    if isinstance(file_source, (bytes, bytearray)):
        file_source = IO[bytes]  # type hint용, 실제 런타임은 아래에서 처리
        file_source = pd.io.common.BytesIO(file_source)

    raw = pd.read_excel(file_source, header=None)

    # 2행: 월 정보 / 3행: 필드명
    month_row = raw.iloc[2].copy()
    field_row = raw.iloc[3].copy()

    # 앞 두 칼럼은 메타 정보 (코스트센터 코드 / 명)
    month_row.iloc[0] = "meta"
    month_row.iloc[1] = "meta"

    field_row.iloc[0] = "코드"
    field_row.iloc[1] = "명"

    # 월 정보 NaN -> 직전 값으로 채우기
    current_month = None
    for i in range(2, len(month_row)):
        if pd.notna(month_row.iloc[i]) and str(month_row.iloc[i]).strip() != "":
            current_month = month_row.iloc[i]
        else:
            month_row.iloc[i] = current_month

    # MultiIndex 컬럼
    cols = pd.MultiIndex.from_arrays([month_row, field_row])
    data = raw.iloc[4:].copy()
    data.columns = cols

    # 메타 컬럼
    cost_center_col = ("meta", "코드")
    cc_name_col     = ("meta", "명")

    if cost_center_col not in data.columns or cc_name_col not in data.columns:
        raise KeyError("코스트센터 코드/명 컬럼을 찾지 못했습니다. 엑셀 헤더를 확인하세요.")

    # 코스트센터 / 부서명 Series로 변환
    cost_center_raw = data.loc[:, cost_center_col]
    cc_name_raw     = data.loc[:, cc_name_col]

    if isinstance(cost_center_raw, pd.DataFrame):
        cost_center_raw = cost_center_raw.iloc[:, 0]
    if isinstance(cc_name_raw, pd.DataFrame):
        cc_name_raw = cc_name_raw.iloc[:, 0]

    cost_centers = cost_center_raw.astype(str).str.strip().reset_index(drop=True)
    cc_names     = cc_name_raw.astype(str).str.strip().reset_index(drop=True)
    n_rows       = len(cost_centers)

    records = []

    # meta 레벨에 비용 성질이 있을 수도 있음
    cost_nature_meta_col = None
    for col in data.columns:
        if col[0] == "meta" and (
            "성질" in str(col[1]) or
            "비용성질" in str(col[1]) or
            "cost_nature" in str(col[1]).lower()
        ):
            cost_nature_meta_col = col
            break

    # 월 라벨(문자/숫자 섞여도 처리)
    raw_months = []
    for m in month_row:
        if m in ["meta", None]:
            continue
        if isinstance(m, float) and np.isnan(m):
            continue
        raw_months.append(m)

    unique_months = sorted(set(raw_months), key=lambda x: str(x))

    def _guess_cols(month_slice):
        """
        계정코드 / 계정명 / 금액 컬럼 이름 자동 추정
        """
        cols_ = list(month_slice.columns)

        def pick(substrings, default_idx=None):
            for c in cols_:
                s = str(c)
                if any(sub in s for sub in substrings):
                    return c
            if default_idx is not None and default_idx < len(cols_):
                return cols_[default_idx]
            return cols_[-1]

        code_col = pick(["계정코드", "코드"], default_idx=0)
        name_col = pick(["계정명", "계정 명", "명", "이름"], default_idx=1 if len(cols_) > 1 else 0)
        amt_col  = pick(["실제원가", "금액", "원가"], default_idx=len(cols_) - 1)
        return code_col, name_col, amt_col

    for m in unique_months:
        ym_norm = _normalize_year_month(m)
        if ym_norm is None:
            continue

        month_slice = data.loc[:, m]

        needed = ["계정코드", "계정명", "실제원가"]
        if all(col in month_slice.columns for col in needed):
            code_col = "계정코드"
            name_col = "계정명"
            amt_col  = "실제원가"
        else:
            code_col, name_col, amt_col = _guess_cols(month_slice)

        # ---- 전부 1차원 Series로 강제 ----
        account_codes = _ensure_series(month_slice[code_col], n_rows)
        account_names = _ensure_series(month_slice[name_col], n_rows)
        amounts       = _ensure_series(month_slice[amt_col],  n_rows)

        # 비용성질
        if any(("성질" in str(c)) or ("비용성질" in str(c)) or ("cost_nature" in str(c).lower())
               for c in month_slice.columns):
            cn_col = None
            for c in month_slice.columns:
                if ("성질" in str(c)) or ("비용성질" in str(c)) or ("cost_nature" in str(c).lower()):
                    cn_col = c
                    break
            cost_nature_series = _ensure_series(month_slice[cn_col], n_rows)
        elif cost_nature_meta_col is not None:
            cost_nature_series = _ensure_series(data[cost_nature_meta_col], n_rows)
        else:
            cost_nature_series = pd.Series([np.nan] * n_rows)

        tmp = pd.DataFrame(
            {
                "cost_center":  cost_centers.values,
                "cc_name":      cc_names.values,
                "year_month":   np.array([ym_norm] * n_rows),
                "account_code": account_codes.values,
                "account_name": account_names.values,
                "amount":       amounts.values,
                "cost_nature":  cost_nature_series.values,
            }
        )
        records.append(tmp)

    if not records:
        raise ValueError("월별 관리회계 데이터를 추출하지 못했습니다. 엑셀 구조를 다시 확인해 주세요.")

    df_long = pd.concat(records, ignore_index=True)

    # 숫자형 변환
    df_long["amount"] = pd.to_numeric(df_long["amount"], errors="coerce")

    # 비용 성질 정리
    df_long["cost_nature"] = df_long["cost_nature"].astype(str).str.strip()
    df_long.loc[df_long["cost_nature"].isin(["", "nan", "NaN"]), "cost_nature"] = np.nan

    # year, month 컬럼 생성 + 타입 안정화 (✅ app.py에서 int() 캐스팅 안전)
    df_long["year_month"] = df_long["year_month"].astype(str)
    df_long["year"] = pd.to_numeric(df_long["year_month"].str.slice(0, 4), errors="coerce").astype("Int64")
    df_long["month"] = pd.to_numeric(df_long["year_month"].str.slice(5, 7), errors="coerce").astype("Int64")

    return df_long


# ============================================================
# 2. 결측치(의도치 않은 공백) 후보 탐지
# ============================================================
def detect_potential_missing(
    df: pd.DataFrame,
    lookback_months: Optional[int] = None,   # ✅ app.py 호환
    lookback_short: int = 3,
    lookback_long: int = 12,
):
    """
    ✅ 누락(빈칸 NaN) 의심 플래그를 2개로 분리해서 생성
      - suspected_missing_3m : 직전 3개월이 모두 NaN이 아닐 때, 이번 달 NaN이면 True
      - suspected_missing_12m: 직전 12개월이 모두 NaN이 아닐 때, 이번 달 NaN이면 True
    (0은 NaN이 아니므로 '값이 있었다'로 간주됨)

    + 기존 호환용 suspected_missing = (3m OR 12m)

    ✅ 변경: lookback_months가 들어오면 lookback_short로 사용(기존 app.py 호출 방식 호환)
    """
    if lookback_months is not None:
        lookback_short = int(lookback_months)

    df = df.sort_values(["cost_center", "account_code", "year_month"]).copy()
    df["year_month"] = df["year_month"].astype(str)

    df["suspected_missing_3m"] = False
    df["suspected_missing_12m"] = False
    df["suspected_missing"] = False  # 호환용

    for (cc, acc), grp in df.groupby(["cost_center", "account_code"], dropna=False):
        grp = grp.sort_values("year_month")
        values = grp["amount"].to_numpy()
        idx = grp.index.to_numpy()

        for i in range(len(grp)):
            if not np.isnan(values[i]):
                continue

            start3 = max(0, i - lookback_short)
            prev3 = values[start3:i]
            if len(prev3) >= lookback_short and np.all(~np.isnan(prev3)):
                df.loc[idx[i], "suspected_missing_3m"] = True

            start12 = max(0, i - lookback_long)
            prev12 = values[start12:i]
            if len(prev12) >= lookback_long and np.all(~np.isnan(prev12)):
                df.loc[idx[i], "suspected_missing_12m"] = True

            if df.loc[idx[i], "suspected_missing_3m"] or df.loc[idx[i], "suspected_missing_12m"]:
                df.loc[idx[i], "suspected_missing"] = True

    return df


# ============================================================
# 3. 패턴/통계 피처 생성
# ============================================================
def build_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["year_month"] = df["year_month"].astype(str)

    df["amount_signed_log1p"] = np.sign(df["amount"]) * np.log1p(np.abs(df["amount"].fillna(0)))

    df = df.sort_values(["cost_center", "account_code", "year_month"])
    group_cols = ["cost_center", "account_code"]

    df["mean_12"] = df.groupby(group_cols)["amount"].transform("mean")
    df["std_12"]  = df.groupby(group_cols)["amount"].transform("std")
    df["cv_12"]   = df["std_12"] / (df["mean_12"].replace(0, np.nan)).abs()

    df["normal_upper"] = df["mean_12"] + 2 * df["std_12"]
    df["normal_lower"] = df["mean_12"] - 2 * df["std_12"]

    df["roll_mean_3"] = (
        df.groupby(group_cols)["amount"]
        .transform(lambda s: s.rolling(window=3, min_periods=2).mean())
    )
    df["roll_std_3"] = (
        df.groupby(group_cols)["amount"]
        .transform(lambda s: s.rolling(window=3, min_periods=2).std())
    )

    eps = 1e-6
    df["zscore_12"] = (df["amount"] - df["mean_12"]) / (df["std_12"].replace(0, np.nan) + eps)
    df["dev_3m"]    = (df["amount"] - df["roll_mean_3"]) / (df["roll_std_3"].replace(0, np.nan) + eps)

    df["prev_amount"] = df.groupby(group_cols)["amount"].shift(1)
    df["prev_diff_rate"] = (df["amount"] - df["prev_amount"]) / (df["prev_amount"] + 1e-6) * 100

    df["cost_nature"] = df["cost_nature"].astype(str)
    df["is_fixed"]    = df["cost_nature"].str.contains("고정", na=False).astype(int)
    df["is_variable"] = df["cost_nature"].str.contains("변동", na=False).astype(int)
    df["is_seasonal"] = df["cost_nature"].str.contains("계절|시즌", na=False).astype(int)

    nature_map = {}
    unique_natures = sorted(set(df["cost_nature"].dropna()))
    for i, v in enumerate(unique_natures):
        nature_map[v] = i + 1
    df["cost_nature_code"] = df["cost_nature"].map(nature_map).fillna(0).astype(int)

    return df


# ============================================================
# 4. 코스트센터 내 계정 상관관계 기반 피처
# ============================================================
def compute_corr_pairs(df: pd.DataFrame, corr_threshold=0.9) -> pd.DataFrame:
    df = df.copy()
    df["year_month"] = df["year_month"].astype(str)

    pair_info = {}

    for cc, grp in df.groupby("cost_center"):
        if grp["account_code"].nunique() < 2:
            continue

        pivot = grp.pivot_table(index="year_month", columns="account_code", values="amount")
        if pivot.shape[1] < 2:
            continue

        corr = pivot.corr()

        for acc in corr.columns:
            series = corr[acc].dropna()
            if acc in series.index:
                series = series.drop(acc)
            if series.empty:
                continue
            best_acc  = series.abs().idxmax()
            best_corr = series[best_acc]
            pair_info[(cc, acc)] = (best_acc, best_corr)

    df["corr_partner_acc"]  = None
    df["corr_partner_coef"] = np.nan
    for idx, row in df.iterrows():
        key = (row["cost_center"], row["account_code"])
        if key in pair_info:
            df.at[idx, "corr_partner_acc"]  = pair_info[key][0]
            df.at[idx, "corr_partner_coef"] = pair_info[key][1]

    df["corr_weight"] = df["corr_partner_coef"].abs()

    if "zscore_12" not in df.columns:
        df = build_features(df)

    tmp = df[["cost_center", "year_month", "account_code", "zscore_12"]].copy()
    tmp = tmp.rename(columns={"account_code": "partner_code", "zscore_12": "partner_zscore_12"})

    df = df.merge(
        tmp,
        left_on=["cost_center", "year_month", "corr_partner_acc"],
        right_on=["cost_center", "year_month", "partner_code"],
        how="left"
    )
    df.drop(columns=["partner_code"], inplace=True, errors="ignore")

    if "partner_zscore_12" not in df.columns:
        df["partner_zscore_12"] = np.nan

    df["sign_diff_with_partner"] = False
    cond = (
        (df["corr_weight"] >= corr_threshold) &
        (df["zscore_12"].abs() >= 1.5) &
        (df["partner_zscore_12"].abs() >= 1.5) &
        (np.sign(df["zscore_12"]) != np.sign(df["partner_zscore_12"]))
    )
    df.loc[cond.fillna(False), "sign_diff_with_partner"] = True

    return df


# ============================================================
# 5. IF + LOF 앙상블
# ============================================================
def run_ensemble_outlier(df: pd.DataFrame, contamination=0.05, random_state=42) -> pd.DataFrame:
    df = df.copy()

    feature_cols = [
        "amount_signed_log1p",
        "zscore_12",
        "dev_3m",
        "cv_12",
        "cost_nature_code",
        "is_fixed",
        "is_variable",
        "is_seasonal",
        "corr_weight",
    ]

    for col in feature_cols:
        if col not in df.columns:
            df[col] = 0.0

    X = df[feature_cols].fillna(0.0).values
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    iso = IsolationForest(
        n_estimators=300,
        max_samples="auto",
        contamination=contamination,
        random_state=random_state,
        n_jobs=-1
    )
    iso.fit(X_scaled)
    iso_scores = -iso.decision_function(X_scaled)

    lof = LocalOutlierFactor(
        n_neighbors=20,
        contamination=contamination,
        novelty=False,
        n_jobs=-1
    )
    lof.fit_predict(X_scaled)
    lof_scores_raw = lof.negative_outlier_factor_
    lof_scores = -(lof_scores_raw - lof_scores_raw.min()) / (
        lof_scores_raw.max() - lof_scores_raw.min() + 1e-6
    )

    final_score = 0.5 * iso_scores + 0.5 * lof_scores

    df["iso_score"]     = iso_scores
    df["lof_score"]     = lof_scores
    df["anomaly_score"] = final_score

    threshold = np.quantile(final_score, 1 - contamination)
    df["anomaly_flag"] = df["anomaly_score"] >= threshold

    return df


# ============================================================
# 6. 사람용 한글 설명
# ============================================================
def _format_won(x):
    try:
        return f"{int(round(float(x))):,}원"
    except Exception:
        return str(x)


def build_human_explanations(df: pd.DataFrame) -> pd.DataFrame:
    """
    ✅ 요구 반영:
    1) 결측 사유를 3개월/12개월로 분리해 각각 reason_kor에 출력
    2) 0원 이상치 사유에서 6개월 기준 제거, 3개월/12개월만 사용
    """
    df = df.copy()
    df["year_month"] = df["year_month"].astype(str)

    issue_types = []
    severities = []
    reasons = []
    reason_tags_all = []

    for _, row in df.iterrows():
        amt  = row.get("amount", np.nan)
        z    = row.get("zscore_12", np.nan)
        dev3 = row.get("dev_3m", np.nan)
        cv   = row.get("cv_12", np.nan)
        corr_w    = row.get("corr_weight", np.nan)
        sign_diff = bool(row.get("sign_diff_with_partner", False))
        suspected_missing = bool(row.get("suspected_missing", False))

        # ✅ 분리 플래그
        suspected_missing_3m = bool(row.get("suspected_missing_3m", False))
        suspected_missing_12m = bool(row.get("suspected_missing_12m", False))

        nature = str(row.get("cost_nature", "")).strip()
        partner_acc = row.get("corr_partner_acc", None)
        partner_z   = row.get("partner_zscore_12", np.nan)
        iso_s = row.get("iso_score", np.nan)
        lof_s = row.get("lof_score", np.nan)
        prev_amt = row.get("prev_amount", np.nan)
        prev_diff = row.get("prev_diff_rate", np.nan)
        mean_12 = row.get("mean_12", np.nan)
        roll_mean_3 = row.get("roll_mean_3", np.nan)

        issue_type = "정상"
        severity   = 1
        reason_list = []
        tags = []

        is_zero_like = False
        try:
            if pd.isna(amt) or float(amt) == 0.0:
                is_zero_like = True
        except Exception:
            is_zero_like = False

        # ======================================================
        # ✅ 0) 결측 의심 (3개월/12개월 사유 분리 출력)
        # ======================================================
        if suspected_missing and pd.isna(amt):
            issue_type = "결측 의심"
            severity = 4
            tags.append("결측 의심")

            # ✅ 3개월 / 12개월 각각 출력
            if suspected_missing_3m:
                reason_list.append(
                    "이번 달 금액이 공백(NaN)이며, 직전 3개월은 모두 값이 존재했습니다. (3개월 기준 누락 의심)"
                )
            if suspected_missing_12m:
                reason_list.append(
                    "이번 달 금액이 공백(NaN)이며, 직전 12개월은 모두 값이 존재했습니다. (12개월 기준 누락 의심)"
                )

            # 혹시 플래그가 둘 다 False인데 suspected_missing만 True인 예외 케이스 대비
            if not reason_list:
                reason_list.append(
                    "이번 달 금액이 공백(NaN)인데, 직전 기간에는 값이 계속 존재했습니다. 의도치 않은 누락 입력 가능성이 높습니다."
                )

            issue_types.append(issue_type)
            severities.append(severity)
            reasons.append(" / ".join(reason_list))
            reason_tags_all.append(tags)
            continue

        # ======================================================
        # 1) 0원 처리 (✅ 6개월 기준 제거, 3개월/12개월만 사용)
        # ======================================================
        cc_mask = (df["cost_center"] == row["cost_center"]) & (df["account_code"] == row["account_code"])
        hist_grp = df[cc_mask].sort_values("year_month")
        hist_before = hist_grp[hist_grp["year_month"] < row["year_month"]]
        past_vals = hist_before["amount"]
        past_non_nan = past_vals.dropna()
        total_past_months = len(past_non_nan)

        consec_zero_months = 0
        for v in reversed(past_non_nan.tolist()):
            try:
                if float(v) == 0.0:
                    consec_zero_months += 1
                else:
                    break
            except Exception:
                break

        last3 = past_vals.tail(3).dropna()
        zero3 = int((last3 == 0).sum()) if len(last3) > 0 else 0
        n3 = len(last3)

        # ✅ 12개월 기준 추가
        last12 = past_vals.tail(12).dropna()
        zero12 = int((last12 == 0).sum()) if len(last12) > 0 else 0
        n12 = len(last12)

        force_zero_anomaly = False

        if (not pd.isna(amt)) and is_zero_like:
            if total_past_months > 0 and past_non_nan.eq(0).all():
                tags.append("지속적 0원 패턴")
                msg = "과거에도 지속적으로 0원으로 발생한 계정입니다."
                msg_detail = f" 과거 {total_past_months}개월 동안 기록된 월은 모두 0원이었습니다."
                if consec_zero_months > 0:
                    msg_detail += f" 직전에는 {consec_zero_months}개월 연속 0원이 유지되었습니다."
                if n3 > 0:
                    msg_detail += f" 직전 3개월 기준으로는 {n3}개월 중 {zero3}개월이 0원이었습니다."
                if n12 > 0:
                    msg_detail += f" 직전 12개월 기준으로는 {n12}개월 중 {zero12}개월이 0원이었습니다."
                reason_list.append(msg + msg_detail)
            else:
                force_zero_anomaly = True
                tags.append("0원 이상치")
                msg = "과거에 금액이 존재했으나 이번 달은 0으로 처리되었습니다."
                msg_detail = ""
                if n3 > 0:
                    msg_detail += f" 직전 3개월 동안 {n3}개월 중 {zero3}개월만 0원이었고, 나머지는 금액이 발생했습니다."
                if n12 > 0:
                    msg_detail += f" 직전 12개월 기준으로는 {n12}개월 중 {zero12}개월이 0원이었습니다."
                if consec_zero_months > 0:
                    msg_detail += f" 이번 달 기준 직전 {consec_zero_months}개월은 연속 0원이었습니다."
                reason_list.append(msg + msg_detail)

        # ======================================================
        # 2) 이상치 의심
        # ======================================================
        anomaly_flag_base = bool(row.get("anomaly_flag", False))
        anomaly_flag = anomaly_flag_base or force_zero_anomaly

        high_z = pd.notna(z) and abs(z) >= 3.0
        high_dev3 = pd.notna(dev3) and abs(dev3) >= 2.0
        sign_diff_strong = sign_diff and pd.notna(corr_w) and corr_w >= 0.7

        if anomaly_flag or high_z or high_dev3 or sign_diff_strong:
            issue_type = "이상치 의심"
            severity = 3

            if force_zero_anomaly:
                severity = max(severity, 4)

            if anomaly_flag_base:
                severity += 1
            if pd.notna(z) and abs(z) >= 3.5:
                severity += 1
            if sign_diff_strong and pd.notna(corr_w) and corr_w >= 0.9:
                severity += 1
            severity = int(max(2, min(severity, 5)))

            if nature and nature != "nan":
                if "고정" in nature and pd.notna(z) and abs(z) >= 2.0:
                    tags.append("고정비 패턴 이탈")
                    reason_list.append(
                        f"[고정비]로 분류된 계정인데, 연간 평균 대비 금액이 크게 달라졌습니다 (z-score={z:.2f})."
                    )
                elif "변동" in nature and pd.notna(dev3) and abs(dev3) >= 2.0:
                    tags.append("변동비 단기 패턴 이탈")
                    reason_list.append(
                        f"[변동비] 계정이며, 최근 3개월 평균 대비 금액이 크게 튀었습니다 (dev_3m={dev3:.2f})."
                    )
                elif ("계절" in nature or "시즌" in nature) and pd.notna(z) and abs(z) >= 2.0:
                    tags.append("계절비 패턴 이탈")
                    reason_list.append(
                        f"[계절비] 성격의 계정인데, 계절 패턴 대비 크게 벗어난 수준입니다 (z-score={z:.2f})."
                    )

            if pd.notna(prev_amt) and not pd.isna(amt):
                if abs(prev_diff) >= 30.0:
                    direction = "증가" if prev_diff > 0 else "감소"
                    tags.append("전월 대비 급변동")
                    reason_list.append(
                        f"전월 금액 {_format_won(prev_amt)} 대비 이번 달 금액 {_format_won(amt)}가 "
                        f"{prev_diff:+.1f}% {direction}했습니다."
                    )

            if pd.notna(z) and abs(z) >= 2.0 and pd.notna(mean_12) and not pd.isna(amt):
                diff_rate = ((amt - mean_12) / (mean_12 + 1e-6)) * 100
                tags.append("연간 평균 대비 이탈")
                reason_list.append(
                    f"최근 12개월 평균 {_format_won(mean_12)} 대비 "
                    f"{diff_rate:+.1f}% 수준으로 {'높게' if diff_rate > 0 else '낮게'} 나타났습니다."
                )

            if pd.notna(dev3) and abs(dev3) >= 2.0 and pd.notna(roll_mean_3) and not pd.isna(amt):
                diff_rate_3 = ((amt - roll_mean_3) / (roll_mean_3 + 1e-6)) * 100
                tags.append("3개월 추세 대비 이탈")
                reason_list.append(
                    f"직전 3개월 평균 {_format_won(roll_mean_3)}와 비교해 "
                    f"{diff_rate_3:+.1f}% 수준으로 {'높게' if diff_rate_3 > 0 else '낮게'} 나타났습니다."
                )

            if sign_diff_strong and partner_acc is not None and pd.notna(partner_z):
                tags.append("상관 계정과 반대 움직임")
                reason_list.append(
                    f"같은 코스트센터 내에서 상관계수 {corr_w:.2f}로 함께 움직이던 계정({partner_acc})과 "
                    f"이번 달에는 반대 방향으로 움직였습니다 "
                    f"(당월 z-score={z:.2f}, 상대 계정 z-score={partner_z:.2f})."
                )

            if pd.notna(cv) and cv < 0.1 and pd.notna(z) and abs(z) >= 2.0:
                tags.append("저변동 계정의 이례적 변동")
                reason_list.append(
                    f"과거에는 월별 변동성이 거의 없는 계정(변동계수 {cv:.3f})인데, "
                    "이번 달에 예외적으로 큰 변동이 발생했습니다."
                )

            if anomaly_flag_base:
                tags.append("모델 이상치 탐지")
                reason_list.append(
                    "비지도 학습 기반 이상치 탐지 모델(IF/LOF 앙상블)이 "
                    f"패턴이 비정상적으로 멀리 떨어져 있다고 판단했습니다 "
                    f"(IF score={iso_s:.3f}, LOF score={lof_s:.3f})."
                )

            if not reason_list:
                tags.append("통계적 기준 이상")
                reason_list.append(
                    "평균, 표준편차, 전월·단기 변동, 상관관계 등 여러 통계 지표 기준으로 "
                    "이례적인 값으로 판단됩니다."
                )

        if issue_type == "정상":
            tags.append("정상")
            if not reason_list:
                reason_list.append("통계적 패턴 기준으로 특별한 이상이 감지되지 않았습니다.")
            severity = 1

        issue_types.append(issue_type)
        severities.append(severity)
        reasons.append(" / ".join(reason_list))
        reason_tags_all.append(tags)

    df["issue_type"]    = issue_types
    df["severity_rank"] = severities
    df["reason_kor"]    = reasons
    df["reason_tags"]   = reason_tags_all

    return df


# ============================================================
# 7. 엑셀 리포트 저장 (단독 분석 스크립트용 유틸)
# ============================================================
def save_report(df, output_path="AI_anomaly_report.xlsx", target_ym=None):
    df = df.copy()
    df["year_month"] = df["year_month"].astype(str)
    df["is_issue"] = df["issue_type"] != "정상"

    if target_ym:
        df_month = df[df["year_month"] == target_ym].copy()
    else:
        df_month = df.copy()

    summary_cols = [
        "cost_center", "cc_name",
        "year_month", "year", "month",
        "account_code", "account_name", "cost_nature",
        "amount",
        "issue_type", "severity_rank",
        "anomaly_score", "iso_score", "lof_score",
        "zscore_12", "dev_3m", "cv_12",
        "prev_amount", "prev_diff_rate",
        "corr_partner_acc", "corr_partner_coef",
        "sign_diff_with_partner",
        "suspected_missing",
        "reason_kor",
    ]
    summary_cols = [c for c in summary_cols if c in df_month.columns]
    summary_df = df_month[summary_cols].sort_values(
        ["year", "month", "cost_center", "account_code"]
    )

    issues_df = df_month[df_month["is_issue"]].copy()
    issues_df = issues_df.sort_values(
        ["severity_rank", "year", "month", "cost_center", "account_code"],
        ascending=[False, True, True, True, True]
    )

    center_group = df_month.groupby(["cost_center", "cc_name"], dropna=False)
    center_issue = center_group["is_issue"].sum()
    center_cnt   = center_group["is_issue"].count()
    center_rate  = center_issue / center_cnt.replace(0, np.nan)

    center_df = pd.DataFrame({
        "cost_center": [idx[0] for idx in center_issue.index],
        "cc_name":     [idx[1] for idx in center_issue.index],
        "total_rows":  center_cnt.values,
        "issue_rows":  center_issue.values,
        "issue_ratio": center_rate.values,
    }).sort_values("issue_ratio", ascending=False)

    acc_group = df_month.groupby(
        ["cost_center", "cc_name", "account_code", "account_name"],
        dropna=False
    )
    acc_issue = acc_group["is_issue"].sum()
    acc_cnt   = acc_group["is_issue"].count()
    acc_rate  = acc_issue / acc_cnt.replace(0, np.nan)

    acc_df = pd.DataFrame({
        "cost_center":  [idx[0] for idx in acc_issue.index],
        "cc_name":      [idx[1] for idx in acc_issue.index],
        "account_code": [idx[2] for idx in acc_issue.index],
        "account_name": [idx[3] for idx in acc_issue.index],
        "total_rows":   acc_cnt.values,
        "issue_rows":   acc_issue.values,
        "issue_ratio":  acc_rate.values,
    }).sort_values(
        ["issue_ratio", "cost_center", "account_code"],
        ascending=[False, True, True]
    )

    with pd.ExcelWriter(output_path) as writer:
        summary_df.to_excel(writer, sheet_name="요약", index=False)
        issues_df.to_excel(writer, sheet_name="이상_결측_행만", index=False)
        center_df.to_excel(writer, sheet_name="센터별_이슈집계", index=False)
        acc_df.to_excel(writer, sheet_name="계정별_이슈집계", index=False)

    print(f"[완료] 엑셀 리포트가 저장되었습니다: {output_path}")
    if target_ym:
        print(f"  - 대상 월: {target_ym}")
    print(f"  - 총 행 수: {len(df):,} (이 중 이슈 행: {df['is_issue'].sum():,}개)")


# ============================================================
# 8. 터미널 요약
# ============================================================
def print_terminal_summary(df):
    total = len(df)
    issues = (df["issue_type"] != "정상").sum()
    missing_issues = (df["issue_type"] == "결측 의심").sum()
    anomaly_issues = (df["issue_type"] == "이상치 의심").sum()

    print("\n[탐지 결과 요약]")
    print(f" - 전체 행 수: {total:,}건")
    print(f" - 이상/결측 의심: {issues:,}건")
    print(f"   · 결측 의심: {missing_issues:,}건")
    print(f"   · 이상치 의심: {anomaly_issues:,}건")


# ============================================================
# 9. 메인 (단독 실행용)
# ============================================================
def main():
    excel_path = "centercost_data.xlsx"

    print("[1] 엑셀 파싱중...")
    df = parse_cost_center_excel(excel_path)
    print(f"    - 총 행 수: {len(df):,}건")
    print(f"    - 코스트센터 수: {df['cost_center'].nunique()}개")

    print("[2] 결측치(의심) 플래그 계산...")
    df = detect_potential_missing(df, lookback_months=3)

    print("[3] 패턴/통계 피처 생성...")
    df = build_features(df)

    print("[4] 코스트센터 내 계정 상관관계 기반 피처 계산...")
    df = compute_corr_pairs(df, corr_threshold=0.9)

    print("[5] IF+LOF 앙상블 이상치 스코어 계산...")
    df = run_ensemble_outlier(df, contamination=0.05, random_state=42)

    print("[6] 사람이 읽을 수 있는 한글 설명 생성...")
    df = build_human_explanations(df)

    print("[7] 터미널 요약 출력...")
    print_terminal_summary(df)

    print("\n리포트로 보고 싶은 월을 입력해 주세요.")
    print("  예시: 2025-09  (엔터만 치면 전체 기간)")
    target_ym = input(" > 대상 year-month (YYYY-MM): ").strip()
    if target_ym == "":
        target_ym = None

    print("[8] 엑셀 리포트 저장...")
    save_report(df, output_path="AI_anomaly_report.xlsx", target_ym=target_ym)


if __name__ == "__main__":
    main()
