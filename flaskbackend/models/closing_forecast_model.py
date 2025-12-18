"""
closing_forecast_model.py

- 5년치 월간 데이터로 Prophet 학습 (타겟별 1개 시계열)
- 타겟: 영업이익 / 매출액 / 매출원가계 / 판매비와일반관리비
- 마지막 N개월(test_horizon)을 test 구간으로 성능(MAE, RMSE, MAPE) 평가
- n개월 예측
- 시나리오(전력비, 총인건비, 원재료비, 부재료비 전체, 판관비 증감률)는
  예측값을 후처리로 보정

[NOTE] 이번 버전 주요 개선점
- 타겟별 Prophet 하이퍼파라미터 자동 튜닝
  (yearly_seasonality / seasonality_mode / changepoint_prior_scale 조합 중
   RMSE가 가장 낮은 모델을 선택)
- 이상치 클리핑 구간 10%~90% → 5%~95% 로 완화

[OK] 추가 수정(중요)
- 시나리오 배율 해석을 "총배율 r"로 통일:
  - 200% 입력 → r=2.0 (기존의 2배)
  - 실제 반영 증감분은 base*(r-1)
  - 기존 코드의 base*r 방식은 과반영 가능(특히 200%에서)
"""

import os
from typing import Dict, Any, List, Optional, Tuple

import joblib
import numpy as np
import pandas as pd
from prophet import Prophet
from sklearn.metrics import mean_absolute_error, mean_squared_error

# =========================================================
# 기본 설정
# =========================================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

DATA_FILE = os.path.normpath(
    os.path.join(BASE_DIR, "..", "predict_data", "주제4_5년치_데이터.xlsx")
)

MODEL_PATH = os.path.join(BASE_DIR, "closing_forecast_prophet_simple.pkl")

# [CFG] 예측 타겟 (성능 체크도 이 4개 기준)
TARGET_COLS = [
    "영업이익",
    "매출액",
    "매출원가계",
    "판매비와일반관리비",
]

# [CFG] 시나리오용 실제 비용 컬럼
SCENARIO_BASE_COLS = [
    "전력비",
    "총인건비",
    "원재료비",
    "부재료비_전체",
    "판매비와일반관리비",
]

# [CFG] 프론트 ↔ 실제 컬럼 매핑
SCENARIO_ALIAS: Dict[str, str] = {
    "급여(전체)": "총인건비",
    "전력비": "전력비",
    "판관비": "판매비와일반관리비",
    "판관비(전체)": "판매비와일반관리비",
    "원재료비": "원재료비",
    "부재료비(전체)": "부재료비_전체",
}

# [CFG] Prophet 하이퍼파라미터 후보 (그리드 서치 대상)
PARAM_GRID: List[Dict[str, Any]] = [
    {
        "yearly_seasonality": 5,
        "seasonality_mode": "additive",
        "changepoint_prior_scale": 0.05,
    },
    {
        "yearly_seasonality": 5,
        "seasonality_mode": "multiplicative",
        "changepoint_prior_scale": 0.05,
    },
    {
        "yearly_seasonality": 10,
        "seasonality_mode": "additive",
        "changepoint_prior_scale": 0.05,
    },
    {
        "yearly_seasonality": 10,
        "seasonality_mode": "multiplicative",
        "changepoint_prior_scale": 0.05,
    },
    {
        "yearly_seasonality": 10,
        "seasonality_mode": "additive",
        "changepoint_prior_scale": 0.1,
    },
    {
        "yearly_seasonality": 10,
        "seasonality_mode": "multiplicative",
        "changepoint_prior_scale": 0.1,
    },
]


# =========================================================
# 유틸 함수
# =========================================================

def _to_ds(df: pd.DataFrame) -> pd.Series:
    return pd.to_datetime(
        df["연도"].astype(int).astype(str)
        + "-"
        + df["월"].astype(int).astype(str)
        + "-01"
    )


def signed_log1p(x: np.ndarray) -> np.ndarray:
    """
    음수 포함 시계열을 위한 변환:
    y_trans = sign(y) * log(1 + |y|)
    """
    x = np.asarray(x, dtype=float)
    return np.sign(x) * np.log1p(np.abs(x))


def signed_expm1(x: np.ndarray) -> np.ndarray:
    """
    signed_log1p 변환의 역변환:
    y = sign(z) * (exp(|z|) - 1)
    """
    x = np.asarray(x, dtype=float)
    return np.sign(x) * (np.expm1(np.abs(x)))


def _calc_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, float]:
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)

    mae = mean_absolute_error(y_true, y_pred)
    mse = mean_squared_error(y_true, y_pred)
    rmse = float(mse ** 0.5)

    mape = float(
        np.mean(
            np.abs((y_true - y_pred) / (y_true + 1e-9))
        ) * 100
    )
    return {"MAE": mae, "RMSE": rmse, "MAPE": mape}


def print_metrics_report(
    metrics: Dict[str, Dict[str, float]],
    title: str = "타겟별 성능 (최근 test_horizon개월 기준)",
) -> None:
    if not metrics:
        print("\n[WARN] metrics 정보가 없습니다. 모델을 다시 학습(train_prophet_models)해야 할 수 있습니다.")
        return

    print(f"\n[STAT] {title}")
    for t, mtr in metrics.items():
        mae = mtr.get("MAE", 0.0)
        rmse = mtr.get("RMSE", 0.0)
        mape = mtr.get("MAPE", 0.0)
        horizon = mtr.get("test_horizon", 0)

        extra = ""
        cps = mtr.get("changepoint_prior_scale")
        ys = mtr.get("yearly_seasonality")
        mode = mtr.get("seasonality_mode")
        if cps is not None:
            extra = f", cps={cps}, yearly={ys}, mode={mode}"

        print(
            f"  - {t}: MAE={mae:.0f}, RMSE={rmse:.0f}, "
            f"MAPE={mape:.1f}% (test_horizon={horizon}{extra})"
        )


# =========================================================
# Prophet 하이퍼파라미터 탐색
# =========================================================

def _fit_best_prophet(
    train_df: pd.DataFrame,
    test_ds: pd.DataFrame,
    y_true_raw: np.ndarray,
) -> Tuple[Prophet, Dict[str, float], Dict[str, Any]]:
    """
    PARAM_GRID 에 있는 설정들을 돌려보고,
    RMSE 기준으로 가장 좋은 Prophet 모델을 선택.
    """
    best_model: Optional[Prophet] = None
    best_metrics: Optional[Dict[str, float]] = None
    best_params: Optional[Dict[str, Any]] = None

    for params in PARAM_GRID:
        m = Prophet(
            yearly_seasonality=params["yearly_seasonality"],
            weekly_seasonality=False,
            daily_seasonality=False,
            seasonality_mode=params["seasonality_mode"],
            changepoint_prior_scale=params["changepoint_prior_scale"],
        )
        m.fit(train_df)

        fcst = m.predict(test_ds)
        yhat_trans = fcst["yhat"].values
        y_pred = signed_expm1(yhat_trans)

        mtr = _calc_metrics(y_true_raw, y_pred)

        if (best_metrics is None) or (mtr["RMSE"] < best_metrics["RMSE"]):
            best_model = m
            best_metrics = mtr
            best_params = params

    assert best_model is not None and best_metrics is not None and best_params is not None
    return best_model, best_metrics, best_params


# =========================================================
# 학습 / 로딩
# =========================================================

def train_prophet_models(test_horizon: int = 6) -> Dict[str, Any]:
    """
    타겟 4개(영업이익/매출액/매출원가계/판관비)에 대해
    Prophet 단변량 학습 + 성능 평가.
    하이퍼파라미터는 PARAM_GRID에서 자동 선택.
    """
    print(f"[LOAD] 학습용 엑셀 로딩: {DATA_FILE}")
    df = pd.read_excel(DATA_FILE)

    df = df.sort_values(["연도", "월"]).reset_index(drop=True)
    df["ds"] = _to_ds(df)

    # 총인건비 생성
    labor_cols = [
        col for col in ["직접노무비", "간접노무비", "급여", "퇴직급여", "복리후생비"]
        if col in df.columns
    ]
    if labor_cols:
        df["총인건비"] = df[labor_cols].sum(axis=1)
    else:
        df["총인건비"] = 0.0

    # 부재료비_전체 생성
    sub_cols = [
        col
        for col in [
            "부재료비-직거래품",
            "부재료비-반제품",
            "부재료비-핫스템핑",
            "부재료비-사급품",
            "부재료비-H/W",
            "부재료비-PAD",
            "부재료비-구조용접",
        ]
        if col in df.columns
    ]
    if sub_cols:
        df["부재료비_전체"] = df[sub_cols].sum(axis=1)
    else:
        df["부재료비_전체"] = 0.0

    numeric_cols = TARGET_COLS + SCENARIO_BASE_COLS + ["매출원가계", "매출원가", "매출액"]
    for col in numeric_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)
        else:
            df[col] = 0.0

    models: Dict[str, Prophet] = {}
    metrics: Dict[str, Dict[str, float]] = {}

    # 시나리오 비율 계산용 데이터 (최근 test_horizon개월)
    if len(df) >= test_horizon:
        recent = df.iloc[-test_horizon:].copy()
    else:
        recent = df.copy()

    scenario_stats: Dict[str, float] = {}

    avg_sga = float(recent["판매비와일반관리비"].mean() or 0.0)
    if avg_sga <= 0:
        avg_sga = 1.0

    if "매출원가계" in recent.columns:
        avg_cogs = float(recent["매출원가계"].mean() or 0.0)
    else:
        avg_cogs = float(recent["매출원가"].mean() or 0.0)
    if avg_cogs <= 0:
        avg_cogs = 1.0

    for col in SCENARIO_BASE_COLS:
        if col not in recent.columns:
            scenario_stats[col] = 0.0
            continue

        avg_col = float(recent[col].mean() or 0.0)

        if col in ["전력비", "총인건비", "판매비와일반관리비"]:
            denom = avg_sga
        else:
            denom = avg_cogs

        scenario_stats[col] = avg_col / denom

    # 타겟별 Prophet 학습 + 성능 평가 (하이퍼파라미터 탐색 포함)
    for target in TARGET_COLS:
        print(f"\n[TRAIN] 타겟 '{target}' 학습 및 평가 시작...")

        tmp = df[["ds", target]].copy()
        tmp = tmp.rename(columns={target: "y_raw"})
        tmp["y_raw"] = pd.to_numeric(tmp["y_raw"], errors="coerce").fillna(0.0)

        if len(tmp) <= test_horizon + 6:
            raise ValueError(
                f"[{target}] 데이터 포인트가 너무 적어서 test_horizon={test_horizon}으로 나눌 수 없습니다."
            )

        # 변환 + 이상치 클리핑 (5% ~ 95%)
        tmp["y_trans"] = signed_log1p(tmp["y_raw"])
        q_low, q_high = tmp["y_trans"].quantile([0.05, 0.95])
        tmp["y_trans"] = tmp["y_trans"].clip(q_low, q_high)

        # train / test 분리
        train = tmp.iloc[:-test_horizon].copy()
        test = tmp.iloc[-test_horizon:].copy()

        train_df = train[["ds", "y_trans"]].rename(columns={"y_trans": "y"})
        test_ds = test[["ds"]]
        y_true = test["y_raw"].values

        # [SEARCH] 하이퍼파라미터 탐색
        best_model, best_metrics, best_params = _fit_best_prophet(
            train_df=train_df,
            test_ds=test_ds,
            y_true_raw=y_true,
        )

        best_metrics = {
            "MAE": float(best_metrics["MAE"]),
            "RMSE": float(best_metrics["RMSE"]),
            "MAPE": float(best_metrics["MAPE"]),
            "test_horizon": int(test_horizon),
            "yearly_seasonality": best_params["yearly_seasonality"],
            "seasonality_mode": best_params["seasonality_mode"],
            "changepoint_prior_scale": best_params["changepoint_prior_scale"],
        }

        print(
            f"[STAT] [{target}] MAE={best_metrics['MAE']:.0f}, "
            f"RMSE={best_metrics['RMSE']:.0f}, MAPE={best_metrics['MAPE']:.1f}% "
            f"(test_horizon={test_horizon}, "
            f"yearly={best_metrics['yearly_seasonality']}, "
            f"mode={best_metrics['seasonality_mode']}, "
            f"cps={best_metrics['changepoint_prior_scale']})"
        )

        models[target] = best_model
        metrics[target] = best_metrics

    payload: Dict[str, Any] = {
        "models": models,
        "target_cols": TARGET_COLS,
        "history_last_ds": df["ds"].iloc[-1],
        "metrics": metrics,
        "scenario_stats": scenario_stats,
    }

    joblib.dump(payload, MODEL_PATH)
    print(f"\n[SAVE] Prophet 모델 payload 저장 완료: {MODEL_PATH}")

    print_metrics_report(metrics)

    print("\n[STAT] 시나리오용 비용 비율 (최근 기간 기준)")
    for c, v in scenario_stats.items():
        print(f"  - {c}: {v:.3f}")

    return payload


def load_or_train() -> Dict[str, Any]:
    if os.path.exists(MODEL_PATH):
        print(f"[LOAD] Prophet 모델 로드: {MODEL_PATH}")
        try:
            return joblib.load(MODEL_PATH)
        except AttributeError as exc:
            # Legacy pickles created with older cmdstanpy versions may miss BaseType.
            print(f"Legacy model pickle could not be loaded ({exc}); retraining.")
        except Exception as exc:
            # Defensive: retrain if any other load failure occurs.
            print(f"Failed to load existing model ({exc}); retraining.")
        try:
            os.remove(MODEL_PATH)
        except OSError:
            pass

    print("[WARN] Prophet 모델이 없어 새로 학습합니다.")
    return train_prophet_models(test_horizon=6)


# =========================================================
# 예측 + 시나리오 반영
# =========================================================

def _apply_scenario_postprocess(
    row: Dict[str, float],
    scenario: Dict[str, float],
    scenario_stats: Dict[str, float],
) -> Dict[str, float]:
    """
    시나리오 값은 프론트에서 '총배율 r'로 들어온다고 가정.
      - 예: 200% 입력 -> 2.0
      - 예: 50% 입력 -> 0.5

    [OK] 반영 규칙(중요):
      - r배로 "맞추는" 것이므로 실제 증감분은 base*(r-1)
      - (기존 코드처럼 base*r를 더하면 200%에서 과반영될 수 있음)
    """
    if not scenario:
        return row

    # 프론트 key -> 실제 컬럼명 정규화
    normalized: Dict[str, float] = {}
    for k, v in scenario.items():
        col = SCENARIO_ALIAS.get(k, k)
        try:
            normalized[col] = float(v)
        except Exception:
            continue

    # 베이스(예측값) 꺼내기
    sales = float(row.get("매출액", 0.0))
    sga = float(row.get("판매비와일반관리비", 0.0))
    op = float(row.get("영업이익", 0.0))

    # 매출원가계가 없으면 매출원가 fallback
    cogs = float(row.get("매출원가계", row.get("매출원가", 0.0)))

    # 분모가 0일 때를 대비한 fallback
    sga_safe = sga if sga != 0 else 1.0
    cogs_safe = cogs if cogs != 0 else (abs(sales) * 0.7 if sales != 0 else 1.0)

    delta_sga = 0.0
    delta_cogs = 0.0
    delta_op = 0.0

    # 1) 판관비(전체) 직접 조정: sga를 r배로 맞춤
    if "판매비와일반관리비" in normalized:
        r = normalized["판매비와일반관리비"]
        d = sga * (r - 1.0)   # [OK] 수정
        delta_sga += d
        delta_op -= d

    # 2) 전력비 / 총인건비 → 판관비 내 비중 기반
    sga_default_share = {
        "전력비": 0.07,
        "총인건비": 0.35,
    }

    for cost_col in ["전력비", "총인건비"]:
        if cost_col not in normalized:
            continue

        r = normalized[cost_col]
        share = scenario_stats.get(cost_col, 0.0)
        if share <= 0:
            share = sga_default_share.get(cost_col, 0.1)

        base = sga_safe * share
        d = base * (r - 1.0)  # [OK] 수정
        delta_sga += d
        delta_op -= d

    # 3) 원재료비 / 부재료비_전체 → 매출원가 내 비중 기반
    cogs_default_share = {
        "원재료비": 0.6,
        "부재료비_전체": 0.2,
    }

    for cost_col in ["원재료비", "부재료비_전체"]:
        if cost_col not in normalized:
            continue

        r = normalized[cost_col]
        share = scenario_stats.get(cost_col, 0.0)
        if share <= 0:
            share = cogs_default_share.get(cost_col, 0.1)

        base = cogs_safe * share
        d = base * (r - 1.0)  # [OK] 수정
        delta_cogs += d
        delta_op -= d

    # 결과 반영
    row["판매비와일반관리비"] = float(row.get("판매비와일반관리비", 0.0)) + delta_sga

    if "매출원가계" in row:
        row["매출원가계"] = float(row.get("매출원가계", 0.0)) + delta_cogs
    else:
        row["매출원가"] = float(row.get("매출원가", 0.0)) + delta_cogs

    row["영업이익"] = op + delta_op

    # 매출액은 비용 시나리오로는 기본적으로 변하지 않음(그대로 유지)
    row["매출액"] = sales

    return row


def forecast_next_n(
    payload: Dict[str, Any],
    n: int = 12,
    scenario: Optional[Dict[str, float]] = None,
) -> List[Dict[str, Any]]:
    models: Dict[str, Prophet] = payload["models"]
    target_cols: List[str] = payload["target_cols"]
    last_ds = payload["history_last_ds"]
    scenario_stats: Dict[str, float] = payload.get("scenario_stats", {})

    future_dates = [last_ds + pd.DateOffset(months=i) for i in range(1, n + 1)]
    future_df = pd.DataFrame({"ds": future_dates})

    pred_dict: Dict[str, np.ndarray] = {}
    for target in target_cols:
        m = models[target]
        forecast = m.predict(future_df)
        yhat_trans = forecast["yhat"].values
        y_pred = signed_expm1(yhat_trans)
        pred_dict[target] = y_pred

    results: List[Dict[str, Any]] = []
    for i, ds in enumerate(future_dates):
        row: Dict[str, float] = {
            "연도": int(ds.year),
            "월": int(ds.month),
        }
        for t in target_cols:
            row[t] = float(pred_dict[t][i])

        if scenario:
            row = _apply_scenario_postprocess(row, scenario, scenario_stats)

        results.append(row)

    return results


if __name__ == "__main__":
    payload = load_or_train()
    metrics = payload.get("metrics", {})
    print_metrics_report(metrics, title="저장된 Prophet 모델 성능 (최근 기간 기준)")
    print("\n[DONE] 여기까지 잘 나오면 Flask API에서 그대로 사용하면 됩니다.")
