// FxTariffCompareTab.js (V2 REPLACEMENT)
// 차트 축은 화면이 과밀해지지 않도록 필요한 곳에만 최소 표시합니다.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ResponsiveContainer, LineChart, Line, CartesianGrid, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, Cell, ReferenceLine } from "recharts";

const C_BLUE="#2563eb";
const C_ORANGE="#f97316";
const C_PURPLE="#7c3aed";
const C_INDIGO="#6366f1";
const C_RED="#ef4444";
const C_GREEN="#16a34a";
const C_BORDER="#e2e8f0";
const C_TEXT="#0f172a";
const C_MUTED="#64748b";
const C_BG="#f8fafc";

const fmtKRW=(v)=> {
  const n=Number(v);
  if(!Number.isFinite(n)) return "-";
  return `${Math.round(n).toLocaleString("ko-KR")} 원`;
};
const fmtKRWUnit=(v,d=1)=>{
  const n=Number(v);
  if(!Number.isFinite(n)) return "-";
  const abs=Math.abs(n);
  if(abs>=1e12) return `${(n/1e12).toFixed(d)}조`;
  if(abs>=1e8) return `${(n/1e8).toFixed(d)}억`;
  if(abs>=1e4) return `${(n/1e4).toFixed(d)}만`;
  return `${Math.round(n).toLocaleString("ko-KR")}`;
};
const fmtKRWShort=(v)=>{
  const n=Number(v);
  if(!Number.isFinite(n)) return "-";
  return `${fmtKRWUnit(n)} 원`;
};
const fmtPct=(v,d=2)=> {
  const n=Number(v);
  if(!Number.isFinite(n)) return "-";
  return `${n.toFixed(d)}%`;
};
const fmtPp=(v,d=2)=> {
  const n=Number(v);
  if(!Number.isFinite(n)) return "-";
  const s=n>0?"+":"";
  return `${s}${n.toFixed(d)}%p`;
};
const Arrow=({v})=>{
  const n=Number(v);
  if(!Number.isFinite(n) || n===0) return <span style={{color:C_MUTED}}>–</span>;
  return n>0 ? <span style={{color:C_GREEN,fontWeight:900}}>↑</span> : <span style={{color:C_RED,fontWeight:900}}>↓</span>;
};

function EbitScenarioTooltip({active, payload, label}) {
  if(!active || !payload?.length) return null;
  const v=payload[0]?.value;
  const desc=payload[0]?.payload?.desc;
  return (
    <div style={{background:"#fff",border:`1px solid ${C_BORDER}`,borderRadius:14,padding:"10px 12px",boxShadow:"0 12px 30px rgba(15,23,42,0.10)"}}>
      <div style={{fontWeight:950,color:C_TEXT}}>{label}</div>
      <div style={{marginTop:4,fontWeight:900,color:C_TEXT}}>세전영업이익(EBIT): {fmtKRW(v)}</div>
      {desc ? <div style={{marginTop:6,fontSize:12,fontWeight:800,color:"#475569",maxWidth:260}}>{desc}</div> : null}
    </div>
  );
}

function ImpactTooltip({active, payload, label}) {
  if(!active || !payload?.length) return null;
  const row=payload[0]?.payload||{};
  const base=Number(row.plan||0);
  const fx=Number(row.fxDelta||0);
  const tariffCost=Number(row.tariffCost||0);
  const net=Number(row.net||row.total||0);

  return (
    <div style={{background:"#fff",border:`1px solid ${C_BORDER}`,borderRadius:14,padding:"10px 12px",boxShadow:"0 12px 30px rgba(15,23,42,0.10)"}}>
      <div style={{fontWeight:950,color:C_TEXT}}>{label}</div>
      <div style={{marginTop:6,fontSize:12,fontWeight:900,color:C_TEXT}}>계획 매출: {fmtKRW(base)}</div>
      {row.kind!=="plan" ? <div style={{marginTop:4,fontSize:12,fontWeight:900,color:C_TEXT}}>환율 영향(±): {fmtKRW(fx)} <Arrow v={fx} /></div> : null}
      {row.kind==="net" ? <div style={{marginTop:4,fontSize:12,fontWeight:900,color:C_TEXT}}>관세비용(감소): {fmtKRW(-tariffCost)} <Arrow v={-tariffCost} /></div> : null}
      <div style={{marginTop:6,fontSize:12,fontWeight:950,color:C_TEXT}}>{row.kind==="net" ? "순매출" : "매출"}: {fmtKRW(net)}</div>
    </div>
  );
}

function Card({title, children}) {
  return (
    <div style={{background:"#fff",border:`1px solid ${C_BORDER}`,borderRadius:20,padding:18,boxShadow:"0 10px 30px rgba(15,23,42,0.06)"}}>
      {title ? <div style={{fontWeight:950,fontSize:13,marginBottom:12,color:C_TEXT,letterSpacing:"-0.2px"}}>{title}</div> : null}
      {children}
    </div>
  );
}
function Kpi({title,value,sub,tip}) {
  return (
    <div style={{border:`1px solid ${C_BORDER}`,borderRadius:18,padding:14,background:"#fff",boxShadow:"0 8px 24px rgba(15,23,42,0.04)"}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center"}}>
        <div style={{fontSize:12,fontWeight:950,color:"#334155"}}>{title}</div>
        {tip ? <div title={tip} style={{fontSize:12,color:C_MUTED,fontWeight:950,cursor:"help"}}>ⓘ</div> : null}
      </div>
      <div style={{marginTop:8,fontSize:20,fontWeight:950,color:C_TEXT,letterSpacing:"-0.3px"}}>{value}</div>
      {sub ? <div style={{marginTop:8,fontSize:12,fontWeight:850,color:"#475569",lineHeight:1.25}}>{sub}</div> : null}
    </div>
  );
}

export default function FxTariffCompareTab(){
  const fileInputRef=useRef(null);
  const [file,setFile]=useState(null);
  const [options,setOptions]=useState({cars:[],groups:[],markets:[],months:[]});
  const [car,setCar]=useState("");
  const [group,setGroup]=useState("");
  const [market,setMarket]=useState("");
  const [q,setQ]=useState("");

  const [planFx,setPlanFx]=useState("1350");
  const [tariffPct,setTariffPct]=useState("25");
  const [fxMode,setFxMode]=useState("auto");
  const [fxChangePct,setFxChangePct]=useState("0");
  const [costRatePct,setCostRatePct]=useState("85");

  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState(null);
  const [result,setResult]=useState(null);

  const [fxForecast,setFxForecast]=useState(null);
  const [fxForecastLoading,setFxForecastLoading]=useState(false);
  const [fxForecastErr,setFxForecastErr]=useState(null);
  const [forecastMonths,setForecastMonths]=useState("12");

  const [bestExpPct,setBestExpPct]=useState("5");            // 최고: 수출 매출 증감(%)
  const [bestTariffDelta,setBestTariffDelta]=useState("0");   // 최고: 관세 추가/차감(%p)
  const [worstExpPct,setWorstExpPct]=useState("-5");          // 최악: 수출 매출 증감(%)
  const [worstTariffDelta,setWorstTariffDelta]=useState("5");  // 최악: 관세 추가/차감(%p)

  // 최초 수동 실행 이후 자동 반영을 켜기 위한 플래그
  const [autoArmed,setAutoArmed]=useState(false);
  const analyzeAbortRef=useRef(null);
  const autoTimerRef=useRef(null);
  const lastAutoKeyRef=useRef(null);

  const [tableQ,setTableQ]=useState("");
  const [tableSortKey,setTableSortKey]=useState("delta_krw"); // delta_krw | tariff_cost | base_krw | net_krw
  const [tableSortDir,setTableSortDir]=useState("desc"); // asc | desc
  const [summaryScope,setSummaryScope]=useState("all"); // all | ym

  const loadOptions=async(f)=>{
    const fd=new FormData();
    fd.append("file",f);
    const res=await fetch("/api/external/fx-tariff/v2/options",{method:"POST",body:fd});
    const data=await res.json().catch(()=>({}));
    if(!res.ok || data.ok===false) throw new Error(data?.error || `HTTP ${res.status}`);
    setOptions(data.options || {cars:[],groups:[],markets:[],months:[]});
  };

  useEffect(()=>{
    if(!file) return;
    loadOptions(file).catch(e=>setErr(e.message||String(e)));
  },[file]);

  const onReset=()=>{
    try{
      if(analyzeAbortRef.current) analyzeAbortRef.current.abort();
    }catch(_e){}
    analyzeAbortRef.current=null;
    if(autoTimerRef.current) clearTimeout(autoTimerRef.current);
    autoTimerRef.current=null;
    lastAutoKeyRef.current=null;

    setFile(null);
    setOptions({cars:[],groups:[],markets:[],months:[]});
    setCar(""); setGroup(""); setMarket(""); setQ("");
    setPlanFx("1350"); setTariffPct("25");
    setFxMode("auto"); setFxChangePct("0");
    setCostRatePct("85");
    setAutoArmed(false);
    setResult(null); setErr(null);
    setLoading(false);
    if(fileInputRef.current) fileInputRef.current.value="";
  };

  const fileKey=useMemo(()=> file ? `${file.name}|${file.size}|${file.lastModified}` : "", [file]);
  const autoAnalyzeKey=useMemo(()=> JSON.stringify({
    fileKey,
    car: car||"",
    group: group||"",
    market: market||"",
    q: (q||"").trim(),
    planFx: planFx||"",
    tariffPct: tariffPct||"",
    fxMode: fxMode||"",
    fxChangePct: fxMode==="pct" ? (fxChangePct||"") : "0",
    costRatePct: costRatePct ?? "",
    forecastMonths: forecastMonths || "",
    bestExpPct: bestExpPct || "",
    bestTariffDelta: bestTariffDelta || "",
    worstExpPct: worstExpPct || "",
    worstTariffDelta: worstTariffDelta || "",
  }), [fileKey, car, group, market, q, planFx, tariffPct, fxMode, fxChangePct, costRatePct, forecastMonths, bestExpPct, bestTariffDelta, worstExpPct, worstTariffDelta]);

  const runAnalyze=useCallback(async({silent=false}={})=>{
    if(!file){
      if(!silent) setErr("판매계획 파일을 선택하세요.");
      return;
    }

    if(analyzeAbortRef.current){
      try{ analyzeAbortRef.current.abort(); }catch(_e){}
    }
    const ac=new AbortController();
    analyzeAbortRef.current=ac;

    setLoading(true);
    setErr(null);
    try{
      const fd=new FormData();
      fd.append("file",file);
      fd.append("car",car||"");
      fd.append("group",group||"");
      fd.append("market",market||"");
      fd.append("q",(q||"").trim());
      fd.append("plan_fx",planFx||"1350");
      fd.append("tariff_pct",tariffPct||"0");
      fd.append("fx_mode",fxMode);
      fd.append("fx_change_pct", fxMode==="pct" ? (fxChangePct||"0") : "0");
      fd.append("cost_rate_pct", costRatePct ?? "");
      fd.append("forecast_months", forecastMonths || "");
      fd.append("scenario_best_exp_pct", bestExpPct || "");
      fd.append("scenario_best_tariff_delta_pct", bestTariffDelta || "");
      fd.append("scenario_worst_exp_pct", worstExpPct || "");
      fd.append("scenario_worst_tariff_delta_pct", worstTariffDelta || "");

      const res=await fetch("/api/external/fx-tariff/v2/analyze",{method:"POST",body:fd,signal:ac.signal});
      const data=await res.json().catch(()=>({}));
      if(ac.signal.aborted) return;
      if(!res.ok || data.ok===false) throw new Error(data?.error || `HTTP ${res.status}`);
      setResult(data);
      setAutoArmed(true);           // 첫 실행 이후 자동 모드 활성화
      lastAutoKeyRef.current=autoAnalyzeKey; // 직후 중복 실행 방지
    }catch(e){
      if(e?.name==="AbortError") return;
      setErr(e?.message||String(e));
      setResult(null);
    }finally{
      if(analyzeAbortRef.current===ac) analyzeAbortRef.current=null;
      setLoading(false);
    }
  }, [file, car, group, market, q, planFx, tariffPct, fxMode, fxChangePct, costRatePct, autoAnalyzeKey, forecastMonths, bestExpPct, bestTariffDelta, worstExpPct, worstTariffDelta]);

  useEffect(()=>{
    if(!autoArmed) return;
    if(!file) return;

    if(autoTimerRef.current) clearTimeout(autoTimerRef.current);
    autoTimerRef.current=setTimeout(()=>{
      if(autoAnalyzeKey===lastAutoKeyRef.current) return;
      lastAutoKeyRef.current=autoAnalyzeKey;
      runAnalyze({silent:true});
    }, 450);

    return ()=>{
      if(autoTimerRef.current) clearTimeout(autoTimerRef.current);
    };
  }, [autoArmed, autoAnalyzeKey, file, runAnalyze]);

  const loadForecast=async()=>{
    try{
      setFxForecastLoading(true); setFxForecastErr(null);
      const months=Math.max(1,Math.min(120,Number(forecastMonths)||12));
      const res=await fetch(`/api/external/fx/forecast?months=${months}`);
      const data=await res.json().catch(()=>({}));
      if(!res.ok || data.ok===false) throw new Error(data?.error || `HTTP ${res.status}`);
      setFxForecast(data);
    }catch(e){
      setFxForecastErr(e.message||String(e));
    }finally{
      setFxForecastLoading(false);
    }
  };

  useEffect(()=>{
    // 예측기간 변경 시 환율 예측 및 분석 결과를 함께 갱신
    if(!forecastMonths) return;
    loadForecast().catch(()=>{});
    if(file){
      runAnalyze({silent:true});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forecastMonths]);

  const total=useMemo(()=> result?.summary?.total ?? {}, [result]);
  const domestic=useMemo(()=> result?.summary?.domestic ?? {}, [result]);
  const exportSum=useMemo(()=> result?.summary?.export ?? {}, [result]);
  const exec=useMemo(()=> result?.exec ?? {}, [result]);
  const monthly=useMemo(()=> result?.monthly_series ?? [], [result]);
  const monthOptions=useMemo(()=> monthly.map(m=>m.ym), [monthly]);

  const scope = useMemo(()=>{
    const num = (v)=>Number(v)||0;
    if(summaryScope!=="all"){
      const m = monthly.find(x=>x.ym===summaryScope);
      if(m){
        const plan = num(m["내수_base"])+num(m["직수출_base"]);
        const scenario = num(m["내수_scenario"])+num(m["직수출_scenario"]);
        const net = num(m["내수_net"])+num(m["직수출_net"]);
        const tariffCost = num(m["직수출_tariff"]);
        const opmFx = m["전체_opm"];
        if(plan!==0 || scenario!==0 || net!==0 || tariffCost!==0){
          return {plan, scenario, net, tariffCost, opmFx, opmPlan:null};
        }
      }
    }
    return {
      plan: num(total.base_krw),
      scenario: num(total.scenario_krw),
      net: num(total.net_krw),
      tariffCost: num(total.tariff_cost),
      opmFx: exec?.fx_opm,
      opmPlan: exec?.plan_opm,
    };
  }, [summaryScope, monthly, total, exec]);

  const baseRev=Number(scope.plan||0);
  const fxRev=Number(scope.scenario||0);
  const netRev=Number(scope.net||0);
  const deltaFx=fxRev-baseRev;
  const deltaFxPct=baseRev ? (deltaFx/baseRev)*100 : 0;
  const deltaNet=netRev-baseRev;
  const deltaNetPct=baseRev ? (deltaNet/baseRev)*100 : 0;

  const ebitSc=exec?.ebit_scenarios||null;
  const ebitBar=useMemo(()=> ebitSc ? [
    {name:"최악(비관)", ebit: ebitSc.worst, desc:"직수출 매출 -5%, 관세 +5%p 가정(데모)"},
    {name:"기준", ebit: ebitSc.base, desc:"현재 입력값(환율/관세/원가율) 반영(데모)"},
    {name:"최고(낙관)", ebit: ebitSc.best, desc:"직수출 매출 +5%, 관세 0 가정(데모)"},
  ] : [], [ebitSc]);

  const fxChart=useMemo(()=>{
    const rates=fxForecast?.rates||{};
    const months=Object.keys(rates).sort();
    if(!months.length) return [];
    if(fxMode!=="pct"){
      return months.map(ym=>({ym, rate: rates[ym]}));
    }
    const start = Number(planFx)||Number(rates[months[0]]||0)||0;
    const pct = Number(fxChangePct)||0;
    const end = start*(1+pct/100);
    const patList = months.map(m=>Number(rates[m]||start));
    const lin = months.length>1 ? months.map((_,i)=>i/(months.length-1)) : [0];
    let patNorm=[];
    if(patList.length){
      const pmin=Math.min(...patList);
      const pmax=Math.max(...patList);
      patNorm = (pmax===pmin) ? patList.map(()=>0) : patList.map(v=>(v-pmin)/(pmax-pmin));
    }else{
      patNorm = lin.map(()=>0);
    }
    const blend=0.7;
    const out=[];
    months.forEach((ym,idx)=>{
      let t = blend*(patNorm[idx]??lin[idx]) + (1-blend)*lin[idx];
      let rate = start + (end-start)*t;
      if(idx===0) rate=start;
      if(idx===months.length-1) rate=end;
      out.push({ym, rate});
    });
    return out;
  },[fxForecast, fxMode, planFx, fxChangePct]);

  const fxDomain=useMemo(()=>{
    const vals=fxChart.map(d=>Number(d.rate)).filter(Number.isFinite);
    if(!vals.length) return [0, 0];
    const min=Math.min(...vals);
    const max=Math.max(...vals);
    const range=max-min;
    const pad=Math.max(range*0.2, min*0.005, 5);
    return [Math.max(0, min-pad), max+pad];
  },[fxChart]);

  const opmFxVal = scope.opmFx ?? exec?.fx_opm;
  const opmPlanVal = scope.opmPlan ?? exec?.plan_opm;
  const opmDeltaVal = (opmFxVal!=null && opmPlanVal!=null) ? (opmFxVal - opmPlanVal) : exec?.opm_pp;

  const impactData=useMemo(()=>{
    if(!result) return [];
    const plan=Number(scope.plan||0);
    const fxTotal=Number(scope.scenario||0);
    const netTotal=Number(scope.net||0);
    const fxDelta=fxTotal-plan;
    const tariffCost=Math.max(0, Number(scope.tariffCost||0));
    return [
      {name:"계획", kind:"plan", total: plan, plan, fxDelta:0, tariffCost:0, net: plan},
      {name:"FX 반영(관세 전)", kind:"fx", total: fxTotal, plan, fxDelta, tariffCost:0, net: fxTotal},
      {name:"순매출(관세 반영)", kind:"net", total: netTotal, plan, fxDelta, tariffCost, net: netTotal},
    ];
  },[result, scope]);

  const marginSeries=useMemo(()=> monthly.map(m=>({
    ym: m.ym,
    opm: m["전체_opm"],
    exportShare: m["직수출_비중"],
    ebit: m["전체_ebit"],
  })),[monthly]);

  const hasMargin=useMemo(()=> monthly.some(m=>m["전체_opm"]!=null),[monthly]);

  const opmDomain=useMemo(()=>{
    const vals=marginSeries.map(d=>Number(d.opm)).filter(Number.isFinite);
    if(!vals.length) return [-10, 30];
    let min=Math.min(...vals);
    let max=Math.max(...vals);
    if(min===max){
      min-=2;
      max+=2;
    }
    const pad=Math.max((max-min)*0.25, 2);
    return [Math.floor(min-pad), Math.ceil(max+pad)];
  },[marginSeries]);

  const shareDomain=useMemo(()=>{
    const vals=marginSeries.map(d=>Number(d.exportShare)).filter(Number.isFinite);
    if(!vals.length) return [0, 100];
    let min=Math.min(...vals);
    let max=Math.max(...vals);
    if(min===max){
      min=Math.max(0, min-5);
      max=Math.min(100, max+5);
    }else{
      const pad=Math.max((max-min)*0.25, 2);
      min=Math.max(0, min-pad);
      max=Math.min(100, max+pad);
    }
    return [Math.floor(min), Math.ceil(max)];
  },[marginSeries]);

  const marketOpm=useMemo(()=>{
    if(!hasMargin) return {dom:null, exp:null};
    const m=monthly.find(x=>x["내수_opm"]!=null) || {};
    return {dom:m["내수_opm"], exp:m["직수출_opm"]};
  },[hasMargin, monthly]);

  const summaryTitle = useMemo(()=>(
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
      <span>핵심 요약</span>
      {monthOptions.length ? (
        <select value={summaryScope} onChange={(e)=>setSummaryScope(e.target.value)}
          style={{padding:"6px 8px",borderRadius:10,border:`1px solid ${C_BORDER}`,fontWeight:800,fontSize:12,background:"#fff"}}>
          <option value="all">전체</option>
          {monthOptions.map(m=><option key={m} value={m}>{m}</option>)}
        </select>
      ) : null}
    </div>
  ), [summaryScope, monthOptions]);

  const itemAgg=useMemo(()=>{
    const rows=result?.rows||[];
    const map=new Map();
    for(const r of rows){
      const market=String(r.market||"").trim();
      const code=String(r.code||"").trim();
      const name=String(r.name||"").trim();
      const carName=String(r.car||"").trim();
      const groupName=String(r.group||"").trim();
      const key=`${market}|${code}|${name}|${carName}|${groupName}`;
      const cur=map.get(key) || {market, code, name, car:carName, group:groupName, base_krw:0, scenario_krw:0, delta_krw:0, tariff_cost:0, net_krw:0};
      cur.base_krw += Number(r.base_krw||0);
      cur.scenario_krw += Number(r.scenario_krw||0);
      cur.delta_krw += Number(r.delta_krw||0);
      cur.tariff_cost += Number(r.tariff_cost||0);
      cur.net_krw += Number(r.net_krw||0);
      map.set(key, cur);
    }
    return Array.from(map.values()).map(it=>({
      ...it,
      delta_pct: it.base_krw ? (it.delta_krw/it.base_krw*100.0) : 0.0,
    }));
  },[result]);

  const tableItems=useMemo(()=>{
    const q=(tableQ||"").trim().toLowerCase();
    const dir = tableSortDir==="asc" ? 1 : -1;
    const key = tableSortKey || "delta_krw";

    const filtered = !q ? itemAgg : itemAgg.filter(it=>
      String(it.code||"").toLowerCase().includes(q) || String(it.name||"").toLowerCase().includes(q)
    );

    return [...filtered].sort((a,b)=>{
      const av=Number(a[key]||0);
      const bv=Number(b[key]||0);
      if(av===bv) return 0;
      return (av-bv)*dir;
    });
  },[itemAgg, tableQ, tableSortKey, tableSortDir]);

  return (
    <div style={{padding:18, display:"grid", gap:14, background:C_BG, borderRadius:24}}>
      <Card title="입력값 (판매계획/시나리오)">
        <div style={{display:"grid", gridTemplateColumns:"1.2fr 0.7fr 0.7fr 0.7fr 0.7fr", gap:10}}>
          <div>
            <div style={{fontSize:12,fontWeight:900,color:"#334155"}}>판매계획 파일</div>
            <div style={{display:"flex", gap:10, marginTop:6, alignItems:"center"}}>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv"
                onChange={(e)=>setFile(e.target.files?.[0]||null)} style={{width:"100%"}} />
              <button type="button" onClick={onReset}
                style={{padding:"10px 14px", borderRadius:12, border:"1px solid #e5e7eb", fontWeight:950, background:"#fff", cursor:"pointer", whiteSpace:"nowrap"}}>
                초기화
              </button>
            </div>
          </div>

          <div>
            <div style={{fontSize:12,fontWeight:900,color:"#334155"}}>차종</div>
            <select value={car} onChange={(e)=>setCar(e.target.value)}
              style={{marginTop:6,width:"100%",padding:"10px 12px",borderRadius:12,border:"1px solid #e5e7eb",fontWeight:900}}>
              <option value="">전체</option>
              {options.cars.map(c=><option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <div style={{fontSize:12,fontWeight:900,color:"#334155"}}>자재그룹</div>
            <select value={group} onChange={(e)=>setGroup(e.target.value)}
              style={{marginTop:6,width:"100%",padding:"10px 12px",borderRadius:12,border:"1px solid #e5e7eb",fontWeight:900}}>
              <option value="">전체</option>
              {options.groups.map(g=><option key={g} value={g}>{g}</option>)}
            </select>
          </div>

          <div>
            <div style={{fontSize:12,fontWeight:900,color:"#334155"}}>시장</div>
            <select value={market} onChange={(e)=>setMarket(e.target.value)}
              style={{marginTop:6,width:"100%",padding:"10px 12px",borderRadius:12,border:"1px solid #e5e7eb",fontWeight:900}}>
              <option value="">전체</option>
              <option value="내수">내수</option>
              <option value="직수출">직수출</option>
            </select>
          </div>

          <div>
            <div style={{fontSize:12,fontWeight:900,color:"#334155"}}>부품 검색</div>
            <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="자재코드 / 자재내역"
              onKeyDown={(e)=>{ if(e.key==="Enter") runAnalyze(); }}
              style={{marginTop:6,width:"100%",padding:"10px 12px",borderRadius:12,border:"1px solid #e5e7eb",fontWeight:900}} />
          </div>
        </div>

        <div style={{marginTop:12, display:"grid", gridTemplateColumns:"0.7fr 0.7fr 0.9fr 0.7fr 0.9fr", gap:10}}>
          <div>
            <div style={{fontSize:12,fontWeight:900,color:"#334155"}}>계획환율(원)</div>
            <input value={planFx} onChange={(e)=>setPlanFx(e.target.value)}
              style={{marginTop:6,width:"100%",padding:"10px 12px",borderRadius:12,border:"1px solid #e5e7eb",fontWeight:900}} />
          </div>

          <div>
            <div style={{fontSize:12,fontWeight:900,color:"#334155"}}>관세(%)</div>
            <input value={tariffPct} onChange={(e)=>setTariffPct(e.target.value)}
              style={{marginTop:6,width:"100%",padding:"10px 12px",borderRadius:12,border:"1px solid #e5e7eb",fontWeight:900}} />
            <div style={{marginTop:4,fontSize:11,color:"#64748b",fontWeight:800}}>※ 관세는 직수출에만 적용</div>
          </div>

          <div>
            <div style={{fontSize:12,fontWeight:900,color:"#334155"}}>환율 모드</div>
            <select value={fxMode} onChange={(e)=>setFxMode(e.target.value)}
              style={{marginTop:6,width:"100%",padding:"10px 12px",borderRadius:12,border:"1px solid #e5e7eb",fontWeight:900}}>
              <option value="auto">자동 예측</option>
              <option value="pct">퍼센트 조정</option>
            </select>
          </div>

          <div>
            <div style={{fontSize:12,fontWeight:900,color:"#334155"}}>환율 변화(%)</div>
            <input value={fxChangePct} onChange={(e)=>setFxChangePct(e.target.value)} disabled={fxMode!=="pct"}
              style={{marginTop:6,width:"100%",padding:"10px 12px",borderRadius:12,border:"1px solid #e5e7eb",fontWeight:900, background: fxMode!=="pct" ? "#f1f5f9" : "#fff"}} />
            <div style={{marginTop:4,fontSize:11,color:"#64748b",fontWeight:800}}>※ 퍼센트 조정: +% 원화강세 가정(직수출 불리) / -% 원화약세(직수출 유리)</div>
          </div>

          <div>
            <div style={{fontSize:12,fontWeight:900,color:"#334155"}}>영업비용률(%)</div>
            <input value={costRatePct} onChange={(e)=>setCostRatePct(e.target.value)} placeholder="(선택) 예: 85"
              style={{marginTop:6,width:"100%",padding:"10px 12px",borderRadius:12,border:"1px solid #e5e7eb",fontWeight:900}} />
            <div style={{marginTop:4,fontSize:11,color:"#64748b",fontWeight:800}}>※ OPM/EBIT 계산용(선택)</div>
          </div>
        </div>

        <div style={{marginTop:14, display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
          <div style={{display:"grid", gap:8}}>
            <div style={{fontSize:12,fontWeight:950,color:"#334155"}}>실시간 반영</div>

            <button
              type="button"
              onClick={()=>{
                try{ if(analyzeAbortRef.current) analyzeAbortRef.current.abort(); }catch(_e){}
                if(autoTimerRef.current) clearTimeout(autoTimerRef.current);
                lastAutoKeyRef.current=null;
                runAnalyze();
              }}
              disabled={loading}
              style={{
                padding:"14px 16px",
                borderRadius:14,
                border:`1px solid ${C_BORDER}`,
                background:C_BLUE,
                color:"#fff",
                fontWeight:950,
                cursor:"pointer",
              }}
            >
              {loading ? "반영 중..." : "지금 반영"}
            </button>

            <div style={{fontSize:11,color:"#64748b",fontWeight:800}}>
              지금 반영을 한 번 누르면 이후 입력/필터 변경을 자동으로 감지해 바로 재계산합니다.
            </div>
          </div>

          <div style={{display:"flex", gap:10, alignItems:"center", justifyContent:"space-between"}}>
            <div style={{display:"flex", gap:10, alignItems:"center"}}>
              <div style={{fontSize:12,fontWeight:900,color:"#334155"}}>예측기간(개월)</div>
              <input value={forecastMonths} onChange={(e)=>setForecastMonths(e.target.value)}
                style={{width:90,padding:"10px 12px",borderRadius:12,border:"1px solid #e5e7eb",fontWeight:900}} />
            </div>
            <button type="button" onClick={loadForecast}
              style={{padding:"14px 16px",borderRadius:14,border:"1px solid #e5e7eb",background:"#fff",color:"#0f172a",fontWeight:950,cursor:"pointer",whiteSpace:"nowrap"}}>
              환율 예측하기
            </button>
          </div>
        </div>

        {err ? <div style={{marginTop:10,color:"#dc2626",fontWeight:900}}>{String(err)}</div> : null}
      </Card>

      <Card title={summaryTitle}>
        <div style={{display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))", gap:12}}>
          <Kpi
            title="계획 매출(합계)"
            value={<span title={fmtKRW(baseRev)}>{fmtKRWShort(baseRev)}</span>}
            sub={<span>환율 영향(관세 전): {fmtKRWShort(deltaFx)} ({fmtPct(deltaFxPct)} <Arrow v={deltaFxPct} />)</span>}
            tip="업로드 파일 + 필터(차종/그룹/시장/검색) 적용 합계"
          />

          <Kpi
            title="순매출(환율/관세 반영)"
            value={<span title={fmtKRW(netRev)}>{fmtKRWShort(netRev)}</span>}
            sub={<span>계획 대비: {fmtKRWShort(deltaNet)} ({fmtPct(deltaNetPct)} <Arrow v={deltaNetPct} />)</span>}
            tip="순매출 = FX 반영 매출 - 관세비용(직수출)"
          />

          <Kpi
            title="영업이익률(OPM, 추정)"
            value={opmFxVal==null ? "-" : <span>{fmtPct(opmFxVal)}{opmDeltaVal!=null ? <span style={{color:C_MUTED,fontWeight:900}}> ({fmtPp(opmDeltaVal)} <Arrow v={opmDeltaVal} />)</span> : null}</span>}
            sub={opmFxVal==null
              ? "원가율(%) 입력 후 계산됩니다"
              : (opmPlanVal!=null
                  ? <span>계획 {fmtPct(opmPlanVal)} → 시나리오 {fmtPct(opmFxVal)} · 관세 제외 {exec?.fx_opm_pre==null ? "-" : fmtPct(exec.fx_opm_pre)}</span>
                  : <span>선택 범위 OPM(추정): {fmtPct(opmFxVal)}</span>)}
            tip="OPM = (세전영업이익/매출)×100, 관세는 직수출에만 반영(데모)"
          />

          <Kpi
            title="환율 1% 민감도(EBIT)"
            value={exec?.fx_sensitivity_ebit_delta_1pct==null && exec?.fx_sensitivity_op_delta_1pct==null
              ? "-"
              : <span title={fmtKRW(exec?.fx_sensitivity_ebit_delta_1pct ?? exec?.fx_sensitivity_op_delta_1pct)}>{fmtKRWShort(exec?.fx_sensitivity_ebit_delta_1pct ?? exec?.fx_sensitivity_op_delta_1pct)}</span>}
            sub={<span>USD/KRW +1% 시 세전영업이익(EBIT) 변화액(추정)</span>}
            tip="직수출 매출만 환율 연동(데모). 값이 +면 이익 증가, -면 감소"
          />

          <Kpi
            title="관세 비용(직수출, 추정)"
            value={<span title={fmtKRW(scope.tariffCost)}>{fmtKRWShort(scope.tariffCost)}</span>}
            sub={<span>직수출 매출 × 관세율 {Number(tariffPct||0)}% · 노출 매출: {fmtKRWShort(exportSum.scenario_krw)}</span>}
            tip="관세는 직수출에만 적용(데모)"
          />
        </div>

        <div style={{marginTop:12, display:"grid", gridTemplateColumns:"1.2fr 1fr", gap:12}}>
          <Card title="세전영업이익(EBIT) 시나리오 (최악/기준/최고)">
            {ebitBar.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={ebitBar}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{fontSize:11,fontWeight:800}} />
                  <YAxis tick={{fontSize:11,fontWeight:800}} tickFormatter={(v)=>fmtKRWUnit(v)} />
                  <Tooltip content={<EbitScenarioTooltip />} />
                  <Legend />
                  <ReferenceLine y={0} stroke={C_BORDER} />
                  <Bar dataKey="ebit" name="세전영업이익(EBIT, 추정)" fill={C_INDIGO} radius={[10,10,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <div style={{fontSize:12,color:"#64748b",fontWeight:800}}>원가율 입력 후 분석 실행 시 표시됩니다.</div>}
            <div style={{marginTop:8,fontSize:11,color:"#64748b",fontWeight:800}}>※ EBIT = 이자·세금 차감 전 이익(세전영업이익)</div>
            <div style={{marginTop:12, display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))", gap:10}}>
              <div style={{border:`1px solid ${C_BORDER}`,borderRadius:14,padding:10,background:"#fff"}}>
                <div style={{fontSize:12,fontWeight:900,color:"#334155"}}>최악(비관) 가정</div>
                <div style={{marginTop:8,display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <label style={{fontSize:12,fontWeight:800,color:"#475569"}}>수출 매출 증감(%)</label>
                  <input value={worstExpPct} onChange={(e)=>setWorstExpPct(e.target.value)}
                    type="number" style={{padding:"8px 10px",borderRadius:10,border:`1px solid ${C_BORDER}`,fontWeight:900}} />
                  <label style={{fontSize:12,fontWeight:800,color:"#475569"}}>관세 조정(+/- %p)</label>
                  <input value={worstTariffDelta} onChange={(e)=>setWorstTariffDelta(e.target.value)}
                    type="number" style={{padding:"8px 10px",borderRadius:10,border:`1px solid ${C_BORDER}`,fontWeight:900}} />
                </div>
              </div>

              <div style={{border:`1px solid ${C_BORDER}`,borderRadius:14,padding:10,background:"#fff"}}>
                <div style={{fontSize:12,fontWeight:900,color:"#334155"}}>최고(낙관) 가정</div>
                <div style={{marginTop:8,display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <label style={{fontSize:12,fontWeight:800,color:"#475569"}}>수출 매출 증감(%)</label>
                  <input value={bestExpPct} onChange={(e)=>setBestExpPct(e.target.value)}
                    type="number" style={{padding:"8px 10px",borderRadius:10,border:`1px solid ${C_BORDER}`,fontWeight:900}} />
                  <label style={{fontSize:12,fontWeight:800,color:"#475569"}}>관세 조정(+/- %p)</label>
                  <input value={bestTariffDelta} onChange={(e)=>setBestTariffDelta(e.target.value)}
                    type="number" style={{padding:"8px 10px",borderRadius:10,border:`1px solid ${C_BORDER}`,fontWeight:900}} />
                </div>
              </div>
            </div>
          </Card>

          <Card title="환율 예측 (Mini)">
            {fxForecastLoading ? <div style={{fontSize:12,fontWeight:800,color:"#64748b"}}>불러오는 중...</div> :
             fxForecastErr ? <div style={{fontSize:12,fontWeight:900,color:"#dc2626"}}>{String(fxForecastErr)}</div> :
             fxChart.length ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={fxChart} margin={{top:8,right:12,left:0,bottom:0}}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="ym" tick={{fontSize:11,fontWeight:800}} />
                  <YAxis domain={fxDomain} tick={{fontSize:11,fontWeight:800}} tickFormatter={(v)=>Number(v).toLocaleString("ko-KR")} />
                  <Tooltip formatter={(v)=>Number(v).toLocaleString("ko-KR")} />
                  <Line type="monotone" dataKey="rate" name="예측 환율" stroke={C_BLUE} dot={{r:2}} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
             ) : <div style={{fontSize:12,color:"#64748b",fontWeight:800}}>예측 데이터를 불러오면 표시됩니다.</div>}
          </Card>
        </div>
      </Card>

      <Card title="월별 매출(계획 vs 순매출) / 시장 비교">
        <div style={{display:"grid", gridTemplateColumns:"1.2fr 1fr", gap:12}}>
          <Card title="월별 계획 매출 vs FX/관세 반영 순매출">
            {monthly.length ? (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={monthly.map(m=>({ym:m.ym, plan:(m["내수_base"]||0)+(m["직수출_base"]||0), net:(m["내수_net"]||0)+(m["직수출_net"]||0)}))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <Tooltip formatter={(v)=>fmtKRW(v)} />
                  <Legend />
                  <Line type="monotone" dataKey="plan" name="계획(Plan)" stroke={C_BLUE} dot={false} />
                  <Line type="monotone" dataKey="net" name="순매출(환율/관세)" stroke={C_ORANGE} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : <div style={{fontSize:12,color:"#64748b",fontWeight:800}}>분석 실행 후 표시됩니다.</div>}
          </Card>

          <Card title="내수 vs 직수출 (Base vs 순매출)">
            {result ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={[
                  {name:"내수", base: domestic.base_krw||0, net: domestic.net_krw||0},
                  {name:"직수출", base: exportSum.base_krw||0, net: exportSum.net_krw||0},
                ]}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{fontSize:11,fontWeight:800}} />
                  <YAxis tick={{fontSize:11,fontWeight:800}} tickFormatter={(v)=>fmtKRWUnit(v)} />
                  <Tooltip formatter={(v)=>fmtKRW(v)} />
                  <Legend />
                  <Bar dataKey="base" name="계획 매출" fill={C_BLUE} radius={[10,10,0,0]} />
                  <Bar dataKey="net" name="순매출(환율/관세)" fill={C_ORANGE} radius={[10,10,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <div style={{fontSize:12,color:"#64748b",fontWeight:800}}>분석 실행 후 표시됩니다.</div>}
            <div style={{marginTop:8,fontSize:11,color:"#64748b",fontWeight:800}}>※ 순매출 = FX 반영 매출 - 관세비용(직수출)</div>
          </Card>
        </div>
      </Card>

      <Card title="경영진 인사이트">
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12}}>
          <Card title="FX/관세 영향 분해 (총액)">
            {result ? (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={impactData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{fontSize:11,fontWeight:800}} />
                  <YAxis tick={{fontSize:11,fontWeight:800}} tickFormatter={(v)=>fmtKRWUnit(v)} />
                  <Tooltip content={<ImpactTooltip />} />
                  <ReferenceLine y={0} stroke={C_BORDER} />
                  <Bar dataKey="total" name="매출" radius={[10,10,0,0]}>
                    {impactData.map((d,idx)=>(
                      <Cell key={`impact-${idx}`} fill={d.kind==="plan" ? C_BLUE : d.kind==="fx" ? C_ORANGE : C_PURPLE} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <div style={{fontSize:12,color:"#64748b",fontWeight:800}}>분석 실행 후 표시됩니다.</div>}
            <div style={{marginTop:8,fontSize:11,color:"#64748b",fontWeight:800}}>
              ※ FX 영향은 환율 방향에 따라 증가/감소 모두 가능합니다. 순매출 = FX 반영 매출 - 관세비용
            </div>
          </Card>

          <Card title="월별 마진율(추정) / 직수출 비중">
            {hasMargin ? (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={marginSeries}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="ym" tick={{fontSize:11,fontWeight:800}} />
                  <YAxis yAxisId="opm" domain={opmDomain} tick={{fontSize:11,fontWeight:800}} tickFormatter={(v)=>fmtPct(v,0)} />
                  <YAxis yAxisId="share" orientation="right" domain={shareDomain} tick={{fontSize:11,fontWeight:800}} tickFormatter={(v)=>fmtPct(v,0)} />
                  <Tooltip formatter={(v)=>fmtPct(v,2)} />
                  <Legend />
                  <ReferenceLine yAxisId="opm" y={0} stroke={C_BORDER} />
                  <Line yAxisId="opm" type="monotone" dataKey="opm" name="영업이익률(OPM, 추정)" stroke={C_PURPLE} dot={false} strokeWidth={2} />
                  <Line yAxisId="share" type="monotone" dataKey="exportShare" name="직수출 비중" stroke={C_ORANGE} dot={false} strokeWidth={2} strokeDasharray="6 4" />
                </LineChart>
              </ResponsiveContainer>
            ) : <div style={{fontSize:12,color:"#64748b",fontWeight:800}}>원가율(%) 입력 후 분석 실행 시 계산됩니다.</div>}
            <div style={{marginTop:8,fontSize:11,color:"#64748b",fontWeight:800}}>
              ※ 내수 마진율(추정): {marketOpm.dom==null ? "-" : fmtPct(marketOpm.dom)} · 직수출 마진율(추정): {marketOpm.exp==null ? "-" : fmtPct(marketOpm.exp)} (원가율 동일 가정, 관세는 직수출만 반영)
            </div>
          </Card>
        </div>
      </Card>

      <Card title="Top 영향 자재 (집계)">
        <div style={{display:"flex", gap:10, flexWrap:"wrap", alignItems:"center", justifyContent:"space-between"}}>
          <div style={{fontSize:12,fontWeight:900,color:"#334155"}}>
            {result ? `집계 ${tableItems.length.toLocaleString("ko-KR")}건 · 표시 ${Math.min(100, tableItems.length).toLocaleString("ko-KR")}건` : "분석 실행 후 표시됩니다."}
          </div>
          <div style={{display:"flex", gap:10, flexWrap:"wrap", alignItems:"center", justifyContent:"flex-end"}}>
            <input value={tableQ} onChange={(e)=>setTableQ(e.target.value)} placeholder="테이블 검색(코드/내역)"
              style={{width:220,padding:"10px 12px",borderRadius:12,border:"1px solid #e5e7eb",fontWeight:900}} />
            <select value={tableSortKey} onChange={(e)=>setTableSortKey(e.target.value)}
              style={{padding:"10px 12px",borderRadius:12,border:"1px solid #e5e7eb",fontWeight:900}}>
              <option value="delta_krw">증감(Δ)</option>
              <option value="tariff_cost">관세비용</option>
              <option value="base_krw">계획 매출</option>
              <option value="net_krw">순매출</option>
            </select>
            <button type="button" onClick={()=>setTableSortDir(d=>d==="asc" ? "desc" : "asc")}
              style={{padding:"10px 12px",borderRadius:12,border:"1px solid #e5e7eb",background:"#fff",fontWeight:950,cursor:"pointer"}}>
              {tableSortDir==="asc" ? "오름차순" : "내림차순"}
            </button>
          </div>
        </div>

        {result ? (
          <>
            <div style={{marginTop:8,fontSize:11,color:"#64748b",fontWeight:800}}>
              적용 필터: 차종 {car||"전체"} / 자재그룹 {group||"전체"} / 시장 {market||"전체"} / 검색 {q?.trim() ? q.trim() : "-"}
            </div>
            <div style={{marginTop:10, overflowX:"auto"}}>
              <table style={{width:"100%", borderCollapse:"separate", borderSpacing:0}}>
                <thead>
                  <tr>
                    {["시장","차종","자재그룹","자재코드","자재내역","계획 매출","FX 반영","증감(Δ)","관세비용","순매출"].map(h=>(
                      <th key={h} style={{textAlign:"left",fontSize:12,fontWeight:950,color:"#0f172a",padding:"10px 12px",borderBottom:"1px solid #e5e7eb",background:"#f8fafc",whiteSpace:"nowrap"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableItems.slice(0,100).map((it,idx)=>(
                    <tr key={`${it.market}|${it.code}|${idx}`}>
                      <td style={{padding:"10px 12px",borderBottom:"1px solid #f1f5f9",fontWeight:900,whiteSpace:"nowrap"}}>{it.market||"-"}</td>
                      <td style={{padding:"10px 12px",borderBottom:"1px solid #f1f5f9",fontWeight:900,whiteSpace:"nowrap"}}>{it.car||"-"}</td>
                      <td style={{padding:"10px 12px",borderBottom:"1px solid #f1f5f9",fontWeight:900,whiteSpace:"nowrap"}}>{it.group||"-"}</td>
                      <td style={{padding:"10px 12px",borderBottom:"1px solid #f1f5f9",fontWeight:900,whiteSpace:"nowrap"}}>{it.code||"-"}</td>
                      <td style={{padding:"10px 12px",borderBottom:"1px solid #f1f5f9",fontWeight:900,whiteSpace:"nowrap"}}>{it.name||"-"}</td>
                      <td style={{padding:"10px 12px",borderBottom:"1px solid #f1f5f9",fontWeight:900,whiteSpace:"nowrap"}}>{fmtKRW(it.base_krw)}</td>
                      <td style={{padding:"10px 12px",borderBottom:"1px solid #f1f5f9",fontWeight:900,whiteSpace:"nowrap"}}>{fmtKRW(it.scenario_krw)}</td>
                      <td style={{padding:"10px 12px",borderBottom:"1px solid #f1f5f9",fontWeight:900,whiteSpace:"nowrap"}}>
                        {fmtKRW(it.delta_krw)} <span style={{color:"#64748b"}}>({fmtPct(it.delta_pct)})</span> <Arrow v={it.delta_krw} />
                      </td>
                      <td style={{padding:"10px 12px",borderBottom:"1px solid #f1f5f9",fontWeight:900,whiteSpace:"nowrap"}}>{fmtKRW(it.tariff_cost)}</td>
                      <td style={{padding:"10px 12px",borderBottom:"1px solid #f1f5f9",fontWeight:900,whiteSpace:"nowrap"}}>{fmtKRW(it.net_krw)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </Card>
    </div>
  );
}
