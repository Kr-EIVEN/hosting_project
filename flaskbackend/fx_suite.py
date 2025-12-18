# fx_suite.py (V2 REPLACEMENT)
from __future__ import annotations
import re, io
import os
from pathlib import Path
from dataclasses import dataclass
from typing import Dict, Any, Optional, List
import numpy as np
import pandas as pd

_MONTH_RE = re.compile(r"^(20\d{2})[.\-/](\d{2})\s*(금액\(원화\)|금액|수량)$")

def _detect_month_columns(cols: List[str]) -> Dict[str, Dict[str,str]]:
    out: Dict[str, Dict[str,str]] = {}
    for c in cols:
        if not isinstance(c,str): 
            continue
        m=_MONTH_RE.match(c.strip())
        if not m: 
            continue
        y,mm,kind=m.group(1),m.group(2),m.group(3)
        ym=f"{y}-{mm}"
        out.setdefault(ym,{})
        if kind=="금액(원화)":
            out[ym]["amount_krw"]=c
        elif kind=="금액":
            out[ym]["amount"]=c
        elif kind=="수량":
            out[ym]["qty"]=c
    return out

def _market_from_channel(v: Any) -> str:
    s=str(v).strip() if v is not None else ""
    return "직수출" if "직수출" in s else "내수"

def _f(x, default=0.0) -> float:
    try:
        if x is None: return float(default)
        if isinstance(x,str) and x.strip()=="": return float(default)
        return float(x)
    except Exception:
        return float(default)

@dataclass
class ForecastResult:
    rates: Dict[str,float]
    meta: Dict[str,Any]

class FxEnsembleForecaster:
    """Excel columns: date, usdkrw (monthly)"""
    def __init__(self, fx_excel_path: str | None = None):
        if fx_excel_path is None or str(fx_excel_path).strip() == "":
            env_path = (os.getenv("FX_EXCEL_PATH") or "").strip()
            if env_path:
                fx_excel_path = env_path
            else:
                default_path = Path(__file__).resolve().parent / "usdkrw_5y_actual.xlsx"
                fx_excel_path = str(default_path) if default_path.exists() else None
        self.fx_excel_path = fx_excel_path

    def _load(self) -> pd.Series:
        if not self.fx_excel_path:
            raise ValueError('fx_excel_path가 필요합니다')
        df=pd.read_excel(self.fx_excel_path)
        if "date" not in df.columns or "usdkrw" not in df.columns:
            raise ValueError("환율 엑셀은 date, usdkrw 컬럼이 필요합니다.")
        d=df["date"]
        if np.issubdtype(d.dtype, np.datetime64):
            ym=pd.to_datetime(d).dt.to_period("M").astype(str)
        else:
            ym=d.astype(str).str.slice(0,7)
        s=pd.Series(pd.to_numeric(df["usdkrw"],errors="coerce").astype(float).values, index=ym.values)
        s=s[~s.index.duplicated(keep="last")].sort_index()
        return s

    def forecast(self, months:int=12) -> ForecastResult:
        s=self._load()
        months=max(1,min(120,int(months)))
        if len(s)<6:
            last=float(s.iloc[-1]) if len(s) else 1350.0
            last_p=pd.Period(s.index[-1],"M") if len(s) else pd.Period("2025-01","M")
            fut=pd.period_range(last_p+1, periods=months, freq="M").astype(str)
            return ForecastResult({str(k):last for k in fut}, {"method":"flat","n_hist":int(len(s))})
        y=s.values.astype(float)
        t=np.arange(len(y),dtype=float)
        slope, intercept = np.polyfit(t,y,1)  # slope, intercept
        trend = slope*t + intercept
        resid = y - trend
        k = 12 if len(resid)>=12 else len(resid)
        seas = resid[-k:] - resid[-k:].mean()
        last_p=pd.Period(s.index[-1],"M")
        fut=pd.period_range(last_p+1, periods=months, freq="M").astype(str)
        rates={}
        for i,ym in enumerate(fut):
            tt=len(y)+i
            pred=float(slope*tt + intercept + seas[i%k])
            rates[str(ym)]=max(100.0,pred)
        return ForecastResult(rates, {"method":"trend+seasonal","n_hist":int(len(s))})

class FxTariffAnalyzer:
    def __init__(self, sales_excel_bytes: bytes):
        self.sales_excel_bytes=sales_excel_bytes
        self._df: Optional[pd.DataFrame]=None
        self._mm: Optional[Dict[str,Dict[str,str]]]=None

    def _load(self):
        if self._df is not None: 
            return
        self._df=pd.read_excel(io.BytesIO(self.sales_excel_bytes))
        self._df.columns=[str(c).strip() for c in self._df.columns]
        self._mm=_detect_month_columns(self._df.columns.tolist())
        if not self._mm:
            raise ValueError("판매계획 파일에서 월별 컬럼(예: 2026.01 금액(원화))을 찾지 못했습니다.")

    def options(self) -> Dict[str,Any]:
        self._load()
        df=self._df
        cars=sorted({str(c).strip() for c in df.get("차종",pd.Series([], dtype=object)).dropna().astype(str).tolist() if str(c).strip()})
        groups=sorted({str(g).strip() for g in df.get("자재그룹명", df.get("자재그룹",pd.Series([], dtype=object))).dropna().astype(str).tolist() if str(g).strip()})
        ch=df.get("유통경로명",pd.Series([])).dropna().astype(str).unique().tolist()
        markets=sorted({_market_from_channel(x) for x in ch})
        months=sorted(self._mm.keys())
        return {"cars":cars,"groups":groups,"markets":markets,"months":months}

    def _explode(self) -> pd.DataFrame:
        self._load()
        df=self._df.copy()
        df["market"]=df.get("유통경로명","").map(_market_from_channel)
        df["code"]=df.get("자재코드",df.get("자재","")).astype(str).str.strip()
        df["name"]=df.get("자재내역",df.get("자재내역1","")).astype(str).str.strip()
        df["car"]=df.get("차종","").astype(str).str.strip()
        df["group"]=df.get("자재그룹명", df.get("자재그룹","")).astype(str).str.strip()
        parts=[]
        for ym,mp in self._mm.items():
            col=mp.get("amount_krw") or mp.get("amount")
            if not col: 
                continue
            base=pd.to_numeric(df[col],errors="coerce").fillna(0.0).astype(float)
            part=pd.DataFrame({
                "ym": ym,
                "market": df["market"].values,
                "code": df["code"].values,
                "name": df["name"].values,
                "car": df["car"].values,
                "group": df["group"].values,
                "base_krw": base.values,
            })
            parts.append(part)
        out=pd.concat(parts,ignore_index=True) if parts else pd.DataFrame(columns=["ym","market","base_krw"])
        out=out[out["base_krw"].abs()>0.0001].copy()
        return out

    def analyze(self, plan_fx:float=1350.0, tariff_pct:float=0.0, fx_mode:str="pct",
                fx_change_pct:float=0.0, forecast_rates:Optional[Dict[str,float]]=None,
                car:str="", group:str="", market:str="", q:str="",
                cost_rate_pct:Optional[float]=None, limit_rows:int=4000,
                forecast_months: Optional[int] = None,
                scenario_best_exp_pct: float = 5.0,
                scenario_best_tariff_delta_pct: float = 0.0,
                scenario_worst_exp_pct: float = -5.0,
                scenario_worst_tariff_delta_pct: float = 5.0) -> Dict[str,Any]:
        df=self._explode()

        if car: df=df[df["car"]==car]
        if group: df=df[df["group"]==group]
        if market: df=df[df["market"]==market]
        if q:
            qs=q.strip()
            if qs:
                df=df[df["code"].str.contains(qs, case=False, na=False, regex=False) | df["name"].str.contains(qs, case=False, na=False, regex=False)]

        plan_fx=max(100.0,_f(plan_fx,1350.0))
        tpf=max(0.0,_f(tariff_pct,0.0))/100.0

        cr=None
        if cost_rate_pct is not None and str(cost_rate_pct).strip()!="":
            cr=max(0.0,min(100.0,_f(cost_rate_pct,85.0)))/100.0

        months=sorted(df["ym"].unique().tolist())
        fx_used={}
        if fx_mode=="auto":
            # auto 모드일때: forecast_rates가 없으면 옵션에서 먼저 반영, 없으면 기본 설정
            if forecast_rates is None:
                # 요청한 예측기간이 있으면 그것으로 반영, 없으면 옵션(엑셀) 개수로 기본 설정
                m = forecast_months if forecast_months is not None else (len(months) or 12)
                m = max(1, min(120, int(m)))
                fc = FxEnsembleForecaster(str(Path(__file__).resolve().parent / "usdkrw_5y_actual.xlsx"))
                forecast_rates = fc.forecast(months=m).rates
            for ym in months:
                fx_used[ym] = float(forecast_rates.get(ym, plan_fx))
        else:
            # 퍼센트 조정: 시작~끝을 pct만큼 차이나게 하고 패턴을 일부 반영
            pct = _f(fx_change_pct, 0.0)
            change_ratio = 1.0 + (pct/100.0)
            if len(months) <= 1:
                fx_single = max(100.0, plan_fx * change_ratio)
                for ym in months:
                    fx_used[ym] = fx_single
            else:
                try:
                    m = forecast_months if forecast_months is not None else len(months)
                    m = max(1, min(120, int(m)))
                    fc = FxEnsembleForecaster(str(Path(__file__).resolve().parent / "usdkrw_5y_actual.xlsx"))
                    pat_rates = fc.forecast(months=m).rates
                    pat_list = []
                    keys = list(pat_rates.keys())
                    for i in range(len(months)):
                        if i < len(keys):
                            pat_list.append(float(pat_rates.get(keys[i], plan_fx)))
                        else:
                            pat_list.append(float(plan_fx))
                except Exception:
                    pat_list = []

                lin = [i/(len(months)-1) for i in range(len(months))]
                if pat_list:
                    pmin, pmax = min(pat_list), max(pat_list)
                    if pmax == pmin:
                        pat_norm = [0.0]*len(pat_list)
                    else:
                        pat_norm = [(v-pmin)/(pmax-pmin) for v in pat_list]
                else:
                    pat_norm = [0.0]*len(months)

                blend = 0.7  # 패턴 70% + 선형 30%
                start_rate = plan_fx
                end_rate = plan_fx * change_ratio
                for idx, ym in enumerate(months):
                    t_lin = lin[idx]
                    t_pat = pat_norm[idx] if idx < len(pat_norm) else t_lin
                    t = blend * t_pat + (1-blend) * t_lin
                    rate = start_rate + (end_rate - start_rate) * t
                    if idx == 0:
                        rate = start_rate
                    if idx == len(months)-1:
                        rate = end_rate
                    fx_used[ym] = max(100.0, float(rate))

        is_exp = df["market"]=="직수출"
        ratio = df["ym"].map(lambda ym: fx_used.get(ym,plan_fx)/plan_fx).astype(float)
        df["scenario_krw"]=df["base_krw"]
        df.loc[is_exp,"scenario_krw"]=df.loc[is_exp,"base_krw"]*ratio[is_exp]
        df["delta_krw"]=df["scenario_krw"]-df["base_krw"]
        df["tariff_cost"]=0.0
        df.loc[is_exp,"tariff_cost"]=df.loc[is_exp,"scenario_krw"]*tpf
        df["net_krw"]=df["scenario_krw"]-df["tariff_cost"]

        def _sum(mkt, col):
            d=df if mkt is None else df[df["market"]==mkt]
            return float(d[col].sum())

        total={"base_krw":_sum(None,"base_krw"),"scenario_krw":_sum(None,"scenario_krw"),"delta_krw":_sum(None,"delta_krw"),
               "tariff_cost":_sum("직수출","tariff_cost"),"net_krw":_sum(None,"net_krw")}
        dom={"base_krw":_sum("내수","base_krw"),"scenario_krw":_sum("내수","scenario_krw"),"delta_krw":_sum("내수","delta_krw"),
             "tariff_cost":0.0,"net_krw":_sum("내수","net_krw")}
        exp={"base_krw":_sum("직수출","base_krw"),"scenario_krw":_sum("직수출","scenario_krw"),"delta_krw":_sum("직수출","delta_krw"),
             "tariff_cost":_sum("직수출","tariff_cost"),"net_krw":_sum("직수출","net_krw")}

        monthly=[]
        for ym in months:
            d=df[df["ym"]==ym]
            dom_scenario=float(d[d["market"]=="내수"]["scenario_krw"].sum())
            exp_scenario=float(d[d["market"]=="직수출"]["scenario_krw"].sum())
            exp_tariff=float(d[d["market"]=="직수출"]["tariff_cost"].sum())
            total_scenario=dom_scenario+exp_scenario
            row={
                "ym": ym,
                "fx_used": float(fx_used.get(ym,plan_fx)),
                "내수_base": float(d[d["market"]=="내수"]["base_krw"].sum()),
                "직수출_base": float(d[d["market"]=="직수출"]["base_krw"].sum()),
                "내수_net": float(d[d["market"]=="내수"]["net_krw"].sum()),
                "직수출_net": float(d[d["market"]=="직수출"]["net_krw"].sum()),
                "내수_scenario": dom_scenario,
                "직수출_scenario": exp_scenario,
                "직수출_tariff": exp_tariff,
                "전체_scenario": total_scenario,
            }
            if cr is not None:
                dom_ebit=dom_scenario*(1-cr)
                exp_ebit=(exp_scenario*(1-cr)) - exp_tariff
                total_ebit=dom_ebit+exp_ebit
                row.update({
                    "내수_ebit": float(dom_ebit),
                    "직수출_ebit": float(exp_ebit),
                    "전체_ebit": float(total_ebit),
                    "내수_opm": float((dom_ebit/dom_scenario*100.0) if dom_scenario else 0.0),
                    "직수출_opm": float((exp_ebit/exp_scenario*100.0) if exp_scenario else 0.0),
                    "전체_opm": float((total_ebit/total_scenario*100.0) if total_scenario else 0.0),
                    "직수출_비중": float((exp_scenario/total_scenario*100.0) if total_scenario else 0.0),
                })
            monthly.append(row)

        exec_pack={}
        if cr is not None:
            plan_rev=total["base_krw"]; fx_rev=total["scenario_krw"]
            plan_op=plan_rev - plan_rev*cr
            fx_op=fx_rev - fx_rev*cr
            plan_opm_pre=(plan_op/plan_rev*100.0) if plan_rev else 0.0
            fx_opm_pre=(fx_op/fx_rev*100.0) if fx_rev else 0.0

            # sensitivity: USD/KRW +1% => export scenario rev +1%
            exp_fx=exp["scenario_krw"]
            fx_rev_up=(fx_rev-exp_fx)+(exp_fx*1.01)
            fx_op_up=fx_rev_up - fx_rev_up*cr
            fx_sens_op=fx_op_up - fx_op

            base_ebit = fx_op - exp["tariff_cost"]
            exp_tariff = exp["tariff_cost"]
            fx_ebit_up = (fx_rev_up - fx_rev_up*cr) - (exp_tariff*1.01)
            fx_sens_ebit = fx_ebit_up - base_ebit

            plan_tariff = float(exp["base_krw"])*float(tpf)
            plan_ebit = float(plan_op) - float(plan_tariff)
            plan_opm = (plan_ebit/plan_rev*100.0) if plan_rev else 0.0
            fx_opm = (base_ebit/fx_rev*100.0) if fx_rev else 0.0
            opm_pp = fx_opm - plan_opm

            bexp = float(scenario_best_exp_pct)
            wexp = float(scenario_worst_exp_pct)
            b_tariff = max(0.0, float(tpf) + float(scenario_best_tariff_delta_pct)/100.0)
            w_tariff = max(0.0, float(tpf) + float(scenario_worst_tariff_delta_pct)/100.0)

            best_rev = (fx_rev - exp_fx) + (exp_fx * (1.0 + bexp/100.0))
            best_tariff = exp_fx * (1.0 + bexp/100.0) * b_tariff
            best_ebit = (best_rev * (1-cr)) - best_tariff

            worst_rev = (fx_rev - exp_fx) + (exp_fx * (1.0 + wexp/100.0))
            worst_tariff = exp_fx * (1.0 + wexp/100.0) * w_tariff
            worst_ebit = (worst_rev * (1-cr)) - worst_tariff

            exec_pack={
                "plan_opm":float(plan_opm),
                "fx_opm":float(fx_opm),
                "opm_pp":float(opm_pp),
                "plan_opm_pre":float(plan_opm_pre),
                "fx_opm_pre":float(fx_opm_pre),
                "plan_ebit":float(plan_ebit),
                "fx_ebit":float(base_ebit),
                "fx_sensitivity_op_delta_1pct":float(fx_sens_op),
                "fx_sensitivity_ebit_delta_1pct":float(fx_sens_ebit),
                "ebit_scenarios":{"best":float(best_ebit),"base":float(base_ebit),"worst":float(worst_ebit)},
            }

        rows=df.sort_values(["ym","market","base_krw"],ascending=[True,True,False]).head(int(limit_rows)).to_dict(orient="records")
        return {"ok":True,"summary":{"total":total,"domestic":dom,"export":exp},"monthly_series":monthly,"rows":rows,"exec":exec_pack,
                "meta":{"plan_fx":float(plan_fx),"tariff_pct":float(tariff_pct),"fx_mode":fx_mode,"fx_change_pct":float(fx_change_pct),
                        "note":"관세는 직수출만. 환율% + 는 원화강세(직수출 불리)로 해석."}}
