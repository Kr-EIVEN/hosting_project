// src/components/tabs/ForecastTab.js
import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  Cell,
  Brush,
} from "recharts";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { BRAND_ORANGE, BRAND_GREEN, BRAND_DARK } from "../../config/plConfig";

// ===============================
// 시나리오 항목 (주요 비용 드라이버)
// ===============================
const DRIVER_OPTIONS = [
  { key: "원재료비", label: "원재료비" },
  { key: "부재료비(전체)", label: "부재료비(전체)" },
  { key: "급여(전체)", label: "급여(전체)" },
  { key: "판관비(전체)", label: "판관비(전체)" },
];

// ✅ 예측 기간 옵션 (최대 3년)
const PERIOD_OPTIONS = [
  { value: 3, label: "3개월" },
  { value: 6, label: "6개월" },
  { value: 12, label: "12개월 (1년)" },
  { value: 36, label: "36개월 (3년)" },
];

// 숫자 포맷
const fmt = (v) =>
  typeof v === "number" ? Math.round(v).toLocaleString("ko-KR") : v ?? "-";

// 억 단위 축 포맷
const fmtHundredMillion = (v) => `${Math.round(v / 1e8)}억`;

// Impact 색상 팔레트
const IMPACT_COLORS = ["#fb7185", "#fb923c", "#22c55e", "#3b82f6", "#a855f7"];

// ✅ 추세 Legend (순서 고정 + 가운데 정렬)
const renderTrendLegend = (props) => {
  const { payload } = props;
  if (!payload || !payload.length) return null;

  const order = ["매출액", "매출원가", "영업이익"];
  const ordered = order
    .map((key) => payload.find((item) => item.dataKey === key))
    .filter(Boolean);

  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        justifyContent: "center",
        marginTop: 6,
      }}
    >
      <ul
        style={{
          listStyle: "none",
          display: "flex",
          gap: 14,
          margin: 0,
          padding: 0,
          fontSize: 11,
          color: "#374151",
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        {ordered.map((item) => (
          <li
            key={item.dataKey}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 2, // ✅ 더 각지게
                backgroundColor: item.color,
                display: "inline-block",
                boxShadow: "0 0 0 1px rgba(148,163,184,0.45)",
              }}
            />
            <span style={{ fontWeight: 800 }}>{item.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

function Pill({ children, tone = "gray", title, onClick, active }) {
  const map = {
    gray: { bg: "#f3f4f6", bd: "#e5e7eb", tx: "#374151" },
    orange: { bg: "#fff7ed", bd: "#fed7aa", tx: "#9a3412" },
    green: {
      bg: "rgba(16,185,129,0.10)",
      bd: "rgba(16,185,129,0.25)",
      tx: "#065f46",
    },
    red: {
      bg: "rgba(239,68,68,0.10)",
      bd: "rgba(239,68,68,0.25)",
      tx: "#991b1b",
    },
    blue: {
      bg: "rgba(59,130,246,0.10)",
      bd: "rgba(59,130,246,0.25)",
      tx: "#1d4ed8",
    },
  };
  const c = map[tone] || map.gray;

  const clickable = typeof onClick === "function";
  return (
    <span
      title={title}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 9px",
        borderRadius: 8, // ✅ 각지게
        border: `1px solid ${c.bd}`,
        background: active ? "rgba(59,130,246,0.14)" : c.bg,
        color: c.tx,
        fontSize: 11,
        fontWeight: 800,
        lineHeight: "16px",
        whiteSpace: "nowrap",
        cursor: clickable ? "pointer" : "default",
        userSelect: "none",
      }}
    >
      {children}
    </span>
  );
}

function ForecastTab({ cardStyle }) {
  // App.js에서 내려주는 cardStyle(통일감) 우선 사용
  const baseCardStyle = cardStyle || {
    backgroundColor: "#ffffff",
    borderRadius: 8, // ✅ 각지게
    border: "1px solid #e5e7eb",
    boxShadow: "0 0 0 rgba(0,0,0,0.02)",
    padding: 10, // ✅ 카드 자체도 조금 컴팩트
  };

  // ===============================
  // 상태
  // ===============================
  const [period, setPeriod] = useState(12);
  const [scenarioRows, setScenarioRows] = useState([
    { id: 1, driverKey: "원재료비", value: "0" },
    { id: 2, driverKey: "부재료비(전체)", value: "0" },
    { id: 3, driverKey: "급여(전체)", value: "0" },
    { id: 5, driverKey: "판관비(전체)", value: "0" },
  ]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  // ✅ 이전 12개월(실적) 로드
  const [history, setHistory] = useState([]);
  const [historyError, setHistoryError] = useState(null);

  // ✅ 추세 표시 토글
  const [trendVisible, setTrendVisible] = useState({
    매출액: true,
    매출원가: true,
    영업이익: true,
  });

  // ✅ 결과 화면 “한눈에” 보기 모드
  // all: 기본 / trend: 차트 집중 / table: 표 집중
  const [resultView, setResultView] = useState("all");

  // ✅ 표: 최근 12개월만(기본) / 전체
  const [tableScope, setTableScope] = useState("recent"); // "recent" | "all"

  // 최신 결산 반영 + 재학습 상태(폴링)
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  const syncTimerRef = useRef(null);

  // 결과 영역 ref (PDF 캡쳐용)
  const resultRef = useRef(null);

  // endpoints
  const SYNC_RETRAIN_ENDPOINT = "/api/topic4/sync-and-retrain";
  const SYNC_RETRAIN_STATUS_ENDPOINT = "/api/topic4/sync-and-retrain/status";

  // ===============================
  // API 헬퍼 (예측)
  // ===============================
  const callForecastApi = async (months, scenario) => {
    const res = await fetch("/api/closing/forecast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ months, scenario }),
    });

    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (!res.ok || data.ok === false) {
      throw new Error(data.error || "예측 API 호출 중 오류가 발생했습니다.");
    }
    return data;
  };

  // ✅ 이전 12개월(실적) 불러오기
  useEffect(() => {
    let alive = true;

    const fetchHistory = async () => {
      try {
        setHistoryError(null);
        const res = await fetch("/api/closing/history?months=12");
        const text = await res.text();
        let data = {};
        try {
          data = text ? JSON.parse(text) : {};
        } catch {
          data = {
            ok: false,
            error: "history 응답이 JSON이 아닙니다.",
            raw: text,
          };
        }

        if (!res.ok || data.ok === false) {
          throw new Error(
            data.error || `history 조회 실패 (HTTP ${res.status})`
          );
        }

        const rows = Array.isArray(data.rows) ? data.rows : [];

        // 다양한 키 이름을 허용(백엔드 구현 차이 흡수)
        const normalized = rows
          .map((r) => {
            const year = r.year ?? r["연도"] ?? r["년도"];
            const month = r.month ?? r["월"];
            const sales = r.sales ?? r["매출액"] ?? 0;
            const cogs = r.cogs ?? r["매출원가계"] ?? r["매출원가"] ?? 0;
            const op = r.op ?? r["영업이익"] ?? 0;
            if (!year || !month) return null;
            return {
              label: `${year}-${String(month).padStart(2, "0")}`,
              영업이익: Number(op) || 0,
              매출액: Number(sales) || 0,
              매출원가: Number(cogs) || 0,
              __type: "history",
            };
          })
          .filter(Boolean);

        if (alive) setHistory(normalized);
      } catch (e) {
        if (alive) setHistoryError(e?.message || "이전 12개월 로드 실패");
      }
    };

    fetchHistory();
    return () => {
      alive = false;
    };
  }, []);

  // 재학습 상태 조회(폴링)
  const fetchSyncStatus = async () => {
    const res = await fetch(SYNC_RETRAIN_STATUS_ENDPOINT);

    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { ok: false, error: "status 응답이 JSON이 아닙니다.", raw: text };
    }

    setSyncStatus(data);

    if (data && data.running === false && syncTimerRef.current) {
      clearInterval(syncTimerRef.current);
      syncTimerRef.current = null;
    }
  };

  // 최신 결산 반영 + 재학습 시작
  const handleSyncAndRetrain = async () => {
    try {
      setSyncLoading(true);
      setError(null);
      setSyncStatus(null);

      const res = await fetch(SYNC_RETRAIN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const text = await res.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { ok: false, error: "start 응답이 JSON이 아닙니다.", raw: text };
      }

      if (!res.ok || data.ok === false) {
        throw new Error(
          data.error || `데이터 업데이트/재학습 시작 실패 (HTTP ${res.status})`
        );
      }

      await fetchSyncStatus();
      if (!syncTimerRef.current)
        syncTimerRef.current = setInterval(fetchSyncStatus, 2000);

      setResult(null);
    } catch (err) {
      console.error(err);
      setError(err.message || "데이터 업데이트/재학습 중 오류가 발생했습니다.");
    } finally {
      setSyncLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      if (syncTimerRef.current) {
        clearInterval(syncTimerRef.current);
        syncTimerRef.current = null;
      }
    };
  }, []);

  // ===============================
  // 예측 실행
  // ===============================
  const handleRunForecast = async () => {
    try {
      setLoading(true);
      setError(null);
      setResult(null);

      const months = period || 12;

      const scenarioMap = {};
      const activeDrivers = [];

      scenarioRows.forEach((row) => {
        const rateNum = parseFloat(row.value);
        if (!isNaN(rateNum) && rateNum !== 0) {
          const totalRate = rateNum / 100.0; // 200% -> 2.0
          scenarioMap[row.driverKey] = totalRate;
          activeDrivers.push({
            key: row.driverKey,
            label: row.driverKey,
            rate: totalRate,
          });
        }
      });

      const promises = [
        callForecastApi(months, {}),
        callForecastApi(months, scenarioMap),
        ...activeDrivers.map((d) =>
          callForecastApi(months, { [d.key]: d.rate })
        ),
      ];

      const responses = await Promise.all(promises);
      const baseRes = responses[0];
      const fullRes = responses[1];
      const perDriverRes = responses.slice(2);

      const basePreds = baseRes.predictions || [];
      const scenarioPreds = fullRes.predictions || [];

      // Impact Ranking (마지막 달 기준)
      const baseLastOp =
        basePreds.length > 0
          ? basePreds[basePreds.length - 1]["영업이익"] || 0
          : 0;

      const driverImpacts = activeDrivers.map((drv, idx) => {
        const drvPreds = perDriverRes[idx]?.predictions || [];
        const drvLastOp =
          drvPreds.length > 0
            ? drvPreds[drvPreds.length - 1]["영업이익"] || 0
            : 0;

        const diff = drvLastOp - baseLastOp;

        const denom = Math.abs(baseLastOp);
        const rate = denom ? (diff / denom) * 100 : 0;

        const level = 100 + rate;
        return { key: drv.key, name: drv.label, diff, rate, level };
      });

      driverImpacts.sort((a, b) => Math.abs(b.rate) - Math.abs(a.rate));

      setResult({
        months,
        basePredictions: basePreds,
        scenarioPredictions: scenarioPreds,
        driverImpacts,
      });

      setTimeout(() => {
        const el = resultRef.current;
        if (el) el.classList.add("forecast-result-visible");
      }, 50);
    } catch (err) {
      console.error(err);
      setError(err.message || "예측 실행 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // ===============================
  // 시나리오 행 조작
  // ===============================
  const handleAddRow = () => {
    const usedKeys = new Set(scenarioRows.map((r) => r.driverKey));
    const candidate =
      DRIVER_OPTIONS.find((opt) => !usedKeys.has(opt.key)) || DRIVER_OPTIONS[0];

    setScenarioRows((prev) => [
      ...prev,
      { id: Date.now(), driverKey: candidate.key, value: "0" },
    ]);
  };

  const handleRowChange = (id, field, value) => {
    setScenarioRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  };

  const handleRemoveRow = (id) => {
    setScenarioRows((prev) => prev.filter((row) => row.id !== id));
  };

  const handleResetScenario = () => {
    setScenarioRows([
      { id: 1, driverKey: "원재료비", value: "0" },
      { id: 2, driverKey: "부재료비(전체)", value: "0" },
      { id: 3, driverKey: "급여(전체)", value: "0" },
      { id: 5, driverKey: "판관비(전체)", value: "0" },
    ]);
    setResult(null);
    setError(null);
    setSyncStatus(null);
    setResultView("all");
    setTableScope("recent");
  };

  // ===============================
  // 예측 결과 가공
  // ===============================
  const forecastTrendData = useMemo(() => {
    if (!result || !result.scenarioPredictions?.length) return [];
    return result.scenarioPredictions.map((p) => ({
      label: `${p["연도"]}-${String(p["월"]).padStart(2, "0")}`,
      영업이익: p["영업이익"] || 0,
      매출액: p["매출액"] || 0,
      매출원가: p["매출원가계"] ?? p["매출원가"] ?? 0,
      __type: "forecast",
    }));
  }, [result]);

  // ✅ 차트: (이전 12개월 실적) + (예측 구간)
  const chartTrendData = useMemo(() => {
    const h = Array.isArray(history) ? history : [];
    const f = Array.isArray(forecastTrendData) ? forecastTrendData : [];
    if (!f.length) return h; // 결과 없으면 실적만이라도 보여줌
    // 단순 이어붙임(겹치는 구간이 생기면 실적 우선)
    const seen = new Set();
    const out = [];
    for (const r of h) {
      if (!r?.label) continue;
      if (seen.has(r.label)) continue;
      seen.add(r.label);
      out.push(r);
    }
    for (const r of f) {
      if (!r?.label) continue;
      if (seen.has(r.label)) continue;
      seen.add(r.label);
      out.push(r);
    }
    return out;
  }, [history, forecastTrendData]);

  const trendVisibleKeys = useMemo(() => {
    const keys = ["매출액", "매출원가", "영업이익"];
    return keys.filter((k) => trendVisible[k]);
  }, [trendVisible]);

  const trendYAxisDomain = useMemo(() => {
    if (!chartTrendData.length) return ["auto", "auto"];
    const keys = trendVisibleKeys.length ? trendVisibleKeys : ["매출액"];

    let minV = Infinity;
    let maxV = -Infinity;

    for (const row of chartTrendData) {
      for (const k of keys) {
        const v = typeof row?.[k] === "number" ? row[k] : 0;
        if (v < minV) minV = v;
        if (v > maxV) maxV = v;
      }
    }

    if (!isFinite(minV) || !isFinite(maxV)) return ["auto", "auto"];

    const range = Math.max(1, maxV - minV);
    const pad = range * 0.1;
    let lo = minV - pad;
    let hi = maxV + pad;

    if (lo > 0) lo = Math.max(0, lo - pad);
    if (hi < 0) hi = Math.min(0, hi + pad);

    return [lo, hi];
  }, [chartTrendData, trendVisibleKeys]);

  const renderTrendLegendCheckbox = (props) => {
    const { payload } = props;
    if (!payload || !payload.length) return null;

    const order = ["매출액", "매출원가", "영업이익"];
    const ordered = order
      .map((key) => payload.find((item) => item.dataKey === key))
      .filter(Boolean);

    const toggleKey = (k) => {
      setTrendVisible((prev) => {
        const next = { ...prev, [k]: !prev[k] };
        const anyOn = Object.values(next).some(Boolean);
        return anyOn ? next : prev;
      });
    };

    return (
      <div style={{ width: "100%", display: "flex", justifyContent: "center" }}>
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
            fontSize: 11,
            color: "#374151",
            justifyContent: "center",
          }}
        >
          {ordered.map((item) => {
            const key = item.dataKey;
            const checked = !!trendVisible[key];

            return (
              <label
                key={key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  cursor: "pointer",
                  userSelect: "none",
                  opacity: checked ? 1 : 0.45,
                  padding: "2px 8px",
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  background: checked ? "#ffffff" : "#f9fafb",
                }}
                title="클릭해서 표시/숨기기"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleKey(key)}
                  style={{ cursor: "pointer" }}
                />
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    backgroundColor: item.color,
                    display: "inline-block",
                    boxShadow: "0 0 0 1px rgba(148,163,184,0.45)",
                  }}
                />
                <span style={{ fontWeight: 800 }}>{item.value}</span>
              </label>
            );
          })}
        </div>
      </div>
    );
  };

  const kpiSummary = useMemo(() => {
    if (
      !result?.scenarioPredictions?.length ||
      !result?.basePredictions?.length
    )
      return null;

    const scenLast =
      result.scenarioPredictions[result.scenarioPredictions.length - 1];
    const baseLast = result.basePredictions[result.basePredictions.length - 1];

    const op = scenLast["영업이익"] || 0;
    const opBase = baseLast["영업이익"] || 0;
    const opDiff = op - opBase;
    const opRateDenom = Math.abs(opBase);
    const opRate = opRateDenom ? (opDiff / opRateDenom) * 100 : 0;

    const sales = scenLast["매출액"] || 0;
    const salesBase = baseLast["매출액"] || 0;
    const salesDiff = sales - salesBase;
    const salesRate = salesBase ? (salesDiff / salesBase) * 100 : 0;

    const cogs = scenLast["매출원가계"] ?? scenLast["매출원가"] ?? 0;
    const cogsBase = baseLast["매출원가계"] ?? baseLast["매출원가"] ?? 0;
    const cogsDiff = cogs - cogsBase;
    const cogsRate = cogsBase ? (cogsDiff / cogsBase) * 100 : 0;

    return {
      year: scenLast["연도"],
      month: scenLast["월"],
      op,
      opDiff,
      opRate,
      sales,
      salesDiff,
      salesRate,
      cogs,
      cogsDiff,
      cogsRate,
    };
  }, [result]);

  const impactChartData = useMemo(() => {
    if (!result?.driverImpacts?.length) return [];
    return result.driverImpacts
      .filter((d) => d?.name !== "전력비" && d?.key !== "전력비")
      .map((d, idx) => ({
        name: d.name,
        level: d.level,
        delta: d.rate,
        color: IMPACT_COLORS[idx % IMPACT_COLORS.length],
      }));
  }, [result]);

  const impactDomain = useMemo(() => {
    if (!impactChartData.length) return ["auto", "auto"];

    const vals = impactChartData
      .map((d) => Number(d.level || 0))
      .filter((v) => Number.isFinite(v));

    if (!vals.length) return ["auto", "auto"];

    const minV = Math.min(...vals, 100);
    const maxV = Math.max(...vals, 100);

    const pad = Math.max((maxV - minV) * 0.1, 5);
    return [minV - pad, maxV + pad];
  }, [impactChartData]);

  const tableRows = useMemo(() => {
    if (!result?.scenarioPredictions?.length) return [];
    return result.scenarioPredictions.map((p, idx) => ({
      id: idx + 1,
      year: p["연도"],
      month: p["월"],
      ym: `${p["연도"]}-${String(p["월"]).padStart(2, "0")}`,
      op: p["영업이익"],
      sales: p["매출액"],
      cogs: p["매출원가계"] ?? p["매출원가"],
    }));
  }, [result]);

  const shownTableRows = useMemo(() => {
    if (!tableRows.length) return [];
    if (tableScope === "recent") return tableRows.slice(-12);
    return tableRows;
  }, [tableRows, tableScope]);

  // ===============================
  // PDF 내보내기
  // ===============================
  const handleExportPdf = async () => {
    if (!resultRef.current) return;

    try {
      const element = resultRef.current;
      element.classList.add("forecast-exporting");

      const canvas = await html2canvas(element, {
        scale: 3,
        backgroundColor: "#ffffff",
        useCORS: true,
        scrollX: 0,
        scrollY: -window.scrollY,
      });

      element.classList.remove("forecast-exporting");

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      pdf.save("AI_미래결산_예측결과.pdf");
    } catch (err) {
      console.error(err);
      alert("PDF 생성 중 오류가 발생했습니다.");
    }
  };

  const activeScenarioCount = useMemo(() => {
    let c = 0;
    scenarioRows.forEach((r) => {
      const n = parseFloat(r.value);
      if (!isNaN(n) && n !== 0) c += 1;
    });
    return c;
  }, [scenarioRows]);

  const topImpactList = useMemo(() => {
    if (!impactChartData.length) return [];
    return [...impactChartData]
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 4);
  }, [impactChartData]);

  // ===============================
  // 렌더링
  // ===============================
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <style>{`
        .forecast-fade-up {
          opacity: 0;
          transform: translateY(10px);
          transition: opacity 0.35s ease-out, transform 0.35s ease-out;
        }
        .forecast-result-visible {
          opacity: 1 !important;
          transform: translateY(0) !important;
        }
        .forecast-exporting {
          box-shadow: none !important;
          transform: none !important;
        }
        .fc-focus:focus {
          outline: none;
          box-shadow: 0 0 0 3px rgba(59,130,246,0.25);
          border-color: rgba(59,130,246,0.55) !important;
        }

        /* ✅ 표: 가로 스크롤 방지 */
        .fc-table-wrap {
          max-height: 520px;
          overflow: auto;
        }
        .fc-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed; /* 핵심 */
          font-size: 11px;
        }
        .fc-table thead th {
          position: sticky;
          top: 0;
          z-index: 2;
          background: #f9fafb;
        }
        .fc-td {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        /* ✅ 결과 레이아웃 */
        .fc-result-grid {
          display: grid;
          grid-template-columns: minmax(0, 2.05fr) minmax(0, 0.95fr);
          gap: 10px;
          align-items: start;
        }
        @media (max-width: 1100px) {
          .fc-result-grid { grid-template-columns: 1fr; }
        }
        .fc-left-stack {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
      `}</style>

      {/* ===============================
          입력 + Impact (2열)
          - 오른쪽 가이드 제거하고 Impact를 여기로 이동
      =============================== */}
      <section style={{ ...baseCardStyle }}>
        {/* 상단 바: 제목 제거, Pill + 액션만 컴팩트하게 */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: 8,
          }}
        >
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Pill
              tone="blue"
              title="입력한 증감률을 모든 예측 구간에 동일하게 적용합니다."
            >
              시나리오 기반
            </Pill>
            <Pill tone={activeScenarioCount ? "orange" : "gray"}>
              활성 {activeScenarioCount}개
            </Pill>
            <Pill tone="gray">기간 {period}개월</Pill>
            <Pill
              tone="gray"
              title="이전 12개월 실적(결산보고서 back_data) + 예측 구간을 함께 표시"
            >
              실적 12 + 예측
            </Pill>
            {historyError && <Pill tone="red">실적 로드 실패</Pill>}
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <button
              type="button"
              onClick={handleSyncAndRetrain}
              disabled={syncLoading || loading}
              style={{
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                padding: "7px 10px",
                fontSize: 12,
                backgroundColor: syncLoading ? "#f3f4f6" : "#fff7ed",
                color: "#9a3412",
                cursor: syncLoading || loading ? "default" : "pointer",
                fontWeight: 800,
              }}
              title="report_data의 최신 결산을 반영하고 모델을 재학습합니다."
            >
              {syncLoading ? "요청 중…" : "최신 결산 반영+재학습"}
            </button>

            <button
              type="button"
              onClick={handleRunForecast}
              disabled={loading || syncLoading}
              style={{
                borderRadius: 8,
                border: "none",
                padding: "8px 12px",
                fontSize: 12,
                fontWeight: 900,
                background:
                  loading || syncLoading
                    ? "#e5e7eb"
                    : `linear-gradient(135deg, ${BRAND_GREEN}, ${BRAND_ORANGE})`,
                color: loading || syncLoading ? "#6b7280" : "#ffffff",
                cursor: loading || syncLoading ? "default" : "pointer",
              }}
            >
              {loading ? "예측 중…" : "예측 실행"}
            </button>
          </div>
        </div>

        {/* 재학습 상태 / 에러 */}
        {(syncStatus || error) && (
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              marginBottom: 8,
            }}
          >
            {syncStatus?.running && (
              <Pill tone="orange">
                ⏳ 재학습 진행 (step: {syncStatus.step || "running"})
              </Pill>
            )}
            {!syncStatus?.running && syncStatus?.ok && (
              <Pill tone="green">✅ 재학습 완료</Pill>
            )}
            {!syncStatus?.running && syncStatus?.ok === false && (
              <Pill tone="red">❌ 재학습 실패</Pill>
            )}
            {error && <Pill tone="red">❌ {error}</Pill>}
          </div>
        )}

        {/* 2열: 입력(좌) / Impact(우) */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.35fr) minmax(0, 1fr)",
            gap: 10,
            alignItems: "start",
          }}
        >
          {/* 좌: 입력 카드 (더 각지고, 폭/패딩 줄임) */}
          <div
            style={{
              border: "1px solid #e5e7eb",
              background: "#ffffff",
              borderRadius: 8,
              padding: 10,
            }}
          >
            {/* 기간 */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 900,
                  color: BRAND_DARK,
                  minWidth: 64,
                }}
              >
                기간
              </div>

              <select
                value={period}
                onChange={(e) => setPeriod(Number(e.target.value))}
                className="fc-focus"
                style={{
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  padding: "7px 9px",
                  fontSize: 12,
                  outline: "none",
                  backgroundColor: "#f9fafb",
                  minWidth: 160,
                }}
              >
                {PERIOD_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              <div
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  onClick={handleAddRow}
                  className="fc-focus"
                  style={{
                    borderRadius: 8,
                    border: "1px dashed #d1d5db",
                    padding: "7px 9px",
                    fontSize: 12,
                    backgroundColor: "#f9fafb",
                    cursor: "pointer",
                    fontWeight: 800,
                  }}
                >
                  + 추가
                </button>
                <button
                  type="button"
                  onClick={handleResetScenario}
                  className="fc-focus"
                  style={{
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                    padding: "7px 9px",
                    fontSize: 12,
                    backgroundColor: "#ffffff",
                    cursor: "pointer",
                    fontWeight: 800,
                    color: "#374151",
                  }}
                >
                  초기화
                </button>
              </div>
            </div>

            {/* 안내 문구(짧게) */}
            <div
              style={{
                marginTop: 6,
                fontSize: 11,
                color: "#6b7280",
                lineHeight: "15px",
              }}
            >
              200% = 2배, 50% = 0.5배 (현재 대비 총배율)
            </div>

            {/* 입력 행 */}
            <div style={{ marginTop: 8 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 230px) minmax(0, 1fr) 30px",
                  gap: 8,
                  padding: "4px 6px",
                  color: "#6b7280",
                  fontSize: 11,
                  fontWeight: 800,
                }}
              >
                <div>항목</div>
                <div style={{ textAlign: "right" }}>증감률(%)</div>
                <div />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {scenarioRows.map((row) => {
                  const n = parseFloat(row.value);
                  const active = !isNaN(n) && n !== 0;
                  return (
                    <div
                      key={row.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "minmax(0, 230px) minmax(0, 1fr) 30px",
                        gap: 8,
                        alignItems: "center",
                        border: "1px solid #e5e7eb",
                        borderRadius: 8,
                        padding: 6,
                        background: active
                          ? "rgba(59,130,246,0.06)"
                          : "#ffffff",
                      }}
                    >
                      <select
                        value={row.driverKey}
                        onChange={(e) =>
                          handleRowChange(row.id, "driverKey", e.target.value)
                        }
                        className="fc-focus"
                        style={{
                          width: "100%",
                          borderRadius: 8,
                          border: "1px solid #e5e7eb",
                          padding: "7px 9px",
                          fontSize: 12,
                          outline: "none",
                          backgroundColor: "#f9fafb",
                        }}
                      >
                        {DRIVER_OPTIONS.map((opt) => (
                          <option key={opt.key} value={opt.key}>
                            {opt.label}
                          </option>
                        ))}
                      </select>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          justifyContent: "flex-end",
                        }}
                      >
                        <input
                          type="number"
                          value={row.value}
                          onChange={(e) =>
                            handleRowChange(row.id, "value", e.target.value)
                          }
                          className="fc-focus"
                          style={{
                            width: 120,
                            borderRadius: 8,
                            border: "1px solid #e5e7eb",
                            padding: "7px 9px",
                            fontSize: 12,
                            textAlign: "right",
                            outline: "none",
                            background: "#ffffff",
                          }}
                          placeholder="0"
                        />
                        <span
                          style={{
                            fontSize: 12,
                            color: "#6b7280",
                            fontWeight: 800,
                          }}
                        >
                          %
                        </span>
                        {active ? (
                          <Pill tone="blue">ON</Pill>
                        ) : (
                          <Pill tone="gray">OFF</Pill>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveRow(row.id)}
                        style={{
                          border: "none",
                          background: "transparent",
                          color: "#94a3b8",
                          cursor: "pointer",
                          fontSize: 18,
                          lineHeight: 1,
                        }}
                        title="삭제"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 우: Impact 카드(가이드 대신) */}
          <div
            style={{
              border: "1px solid #e5e7eb",
              background: "#ffffff",
              borderRadius: 8,
              padding: 10,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <div>
                <div
                  style={{ fontSize: 12, fontWeight: 900, color: BRAND_DARK }}
                >
                  Impact
                </div>
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                  기준=100% (마지막 달 영업이익)
                </div>
              </div>
              <Pill tone="gray">항목별 단독 적용</Pill>
            </div>

            {!result ? (
              <div
                style={{
                  marginTop: 10,
                  border: "1px dashed #d1d5db",
                  borderRadius: 8,
                  padding: 10,
                  background: "#f9fafb",
                  fontSize: 12,
                  color: "#6b7280",
                  lineHeight: "16px",
                }}
              >
                예측 실행 후 Impact가 표시됩니다.
              </div>
            ) : impactChartData.length === 0 ? (
              <div
                style={{
                  marginTop: 10,
                  border: "1px dashed #d1d5db",
                  borderRadius: 8,
                  padding: 10,
                  background: "#f9fafb",
                  fontSize: 12,
                  color: "#6b7280",
                  lineHeight: "16px",
                }}
              >
                활성 시나리오가 없어서 Impact가 비어있습니다.
              </div>
            ) : (
              <>
                <div style={{ width: "100%", height: 220, marginTop: 8 }}>
                  <ResponsiveContainer>
                    <BarChart
                      data={impactChartData}
                      layout="vertical"
                      margin={{ top: 8, right: 12, left: 36, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        type="number"
                        domain={impactDomain}
                        tickFormatter={(v) => `${Number(v).toFixed(1)}%`}
                        tick={{ fontSize: 11 }}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={{ fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        formatter={(v) => {
                          const lv = Number(v);
                          const delta = lv - 100;
                          const sign = delta >= 0 ? "+" : "";
                          return `${lv.toFixed(1)}% (Δ ${sign}${delta.toFixed(
                            1
                          )}%)`;
                        }}
                      />
                      <Bar dataKey="level" radius={6} barSize={18}>
                        {impactChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div style={{ marginTop: 8 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 900,
                      color: "#374151",
                      marginBottom: 6,
                    }}
                  >
                    TOP 영향
                  </div>
                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 6 }}
                  >
                    {topImpactList.map((it) => {
                      const d = Number(it.delta || 0);
                      const sign = d >= 0 ? "+" : "";
                      return (
                        <div
                          key={it.name}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 10,
                            padding: "6px 8px",
                            border: "1px solid #e5e7eb",
                            borderRadius: 8,
                            background: "#f9fafb",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              minWidth: 0,
                            }}
                          >
                            <span
                              style={{
                                width: 10,
                                height: 10,
                                borderRadius: 2,
                                background: it.color,
                                boxShadow: "0 0 0 1px rgba(148,163,184,0.45)",
                                flex: "0 0 auto",
                              }}
                            />
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: 900,
                                color: BRAND_DARK,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {it.name}
                            </span>
                          </div>
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 900,
                              color: d >= 0 ? "#065f46" : "#991b1b",
                            }}
                          >
                            Δ {sign}
                            {d.toFixed(1)}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ===============================
          결과 카드
      =============================== */}
      <section
        style={{ ...baseCardStyle, position: "relative" }}
        ref={resultRef}
        className="forecast-fade-up"
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            marginBottom: 8,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <h3
              style={{
                fontSize: 13,
                fontWeight: 900,
                color: BRAND_DARK,
                margin: 0,
              }}
            >
              결과
            </h3>

            {result?.months ? (
              <Pill tone="blue">{result.months}개월</Pill>
            ) : (
              <Pill tone="gray">대기</Pill>
            )}

            {result && (
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  flexWrap: "wrap",
                  marginLeft: 4,
                }}
              >
                <Pill
                  tone="gray"
                  active={resultView === "all"}
                  onClick={() => setResultView("all")}
                >
                  전체
                </Pill>
                <Pill
                  tone="gray"
                  active={resultView === "trend"}
                  onClick={() => setResultView("trend")}
                >
                  차트
                </Pill>
                <Pill
                  tone="gray"
                  active={resultView === "table"}
                  onClick={() => setResultView("table")}
                >
                  표
                </Pill>
              </div>
            )}
          </div>

          {result && (
            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <Pill
                tone="gray"
                active={tableScope === "recent"}
                onClick={() => setTableScope("recent")}
                title="표는 최근 12개월만"
              >
                최근12
              </Pill>
              <Pill
                tone="gray"
                active={tableScope === "all"}
                onClick={() => setTableScope("all")}
                title="표 전체"
              >
                전체
              </Pill>

              <button
                type="button"
                onClick={handleExportPdf}
                className="fc-focus"
                style={{
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  padding: "7px 9px",
                  fontSize: 12,
                  backgroundColor: "#f9fafb",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                PDF
              </button>
            </div>
          )}
        </div>

        {!result && (
          <div
            style={{
              border: "1px dashed #d1d5db",
              borderRadius: 8,
              padding: 12,
              background: "#ffffff",
              color: "#6b7280",
              fontSize: 12,
              lineHeight: "16px",
            }}
          >
            시나리오 입력 후 <b>예측 실행</b>을 누르세요.
            <div
              style={{
                marginTop: 6,
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
              }}
            >
              <Pill tone="gray">실적+예측 차트</Pill>
              <Pill tone="gray">월별 표</Pill>
            </div>
          </div>
        )}

        {result && (
          <>
            {/* KPI 카드 */}
            {kpiSummary && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: 8,
                  marginBottom: 10,
                }}
              >
                {/* 영업이익 */}
                <div
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    padding: 10,
                    background: "#ffffff",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        color: "#6b7280",
                        fontWeight: 800,
                      }}
                    >
                      {kpiSummary.year}년 {kpiSummary.month}월 영업이익
                    </div>
                    <Pill tone={kpiSummary.opDiff >= 0 ? "green" : "red"}>
                      {kpiSummary.opDiff >= 0 ? "상승" : "하락"}
                    </Pill>
                  </div>
                  <div
                    style={{
                      fontSize: 17,
                      fontWeight: 900,
                      color: BRAND_DARK,
                      marginTop: 6,
                    }}
                  >
                    {fmt(kpiSummary.op)}
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 11,
                      fontWeight: 900,
                      color: kpiSummary.opDiff >= 0 ? "#065f46" : "#991b1b",
                    }}
                  >
                    {kpiSummary.opDiff >= 0 ? "▲" : "▼"}{" "}
                    {fmt(Math.abs(kpiSummary.opDiff))} (
                    {kpiSummary.opRate >= 0 ? "+" : "-"}
                    {Math.abs(kpiSummary.opRate).toFixed(1)}%)
                  </div>
                </div>

                {/* 매출액 */}
                <div
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    padding: 10,
                    background: "#ffffff",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        color: "#6b7280",
                        fontWeight: 800,
                      }}
                    >
                      {kpiSummary.year}년 {kpiSummary.month}월 매출액
                    </div>
                    <Pill tone={kpiSummary.salesDiff >= 0 ? "blue" : "red"}>
                      {kpiSummary.salesDiff >= 0 ? "증가" : "감소"}
                    </Pill>
                  </div>
                  <div
                    style={{
                      fontSize: 17,
                      fontWeight: 900,
                      color: BRAND_DARK,
                      marginTop: 6,
                    }}
                  >
                    {fmt(kpiSummary.sales)}
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 11,
                      fontWeight: 900,
                      color: kpiSummary.salesDiff >= 0 ? "#1d4ed8" : "#991b1b",
                    }}
                  >
                    {kpiSummary.salesDiff >= 0 ? "▲" : "▼"}{" "}
                    {fmt(Math.abs(kpiSummary.salesDiff))} (
                    {kpiSummary.salesRate >= 0 ? "+" : "-"}
                    {Math.abs(kpiSummary.salesRate).toFixed(1)}%)
                  </div>
                </div>

                {/* 매출원가 */}
                <div
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                    padding: 10,
                    background: "#ffffff",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        color: "#6b7280",
                        fontWeight: 800,
                      }}
                    >
                      {kpiSummary.year}년 {kpiSummary.month}월 매출원가
                    </div>
                    <Pill tone={kpiSummary.cogsDiff <= 0 ? "green" : "red"}>
                      {kpiSummary.cogsDiff <= 0 ? "개선" : "악화"}
                    </Pill>
                  </div>
                  <div
                    style={{
                      fontSize: 17,
                      fontWeight: 900,
                      color: BRAND_DARK,
                      marginTop: 6,
                    }}
                  >
                    {fmt(kpiSummary.cogs)}
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 11,
                      fontWeight: 900,
                      color: kpiSummary.cogsDiff <= 0 ? "#065f46" : "#991b1b",
                    }}
                  >
                    {kpiSummary.cogsDiff <= 0 ? "▼" : "▲"}{" "}
                    {fmt(Math.abs(kpiSummary.cogsDiff))} (
                    {kpiSummary.cogsRate >= 0 ? "+" : "-"}
                    {Math.abs(kpiSummary.cogsRate).toFixed(1)}%)
                  </div>
                </div>
              </div>
            )}

            <div
              className="fc-result-grid"
              style={{
                gridTemplateColumns:
                  resultView === "all"
                    ? "minmax(0, 2.05fr) minmax(0, 0.95fr)"
                    : "1fr",
              }}
            >
              {/* 좌측: 차트 */}
              {resultView !== "table" && (
                <div className="fc-left-stack">
                  <div
                    style={{
                      borderRadius: 8,
                      border: "1px solid #e5e7eb",
                      padding: 10,
                      background: "#ffffff",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        justifyContent: "space-between",
                        gap: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 900,
                            color: BRAND_DARK,
                          }}
                        >
                          추세 (실적 12 + 예측)
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: "#9ca3af",
                            marginTop: 3,
                          }}
                        >
                          단위: 억 원 · Legend 체크로 표시/숨김
                        </div>
                      </div>
                      <Pill tone="gray">Y축 자동</Pill>
                    </div>

                    <div
                      style={{
                        width: "100%",
                        height: resultView === "trend" ? 360 : 300,
                        marginTop: 6,
                      }}
                    >
                      <ResponsiveContainer>
                        <LineChart
                          data={chartTrendData}
                          margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                          <YAxis
                            tickFormatter={fmtHundredMillion}
                            domain={trendYAxisDomain}
                            tick={{ fontSize: 11 }}
                          />
                          <Tooltip
                            formatter={(v) =>
                              typeof v === "number" ? fmtHundredMillion(v) : v
                            }
                          />
                          <Legend content={renderTrendLegendCheckbox} />

                          <Line
                            type="monotone"
                            dataKey="매출액"
                            name="매출액"
                            stroke={BRAND_GREEN}
                            strokeWidth={2}
                            dot={false}
                            hide={!trendVisible["매출액"]}
                          />
                          <Line
                            type="monotone"
                            dataKey="매출원가"
                            name="매출원가"
                            stroke="#ef4444"
                            strokeWidth={2}
                            dot={false}
                            hide={!trendVisible["매출원가"]}
                          />
                          <Line
                            type="monotone"
                            dataKey="영업이익"
                            name="영업이익"
                            stroke="#7c3aed"
                            strokeWidth={2}
                            strokeDasharray="6 4"
                            dot={false}
                            hide={!trendVisible["영업이익"]}
                          />

                          {chartTrendData.length > 10 && (
                            <Brush
                              dataKey="label"
                              height={22}
                              stroke="#94a3b8"
                              travellerWidth={10}
                            />
                          )}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    <div style={{ marginTop: 2 }}>
                      <Legend content={renderTrendLegend} />
                    </div>
                  </div>
                </div>
              )}

              {/* 우측: 표 (가로 스크롤 제거) */}
              {resultView !== "trend" && (
                <div
                  style={{
                    borderRadius: 8,
                    border: "1px solid #e5e7eb",
                    padding: 10,
                    background: "#ffffff",
                    height: "fit-content",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      justifyContent: "space-between",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 900,
                          color: BRAND_DARK,
                        }}
                      >
                        월별 상세
                      </div>
                      <div
                        style={{ fontSize: 11, color: "#9ca3af", marginTop: 3 }}
                      >
                        헤더 고정 · 스크롤
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <Pill tone="gray">
                        {tableScope === "recent" ? "최근12" : "전체"}
                      </Pill>
                      <Pill tone="gray">{shownTableRows.length}행</Pill>
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: 8,
                      border: "1px solid #e5e7eb",
                      borderRadius: 8,
                    }}
                  >
                    <div
                      className="fc-table-wrap"
                      style={{ maxHeight: resultView === "table" ? 560 : 520 }}
                    >
                      <table className="fc-table">
                        <thead>
                          <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                            <th
                              style={{
                                padding: "8px 10px",
                                textAlign: "left",
                                fontWeight: 900,
                                color: "#374151",
                                width: "22%",
                              }}
                            >
                              연-월
                            </th>
                            <th
                              style={{
                                padding: "8px 10px",
                                textAlign: "right",
                                fontWeight: 900,
                                color: "#374151",
                                width: "26%",
                              }}
                            >
                              영업이익
                            </th>
                            <th
                              style={{
                                padding: "8px 10px",
                                textAlign: "right",
                                fontWeight: 900,
                                color: "#374151",
                                width: "26%",
                              }}
                            >
                              매출액
                            </th>
                            <th
                              style={{
                                padding: "8px 10px",
                                textAlign: "right",
                                fontWeight: 900,
                                color: "#374151",
                                width: "26%",
                              }}
                            >
                              매출원가
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {shownTableRows.map((row, i) => (
                            <tr
                              key={row.id}
                              style={{
                                borderTop: "1px solid #f3f4f6",
                                background: i % 2 === 0 ? "#ffffff" : "#fcfcfd",
                              }}
                            >
                              <td
                                className="fc-td"
                                style={{
                                  padding: "8px 10px",
                                  color: "#111827",
                                  fontWeight: 800,
                                }}
                              >
                                {row.ym}
                              </td>
                              <td
                                className="fc-td"
                                style={{
                                  padding: "8px 10px",
                                  textAlign: "right",
                                  fontWeight: 900,
                                  color:
                                    (row.op ?? 0) >= 0 ? "#065f46" : "#991b1b",
                                }}
                              >
                                {fmt(row.op)}
                              </td>
                              <td
                                className="fc-td"
                                style={{
                                  padding: "8px 10px",
                                  textAlign: "right",
                                  fontWeight: 800,
                                  color: "#111827",
                                }}
                              >
                                {fmt(row.sales)}
                              </td>
                              <td
                                className="fc-td"
                                style={{
                                  padding: "8px 10px",
                                  textAlign: "right",
                                  fontWeight: 800,
                                  color: "#111827",
                                }}
                              >
                                {fmt(row.cogs)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

export default ForecastTab;
