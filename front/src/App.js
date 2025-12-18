// src/App.js
import React, { useState, useMemo, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import logoSmall from "./img_logo5_crop.jpg";

import {
  BRAND_GREEN,
  BRAND_ORANGE,
  BRAND_DARK,
  BG_LIGHT,
  PL_DIMENSION_OPTIONS,
  PL_DIM_LABELS,
  DIM_COL_MAP,
  SALES_COLS,
  COGS_COLS,
  SGA_COLS,
  NONOP_REV_COLS,
  NONOP_EXP_COLS,
  TAX_COLS,
} from "./config/plConfig";

// ✅ 기존 탭들
import ClosingTab from "./components/tabs/ClosingTab";
import PlReportTab from "./components/tabs/PlReportTab";

// ✅ 주제3-4 추가 탭
import PlReportCauseTab from "./components/tabs/PlReportCauseTab";
import ForecastTab from "./components/tabs/ForecastTab";
import FxTariffCompareTab from "./components/tabs/FxTariffCompareTab";

// ✅ 로그인 페이지
import LoginPage from "./pages/loginPage";

// ✅ 아이콘 (첨부 순서대로)
import iconCheck from "./assets/icons/checkbox.png";
import iconChart from "./assets/icons/chart.png";
import iconDoc from "./assets/icons/document.png";

// ✅ 사이드바 분리 컴포넌트
import SidebarIcons from "./components/sidebar/SidebarIcons";
import SidebarPanel from "./components/sidebar/SidebarPanel";
import { getIconStyle, chipBase } from "./components/sidebar/sidebarStyles";

// ===== Flask API 베이스 =====
const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:5000";

// 숫자 포맷 helper
const formatNumber = (v) =>
  typeof v === "number" ? v.toLocaleString("ko-KR") : v;

function App() {
  // ==============================
  // ✅ 로그인 상태 (기존 유지)
  // ==============================
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return sessionStorage.getItem("ilji_logged_in") === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      if (isLoggedIn) sessionStorage.setItem("ilji_logged_in", "1");
      else sessionStorage.removeItem("ilji_logged_in");
    } catch (err) {
      console.warn("sessionStorage sync error:", err);
    }
  }, [isLoggedIn]);

  // (LoginPage가 theme props를 기대할 가능성 대비)
  const [theme, setTheme] = useState("light");

  // ==============================
  // 상태/데이터
  // ==============================

  const [plReportData, setPlReportData] = useState([]); // /api/pl-report fetch 결과

  const [anomalyResult, setAnomalyResult] = useState(null);
  const [anomalyLoading, setAnomalyLoading] = useState(false);
  const [anomalyError, setAnomalyError] = useState(null);

  const [selectedIssue, setSelectedIssue] = useState(null);
  const [stage, setStage] = useState("landing"); // "landing" | "app" | "error"

  // === 업로드 상태 ===
  const [costDataUploaded, setCostDataUploaded] = useState(false);
  const [plDataUploaded, setPlDataUploaded] = useState(false);

  // === 실제 데이터 ===
  const [costData, setCostData] = useState(null);
  const [anomalyData, setAnomalyData] = useState([]);
  const [backData, setBackData] = useState(null);

  // ✅ 주제3: 코드분류표 매핑
  const [codeNameMap, setCodeNameMap] = useState({});

  // ✅ (추가) 심화분류 맵(백엔드에서 내려받음)
  const [advancedByCcAcc, setAdvancedByCcAcc] = useState({});
  const [advancedByAcc, setAdvancedByAcc] = useState({});

  // ✅ 주제3/4: 백엔드에 back-data 업로드 1회만 방지용
  const [plReportRequested, setPlReportRequested] = useState(false);

  // ✅ 주제3/4: 업로드한 파일 자체 보관(서버로 보낼 때 사용)
  const [backFile, setBackFile] = useState(null);

  const [tab, setTab] = useState("closing");

  // ✅ 비용 탭용 Month (기존 유지)
  const [selectedMonth, setSelectedMonth] = useState("");

  // ✅ P&L(report_data) 탭용 Month (추가)
  const [selectedReportYm, setSelectedReportYm] = useState("");
  const [reportPeriods, setReportPeriods] = useState([]); // [{year, month}] 또는 ["YYYY-MM"]

  const [plDimension, setPlDimension] = useState("profitCenter");
  const [plPeriod, setPlPeriod] = useState("all");
  const [plViewMode, setPlViewMode] = useState("table");
  const [plDetailTab, setPlDetailTab] = useState("basic");

  // ✅ "그래프 전용 페이지" 제거했으므로, 기본 탭 진입 시 table 모드만 맞춰줌
  useEffect(() => {
    if (tab === "pl-report-basic") setPlViewMode("table");
  }, [tab]);

  // ✅ P&L 계열 탭 판별 (그래프 전용 페이지 제거)
  const isPlReportTab = tab === "pl-report-basic" || tab === "pl-report-cause";

  // ✅ (추가) closing 탭에서 Month 선택 잠금
  const lockMonthSelect = tab === "closing";

  // 업로드 input ref
  const costFileInputRef = useRef(null); // 코스트센터 (1~3탭)
  const plFileInputRef = useRef(null); // 결산보고서 Back data (P&L용)

  // 코스트센터 업로드 UX 상태
  const [pendingCostFile, setPendingCostFile] = useState(null);
  const [costUploading, setCostUploading] = useState(false);

  // P&L 업로드 UX 상태
  const [pendingPlFile, setPendingPlFile] = useState(null);
  const [plUploading, setPlUploading] = useState(false);

  // 초기 로딩 진행률
  const [initProgress, setInitProgress] = useState(0);

  const handleIssueRowClick = (row) => {
    setSelectedIssue((prev) => (prev && prev.id === row.id ? null : row));
  };

  useEffect(() => {
    console.log("anomalyData length:", anomalyData ? anomalyData.length : 0);
  }, [anomalyData]);

  // ==========================
  // ✅ 백엔드 초기 데이터 로드 + default 분석 + stage 전환
  // ==========================
  useEffect(() => {
    if (!isLoggedIn) return;

    let mounted = true;

    async function loadFromBackend() {
      try {
        if (!mounted) return;

        setStage("landing");
        setInitProgress(10);

        const res = await fetch(`${API_BASE}/api/init-data`);
        if (!res.ok) {
          console.error("init-data HTTP error", res.status);
          if (mounted) {
            setStage("error");
            setInitProgress(100);
          }
          return;
        }

        const data = await res.json();
        console.log("init-data:", data);

        if (!mounted) return;
        setInitProgress(40);

        if (Array.isArray(data.costData) && data.costData.length) {
          setCostData(data.costData);
        }

        if (Array.isArray(data.backData) && data.backData.length) {
          setBackData(data.backData);
        }

        if (data.codeNameMap && Object.keys(data.codeNameMap).length > 0) {
          setCodeNameMap(data.codeNameMap);
        }

        if (Array.isArray(data.anomalyData)) {
          setAnomalyData(data.anomalyData);
        }

        // ✅ (추가) 백엔드에서 심화분류 맵 받기
        if (data.advancedMap) {
          setAdvancedByCcAcc(data.advancedMap.byCcAcc || {});
          setAdvancedByAcc(data.advancedMap.byAcc || {});
        } else {
          setAdvancedByCcAcc({});
          setAdvancedByAcc({});
        }

        // ✅ 기본 분석 호출
        try {
          if (!mounted) return;

          setAnomalyLoading(true);
          setAnomalyError(null);
          setInitProgress(60);

          const res2 = await fetch(
            `${API_BASE}/api/cost-center/analyze-default`
          );

          if (!res2.ok) {
            const msg = `analyze-default HTTP ${res2.status}`;
            console.error(msg);
            if (mounted) setAnomalyError(msg);
          } else {
            const result = await res2.json();
            console.log("anomalyResult(default):", result);

            if (!mounted) return;

            setAnomalyResult(result);

            const issues = Array.isArray(result.issues) ? result.issues : [];
            const normalized = issues.map((r, idx) => ({
              ...r,
              id: idx + 1,
              year_month: r.year_month,
              amount: r.amount,
              issue_type: r.issue_type,
              severity_rank: r.severity_rank,
              account_code: r.account_code,
              account_name: r.account_name,
              cost_center: r.cost_center,
              cc_name: r.cc_name,
              reason_kor: r.reason_kor,
              patternMean:
                r.patternMean ?? r.pattern_mean ?? r.pattern_avg ?? null,
              patternUpper: r.patternUpper ?? r.pattern_upper ?? null,
              patternLower: r.patternLower ?? r.pattern_lower ?? null,
            }));
            setAnomalyData(normalized);

            if (Array.isArray(result.costData) && result.costData.length > 0) {
              setCostData(result.costData);
            }

            if (result.summary && result.summary.year_month) {
              setSelectedMonth(result.summary.year_month);
            }
          }
        } catch (err2) {
          console.error("analyze-default fetch error", err2);
          if (mounted) setAnomalyError(err2.message || String(err2));
        } finally {
          if (mounted) {
            setAnomalyLoading(false);
            setInitProgress(90);
          }
        }

        // ✅ landing -> app 전환
        if (mounted) {
          setInitProgress(100);
          setStage("app");
        }
      } catch (err) {
        console.error("init-data fetch error:", err);
        if (mounted) {
          setStage("error");
          setInitProgress(100);
        }
      }
    }

    loadFromBackend();

    return () => {
      mounted = false;
    };
  }, [isLoggedIn]);

  // ==========================
  // P&L 보고서 데이터 (기존 유지: /api/pl-report)
  // ==========================
  useEffect(() => {
    if (!isLoggedIn) return;

    async function fetchPlReport() {
      try {
        const res = await fetch(`${API_BASE}/api/pl-report`);
        if (!res.ok) {
          console.error("PL Report HTTP error", res.status);
          setPlReportData([]);
          return;
        }
        const json = await res.json();
        setPlReportData(json.rows || []);
      } catch (err) {
        console.error("PL Report fetch error:", err);
        setPlReportData([]);
      }
    }

    fetchPlReport();
  }, [isLoggedIn]);

  // ==========================
  // ✅ report_data 기준 Month 목록 로드 (추가)
  //  - 1순위: /api/pl-report/periods (있으면 사용)
  //  - 2순위: 기존 plReportData에서 year/month 추출 (fallback)
  // ==========================
  useEffect(() => {
    if (!isLoggedIn) return;

    let mounted = true;

    const normalizeYm = (y, m) => `${String(y)}-${String(m).padStart(2, "0")}`;

    async function loadPeriods() {
      // 1) 서버 endpoint가 있으면 사용
      try {
        const res = await fetch(`${API_BASE}/api/pl-report/periods`);
        if (res.ok) {
          const json = await res.json().catch(() => ({}));
          const periods = Array.isArray(json.periods) ? json.periods : [];
          const ymList = periods
            .map((p) => {
              const y = p.year ?? p.Y ?? p.년 ?? p.fiscal_year;
              const m = p.month ?? p.M ?? p.월 ?? p.fiscal_month;
              if (!y || !m) return null;
              return normalizeYm(y, m);
            })
            .filter(Boolean);

          const uniq = Array.from(new Set(ymList)).sort();
          if (!mounted) return;

          setReportPeriods(uniq);
          if (!selectedReportYm && uniq.length) {
            setSelectedReportYm(uniq[uniq.length - 1]);
          }
          return; // ✅ endpoint 성공하면 여기서 종료
        }
      } catch (e) {
        // endpoint 없을 수 있으니 무시하고 fallback
      }

      // 2) fallback: plReportData에서 추출
      try {
        const rows = Array.isArray(plReportData) ? plReportData : [];
        const ymList = [];
        rows.forEach((r) => {
          const y =
            r.year ??
            r.Year ??
            r.년도 ??
            r.연도 ??
            r.fiscal_year ??
            r["연도"] ??
            r["년도"];
          const m = r.month ?? r.Month ?? r.월 ?? r.fiscal_month ?? r["월"];
          if (y && m) ymList.push(normalizeYm(y, m));
          else if (r.year_month || r.yearMonth || r["년월"]) {
            const raw = String(r.year_month || r.yearMonth || r["년월"]);
            const mm = raw.match(/(20\d{2})\D?(\d{1,2})/);
            if (mm) ymList.push(normalizeYm(mm[1], mm[2]));
          }
        });

        const uniq = Array.from(new Set(ymList)).sort();
        if (!mounted) return;

        setReportPeriods(uniq);
        if (!selectedReportYm && uniq.length) {
          setSelectedReportYm(uniq[uniq.length - 1]);
        }
      } catch (err) {
        console.warn("report periods fallback error:", err);
      }
    }

    loadPeriods();

    return () => {
      mounted = false;
    };
    // plReportData가 갱신되면 fallback 목록도 갱신되도록 포함
  }, [isLoggedIn, plReportData, selectedReportYm]);

  // ==========================
  // 엑셀 업로드 (코스트센터 파일) - 기존 유지
  // ==========================
  const handleUploadCostFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingCostFile(file);
  };

  const handleConfirmCostUpload = async () => {
    if (!pendingCostFile) return;

    const formData = new FormData();
    formData.append("file", pendingCostFile);

    try {
      setCostUploading(true);
      setAnomalyLoading(true);
      setAnomalyError(null);

      const res = await fetch(`${API_BASE}/api/cost-center/analyze`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const result = await res.json();
      console.log("[Frontend] analyze result:", result);

      setAnomalyResult(result);

      const issues = Array.isArray(result.issues) ? result.issues : [];
      const normalized = issues.map((r, idx) => ({
        ...r,
        id: idx + 1,
        year_month: r.year_month,
        amount: r.amount,
        issue_type: r.issue_type,
        severity_rank: r.severity_rank,
        account_code: r.account_code,
        account_name: r.account_name,
        cost_center: r.cost_center,
        cc_name: r.cc_name,
        reason_kor: r.reason_kor,
        patternMean: r.patternMean ?? r.pattern_mean ?? r.pattern_avg ?? null,
        patternUpper: r.patternUpper ?? r.pattern_upper ?? null,
        patternLower: r.patternLower ?? r.pattern_lower ?? null,
      }));
      setAnomalyData(normalized);

      if (Array.isArray(result.costData) && result.costData.length > 0) {
        setCostData(result.costData);
      }

      if (result.summary && result.summary.year_month) {
        setSelectedMonth(result.summary.year_month);
      }

      setCostDataUploaded(true);

      setPendingCostFile(null);
      if (costFileInputRef.current) costFileInputRef.current.value = "";
    } catch (err) {
      console.error("cost-center analyze error:", err);
      setAnomalyError(err.message || String(err));
      alert(
        "업로드한 코스트센터 엑셀 분석 중 오류가 발생했습니다.\n양식을 한 번 더 확인해 주세요."
      );
    } finally {
      setCostUploading(false);
      setAnomalyLoading(false);
    }
  };

  const handleCancelPendingCostFile = () => {
    setPendingCostFile(null);
    if (costFileInputRef.current) costFileInputRef.current.value = "";
  };

  // ==========================
  // ✅ Back data 파싱 + 코드분류표 매핑 + 서버 업로드 완료 후 uploaded 처리
  // ==========================
  const parseAndApplyBackData = (file) => {
    if (!file) return Promise.resolve({ ok: false, reason: "no_file" });

    setBackFile(file);
    setPlDataUploaded(false);

    return new Promise((resolve) => {
      const reader = new FileReader();

      reader.onerror = () => {
        alert("결산보고서(Back data) 파일을 읽는 중 오류가 발생했습니다.");
        resolve({ ok: false, reason: "file_read_error" });
      };

      reader.onload = async (evt) => {
        try {
          const data = new Uint8Array(evt.target.result);
          const workbook = XLSX.read(data, { type: "array" });

          const backSheet =
            workbook.Sheets["Back data"] ||
            workbook.Sheets["BackData"] ||
            workbook.Sheets[workbook.SheetNames[0]];

          const json = XLSX.utils.sheet_to_json(backSheet, { defval: null });

          let mapping = {};
          const mappingSheetName = workbook.SheetNames.find((name) =>
            /코드분류표|code.?map|코드맵/i.test(name)
          );

          if (mappingSheetName) {
            const mappingSheet = workbook.Sheets[mappingSheetName];
            const mappingRows = XLSX.utils.sheet_to_json(mappingSheet, {
              defval: null,
            });

            mappingRows.forEach((row) => {
              const rawCode =
                row["코드"] ||
                row["계정코드"] ||
                row["코스트센터"] ||
                row["코드값"] ||
                row["Code"];
              const rawName =
                row["내역"] ||
                row["계정명"] ||
                row["코스트센터명"] ||
                row["Name"] ||
                row["설명"];

              if (rawCode && rawName) {
                const code = String(rawCode).trim();
                const name = String(rawName).trim();
                if (code) mapping[code] = name;
              }
            });
          }

          if (json && json.length) {
            setBackData(json);
            setCodeNameMap(mapping);
            setPlPeriod("all");
          }

          const makeFormData = () => {
            const fd = new FormData();
            fd.append("file", file);
            return fd;
          };

          if (!plReportRequested) setPlReportRequested(true);

          const res = await fetch(`${API_BASE}/api/pl-report/back-data`, {
            method: "POST",
            body: makeFormData(),
          });

          const json1 = await res.json().catch(() => ({}));

          if (!res.ok) {
            console.warn(
              "[Frontend] /api/pl-report/back-data failed:",
              json1?.error || res.status
            );
            setPlReportRequested(false);
            resolve({
              ok: false,
              reason: "server_upload_failed",
              detail: json1,
            });
            return;
          }

          if (json1?.need_confirm) {
            const ok = window.confirm(
              json1?.message ||
                "이미 해당 연도와 월에 해당하는 데이터가 있습니다. 다시 저장할까요?"
            );

            if (!ok) {
              setPlReportRequested(false);
              resolve({ ok: false, reason: "user_canceled_overwrite" });
              return;
            }

            const res2 = await fetch(
              `${API_BASE}/api/pl-report/back-data?force=1`,
              {
                method: "POST",
                body: makeFormData(),
              }
            );

            const json2 = await res2.json().catch(() => ({}));

            if (!res2.ok) {
              console.warn(
                "[Frontend] overwrite failed:",
                json2?.error || res2.status
              );
              setPlReportRequested(false);
              resolve({
                ok: false,
                reason: "server_overwrite_failed",
                detail: json2,
              });
              return;
            }
          }

          setPlDataUploaded(true);
          resolve({ ok: true });
        } catch (err) {
          console.error("Back data excel parse/upload error:", err);
          alert(
            "결산보고서(Back data) 처리 중 오류가 발생했습니다. 양식을 확인해 주세요."
          );
          setPlReportRequested(false);
          resolve({
            ok: false,
            reason: "exception",
            detail: err?.message || String(err),
          });
        }
      };

      reader.readAsArrayBuffer(file);
    });
  };

  // ==========================
  // 엑셀 업로드 (결산 Back data)
  // ==========================
  const handleUploadPlFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingPlFile(file);
  };

  const handleConfirmPlUpload = async () => {
    if (!pendingPlFile) return;

    try {
      setPlUploading(true);
      setPlDataUploaded(false);

      const result = await parseAndApplyBackData(pendingPlFile);
      if (!result?.ok) return;
    } finally {
      setPlUploading(false);
      setPendingPlFile(null);
      if (plFileInputRef.current) plFileInputRef.current.value = "";
    }
  };

  const handleCancelPendingPlFile = () => {
    setPendingPlFile(null);
    if (plFileInputRef.current) plFileInputRef.current.value = "";
  };

  // PlReportTab 내부 업로드 input에서 쓰는 핸들러
  const handleBackDataFile = (event) => {
    const file = event?.target?.files?.[0];
    if (!file) return;
    parseAndApplyBackData(file);
  };

  // ==========================
  // 비용 데이터 기반 월 메타
  // ==========================
  const costMonthMeta = useMemo(() => {
    if (!costData || costData.length === 0) return [];
    const sample = costData[0];
    const allCols = Object.keys(sample);

    let headerBased = allCols.filter((col) => {
      const s = String(col);
      return /(20\d{2}.*\d{1,2}|^\d{4}-\d{2}$|^\d{4}\.\d{2}$|20\d{2}년\s*\d{1,2}월)/.test(
        s
      );
    });

    if (!headerBased.length) {
      headerBased = allCols.filter((col) => {
        let numericCount = 0;
        let nonEmpty = 0;
        const limit = Math.min(costData.length, 50);
        for (let i = 0; i < limit; i++) {
          const v = costData[i][col];
          if (v === null || v === undefined || v === "") continue;
          nonEmpty++;
          if (!isNaN(Number(v))) numericCount++;
        }
        return nonEmpty > 0 && numericCount / nonEmpty >= 0.7;
      });
    }

    const metas = headerBased.map((col, idx) => {
      const s = String(col);
      const m = s.match(/(20\d{2})\D?(\d{1,2})/);
      let year = null;
      let month = null;
      if (m) {
        year = parseInt(m[1], 10);
        month = parseInt(m[2], 10);
      }
      let label;
      if (year && month)
        label = String(year) + "-" + String(month).padStart(2, "0");
      else label = s;

      return { col, label, year, month, index: idx };
    });

    metas.sort((a, b) => {
      if (a.year && b.year && a.month && b.month) {
        if (a.year !== b.year) return a.year - b.year;
        return a.month - b.month;
      }
      return a.index - b.index;
    });

    return metas;
  }, [costData]);

  useEffect(() => {
    if (!costMonthMeta.length) return;
    const labels = costMonthMeta.map((m) => m.label);
    if (!selectedMonth || !labels.includes(selectedMonth)) {
      setSelectedMonth(costMonthMeta[costMonthMeta.length - 1].label);
    }
  }, [costMonthMeta, selectedMonth]);

  // 월별 총비용
  const monthlyTotalCost = useMemo(() => {
    if (!costData || !costMonthMeta.length) return [];

    return costMonthMeta.map((meta) => {
      let total = 0;
      costData.forEach((row) => {
        const v = row[meta.col];
        const num = Number(v);
        if (!isNaN(num)) total += num;
      });

      let lastYear = 0;
      if (meta.year && meta.month) {
        const prevMeta = costMonthMeta.find(
          (m) => m.month === meta.month && m.year === meta.year - 1
        );
        if (prevMeta) {
          let ly = 0;
          costData.forEach((row) => {
            const v = row[prevMeta.col];
            const num = Number(v);
            if (!isNaN(num)) ly += num;
          });
          lastYear = ly;
        }
      }

      return {
        month: meta.label,
        total: Math.round(total),
        lastYear: Math.round(lastYear),
      };
    });
  }, [costData, costMonthMeta]);

  // 계정군별 비중
  const accountGroupShare = useMemo(() => {
    if (!costData || !costMonthMeta.length || !selectedMonth) return [];

    const meta =
      costMonthMeta.find((m) => m.label === selectedMonth) ||
      costMonthMeta[costMonthMeta.length - 1];
    const monthCol = meta.col;

    const sample = costData[0] || {};
    const keys = Object.keys(sample);

    const accGroupKey =
      keys.find((k) => k.includes("계정군")) ||
      keys.find((k) => k.includes("비용군")) ||
      keys.find((k) => /account.?group/i.test(k));

    const accNameKey =
      keys.find((k) => k.includes("계정명")) ||
      keys.find(
        (k) =>
          (k.includes("계정") || k.includes("계정과목")) && !k.includes("코드")
      ) ||
      keys.find((k) => /account.?name/i.test(k));

    const groupTotals = {};

    costData.forEach((row) => {
      const rawVal = row[monthCol];
      const num = Number(rawVal);
      if (isNaN(num) || num === 0) return;

      const amount = Math.abs(num);
      let group = "기타";

      if (accGroupKey) {
        group = String(row[accGroupKey] || "기타");
      } else if (accNameKey) {
        const accName = String(row[accNameKey] || "");
        if (accName.startsWith("(")) {
          const m = accName.match(/^\((.)\)/);
          if (m) {
            const mark = m[1];
            if (mark === "제") group = "제조원가(제)";
            else if (mark === "판") group = "판관비(판)";
            else if (mark === "영") group = "영업비용(영)";
            else if (mark === "연") group = "연구개발비(연)";
            else group = "기타(기)";
          } else group = "기타(기)";
        } else group = "기타(기)";
      }

      if (!groupTotals[group]) groupTotals[group] = 0;
      groupTotals[group] += amount;
    });

    let entries = Object.entries(groupTotals)
      .map(([name, value]) => ({ name, value }))
      .filter((x) => x.value !== 0);

    if (!entries.length) return [];

    entries.sort((a, b) => b.value - a.value);

    const MAX_GROUPS = 5;
    const main = entries.slice(0, MAX_GROUPS);
    const rest = entries.slice(MAX_GROUPS);

    if (rest.length) {
      const etcSum = rest.reduce((s, x) => s + x.value, 0);
      main.push({ name: "기타", value: etcSum });
    }

    return main.map((x) => ({ ...x, value: Math.round(x.value) }));
  }, [costData, costMonthMeta, selectedMonth]);

  // 코스트센터별 비용 Top 5
  const topCostCenters = useMemo(() => {
    if (!costData || !costMonthMeta.length || !selectedMonth) return [];

    const meta =
      costMonthMeta.find((m) => m.label === selectedMonth) ||
      costMonthMeta[costMonthMeta.length - 1];
    const monthCol = meta.col;

    const sample = costData[0] || {};
    const keys = Object.keys(sample);

    const ccNameKey =
      keys.find((k) => k.includes("코스트센터명")) ||
      keys.find((k) => k.includes("코스트센터") && !k.includes("코드")) ||
      keys.find((k) => /cost.?center.?name/i.test(k));
    const ccCodeKey =
      keys.find((k) => k.includes("코스트센터코드")) ||
      keys.find((k) => /cost.?center.?code/i.test(k));

    const totals = {};
    costData.forEach((row) => {
      const amount = Number(row[monthCol]) || 0;
      if (!amount) return;
      const name =
        (ccNameKey && row[ccNameKey]) ||
        (ccCodeKey && row[ccCodeKey]) ||
        "기타";
      const key = String(name);
      if (!totals[key]) totals[key] = 0;
      totals[key] += amount;
    });

    const arr = Object.entries(totals).map(([name, cost]) => ({
      name,
      cost: Math.round(cost),
    }));
    arr.sort((a, b) => b.cost - a.cost);
    return arr.slice(0, 5);
  }, [costData, costMonthMeta, selectedMonth]);

  // Closing 탭 분석
  const closingAnalysis = useMemo(() => {
    if (anomalyData && anomalyData.length > 0) {
      const issues = anomalyData.filter(
        (r) => r.issue_type && r.issue_type !== "정상"
      );
      if (!issues.length) return { rows: [], history: {} };

      const history = {};
      issues.forEach((r) => {
        const key = `${r.account_code || ""}|${r.account_name || ""}|${
          r.cost_center || ""
        }`;
        if (!history[key]) history[key] = [];
        history[key].push({
          month: String(r.year_month || ""),
          amount: Number(r.amount) || 0,
        });
      });

      Object.keys(history).forEach((key) =>
        history[key].sort((a, b) => a.month.localeCompare(b.month))
      );

      const rows = issues
        .map((r, idx) => {
          const severity = Number(r.severity_rank || 0);

          let status = "check";
          if (r.issue_type === "결측 의심") status = "issue";
          else if (r.issue_type === "이상치 의심" && severity >= 4)
            status = "issue";

          const key = `${r.account_code || ""}|${r.account_name || ""}|${
            r.cost_center || ""
          }`;

          const patternMean =
            r.patternMean ??
            r.pattern_mean ??
            r.base_mean ??
            r.pattern_avg ??
            null;
          const patternUpper =
            r.patternUpper ?? r.pattern_upper ?? r.base_upper ?? null;
          const patternLower =
            r.patternLower ?? r.pattern_lower ?? r.base_lower ?? null;

          return {
            id: idx + 1,
            key,
            month: String(r.year_month || ""),
            accountCode: r.account_code || "",
            accountName: r.account_name || "",
            costCenter: r.cc_name || r.cost_center || "",
            amount: Number(r.amount) || 0,
            status,
            reason: r.reason_kor || "",
            issueType: r.issue_type || "",
            severity,
            patternMean,
            patternUpper,
            patternLower,
          };
        })
        .sort((a, b) => {
          if (b.severity !== a.severity) return b.severity - a.severity;
          return Math.abs(b.amount) - Math.abs(a.amount);
        });

      return { rows: rows.slice(0, 50), history };
    }

    if (!costData || !costMonthMeta.length) return { rows: [], history: {} };

    const sample = costData[0] || {};
    const keys = Object.keys(sample);

    const accNameKey =
      keys.find((k) => k.includes("계정명")) ||
      keys.find((k) => k.includes("계정") && !k.includes("코드")) ||
      keys.find((k) => /account.?name/i.test(k));
    const accCodeKey =
      keys.find((k) => k.includes("계정코드")) ||
      keys.find((k) => /account.?code/i.test(k));
    const ccNameKey =
      keys.find((k) => k.includes("코스트센터명")) ||
      keys.find((k) => k.includes("코스트센터") && !k.includes("코드")) ||
      keys.find((k) => /cost.?center.?name/i.test(k));

    const history = {};
    const seriesMap = new Map();

    costData.forEach((row) => {
      const code = accCodeKey ? String(row[accCodeKey] || "") : "";
      const name = accNameKey ? String(row[accNameKey] || "") : "";
      const cc = ccNameKey ? String(row[ccNameKey] || "") : "";
      const key = `${code}|${name}|${cc}`;

      if (!seriesMap.has(key)) {
        seriesMap.set(key, {
          accountCode: code,
          accountName: name || "(계정명 없음)",
          costCenter: cc || "-",
          series: new Array(costMonthMeta.length).fill(0),
        });
      }
      const item = seriesMap.get(key);
      costMonthMeta.forEach((meta, idx) => {
        const v = Number(row[meta.col]) || 0;
        item.series[idx] += v;
      });
    });

    const rows = [];
    let idCounter = 1;

    seriesMap.forEach((item, key) => {
      const s = item.series;
      const lastIdx = s.length - 1;
      if (lastIdx < 0) return;

      const lastVal = s[lastIdx];
      const prevVal = lastIdx > 0 ? s[lastIdx - 1] : 0;
      const prevAvg =
        lastIdx > 0
          ? s.slice(0, lastIdx).reduce((a, v) => a + v, 0) / lastIdx
          : 0;

      let status = null;
      let reason = "";
      if (lastVal === 0 && prevAvg > 0) {
        status = "issue";
        reason = "이전 기간 대비 갑작스러운 0원 발생 (누락 가능성)";
      } else {
        const diff = lastVal - prevVal;
        const rate = prevVal ? diff / prevVal : 0;
        if (Math.abs(rate) >= 0.5 && Math.abs(diff) > 0) {
          status = "check";
          reason = `전월 대비 ${Math.round(rate * 100)}% 변동`;
        } else if (Math.abs(rate) <= 0.1) {
          status = "ok";
          reason = "전월과 유사한 수준 (안정 구간)";
        }
      }

      if (!status) return;

      const monthLabel = costMonthMeta[lastIdx].label;

      history[key] = costMonthMeta.map((meta, idx) => ({
        month: meta.label,
        amount: s[idx],
      }));

      rows.push({
        id: idCounter++,
        key,
        month: monthLabel,
        accountCode: item.accountCode,
        accountName: item.accountName,
        costCenter: item.costCenter,
        amount: lastVal,
        status,
        reason,
      });
    });

    rows.sort((a, b) => {
      const order = { issue: 0, check: 1, ok: 2 };
      const sdiff = order[a.status] - order[b.status];
      if (sdiff !== 0) return sdiff;
      return Math.abs(b.amount) - Math.abs(a.amount);
    });

    return { rows: rows.slice(0, 30), history };
  }, [anomalyData, costData, costMonthMeta]);

  // KPI (Overview)
  const kpi = useMemo(() => {
    if (!monthlyTotalCost.length || !selectedMonth) {
      return {
        currentTotal: 0,
        diff: 0,
        diffRate: 0,
        ytdTotal: 0,
        yoyDiff: 0,
        yoyRate: 0,
      };
    }

    const idx = monthlyTotalCost.findIndex((m) => m.month === selectedMonth);
    if (idx === -1) {
      return {
        currentTotal: 0,
        diff: 0,
        diffRate: 0,
        ytdTotal: 0,
        yoyDiff: 0,
        yoyRate: 0,
      };
    }

    const cur = monthlyTotalCost[idx];
    const prev = idx > 0 ? monthlyTotalCost[idx - 1] : null;

    const currentTotal = cur.total;
    const diff = prev ? currentTotal - prev.total : 0;
    const diffRate = prev && prev.total ? (diff / prev.total) * 100 : 0;

    const ytdTotal = monthlyTotalCost
      .slice(0, idx + 1)
      .reduce((acc, v) => acc + v.total, 0);

    const yoyDiff = cur.lastYear ? cur.total - cur.lastYear : 0;
    const yoyRate = cur.lastYear ? (yoyDiff / cur.lastYear) * 100 : 0;

    return { currentTotal, diff, diffRate, ytdTotal, yoyDiff, yoyRate };
  }, [monthlyTotalCost, selectedMonth]);

  // ==========================
  // ✅ 주제3: P&L 계산 로직
  // ==========================
  const plAvailablePeriods = useMemo(() => {
    if (!backData) return [];
    const set = new Set();
    backData.forEach((row) => {
      const v = row["전기 기간"];
      if (v !== undefined && v !== null && v !== "") set.add(Number(v));
    });
    return Array.from(set)
      .sort((a, b) => a - b)
      .map((v) => String(v));
  }, [backData]);

  const plRows = useMemo(() => {
    if (!backData) return [];

    const dimColName = DIM_COL_MAP[plDimension];
    if (!dimColName) return [];

    let filtered = backData;
    if (plPeriod !== "all") {
      const target = Number(plPeriod);
      filtered = backData.filter((row) => Number(row["전기 기간"]) === target);
    }
    if (!filtered.length) return [];

    const groups = new Map();

    const sumCols = (row, cols) =>
      cols.reduce(
        (acc, col) =>
          acc +
          (row[col] !== undefined && row[col] !== null
            ? Number(row[col]) || 0
            : 0),
        0
      );

    filtered.forEach((row) => {
      let rawKey = row[dimColName];
      if (rawKey === undefined || rawKey === null || rawKey === "")
        rawKey = "(미지정)";
      else rawKey = String(rawKey);

      let displayName = rawKey;
      if (codeNameMap && Object.keys(codeNameMap).length > 0) {
        if (codeNameMap[rawKey]) {
          displayName = codeNameMap[rawKey];
        } else {
          const token = rawKey.split(/[/\s]/)[0];
          if (codeNameMap[token])
            displayName = `${codeNameMap[token]} (${rawKey})`;
        }
      }

      const key = displayName;

      if (!groups.has(key)) {
        groups.set(key, {
          name: key,
          sales: 0,
          cogs: 0,
          sga: 0,
          nonOpRev: 0,
          nonOpExp: 0,
          tax: 0,
        });
      }

      const g = groups.get(key);
      g.sales += sumCols(row, SALES_COLS);
      g.cogs += sumCols(row, COGS_COLS);
      g.sga += sumCols(row, SGA_COLS);
      g.nonOpRev += sumCols(row, NONOP_REV_COLS);
      g.nonOpExp += sumCols(row, NONOP_EXP_COLS);
      g.tax += sumCols(row, TAX_COLS);
    });

    const rows = Array.from(groups.values()).map((g) => {
      const sales = g.sales;
      const cogs = g.cogs;
      const sga = g.sga;
      const nonOpRev = g.nonOpRev;
      const nonOpExp = g.nonOpExp;
      const tax = g.tax;

      const grossProfit = sales - cogs;
      const operatingIncome = sales - cogs - sga;
      const nonOpProfit = nonOpRev - nonOpExp;
      const preTax = operatingIncome + nonOpProfit;
      const netIncome = preTax - tax;

      const opMargin = sales ? (operatingIncome / sales) * 100 : 0;
      const netMargin = sales ? (netIncome / sales) * 100 : 0;

      return {
        name: g.name,
        sales,
        cogs,
        grossProfit,
        sga,
        operatingIncome,
        nonOpRev,
        nonOpExp,
        nonOpProfit,
        tax,
        preTax,
        netIncome,
        opMargin,
        netMargin,
      };
    });

    rows.sort((a, b) => b.sales - a.sales);
    return rows;
  }, [backData, plDimension, plPeriod, codeNameMap]);

  const plSummary = useMemo(() => {
    if (!plRows.length) return null;
    return plRows.reduce(
      (acc, r) => {
        acc.sales += r.sales;
        acc.cogs += r.cogs;
        acc.sga += r.sga;
        acc.nonOpRev += r.nonOpRev;
        acc.nonOpExp += r.nonOpExp;
        acc.nonOpProfit += r.nonOpProfit;
        acc.tax += r.tax;
        acc.preTax += r.preTax;
        acc.netIncome += r.netIncome;
        return acc;
      },
      {
        sales: 0,
        cogs: 0,
        sga: 0,
        nonOpRev: 0,
        nonOpExp: 0,
        nonOpProfit: 0,
        tax: 0,
        preTax: 0,
        netIncome: 0,
      }
    );
  }, [plRows]);

  const waterfallData = useMemo(() => {
    if (!plSummary) return [];
    const { sales, cogs, sga, nonOpProfit, tax, netIncome } = plSummary;

    const labels = [
      "매출액",
      "매출원가",
      "판관비",
      "영업외손익",
      "법인세비용",
      "당기순이익",
    ];
    const values = [sales, -cogs, -sga, nonOpProfit, -tax, netIncome];

    const steps = [];
    let cumulative = 0;
    labels.forEach((name, i) => {
      const amount = values[i];
      const start = cumulative;
      cumulative += amount;
      steps.push({ name, start, amount });
    });
    return steps;
  }, [plSummary]);

  const marginRankingData = useMemo(() => {
    if (!plRows.length) return [];
    const valid = plRows.filter((r) => r.sales > 0);
    if (!valid.length) return [];
    const sorted = [...valid].sort((a, b) => b.opMargin - a.opMargin);
    const top = sorted.slice(0, 5);
    const bottom = sorted.slice(-3);
    return [...top, ...bottom];
  }, [plRows]);

  const salesProfitData = useMemo(() => {
    if (!plRows.length) return [];
    const sorted = [...plRows].sort((a, b) => b.sales - a.sales);
    return sorted.slice(0, 10);
  }, [plRows]);

  const topUnitStructureData = useMemo(() => {
    if (!plRows.length) return null;
    const sorted = [...plRows].sort((a, b) => b.sales - a.sales);
    const top = sorted[0];
    return {
      name: top.name,
      items: [
        { label: "매출액", value: top.sales },
        { label: "매출원가", value: top.cogs },
        { label: "판관비", value: top.sga },
        { label: "영업이익", value: top.operatingIncome },
        { label: "영업외손익", value: top.nonOpProfit },
        { label: "법인세비용", value: top.tax },
        { label: "당기순이익", value: top.netIncome },
      ],
    };
  }, [plRows]);

  // ==========================
  // 레이아웃 / 스타일
  // ==========================
  const SIDEBAR_ICON_WIDTH = 56;
  const SIDEBAR_PANEL_WIDTH = 240;

  const layoutStyle = {
    display: "flex",
    minHeight: "100vh",
    backgroundColor: "#f5f7fb",
    fontFamily: "'Inter', 'Noto Sans KR', system-ui, sans-serif",
    color: BRAND_DARK,
  };

  const mainWrapperStyle = {
    flex: 1,
    padding: "18px 24px",
    minWidth: 0,
    marginLeft: 240,
  };

  const cardStyle = {
    backgroundColor: "#ffffff",
    borderRadius: 0,
    border: "1px solid #e5e7eb",
    boxShadow: "0 0 0 rgba(0,0,0,0.02)",
    padding: 14,
  };

  // ✅ 사이드메뉴: "그래프 전용 페이지" 항목 제거
  const sideMenus = [
    {
      id: "closing",
      label: "Closing Check",
      desc: "누락·이상 계정",
      icon: iconCheck,
    },
    {
      id: "pl_group",
      label: "P&L Report",
      desc: "결산 보고서",
      icon: iconDoc,
      children: [
        { id: "pl-report-basic", label: "기본 분석", desc: "표/요약" },
        { id: "pl-report-cause", label: "원인 분석", desc: "원인 분석" },
      ],
    },
    {
      id: "forecast",
      label: "Forecast",
      desc: "미래 결산 시나리오",
      icon: iconChart,
    },
    {
      id: "fx-tariff",
      label: "FX · Tariff",
      desc: "환율/관세 영향 (내수 vs 직수출)",
      icon: iconChart,
    },

  ];

  const currentMenu = useMemo(() => {
    const direct = sideMenus.find((m) => m && m.id === tab);
    if (direct) return direct;

    for (const m of sideMenus) {
      if (!m) continue;
      const kids = Array.isArray(m.children) ? m.children : [];
      const child = kids.find((c) => c && c.id === tab);
      if (child) {
        return {
          ...m,
          label: `${m.label} / ${child.label}`,
          desc: child.desc || m.desc,
        };
      }
    }
    return null;
  }, [sideMenus, tab]);

  // 업로드 아이콘 상태: idle / pending / uploading / uploaded
  const costIconStatus = costUploading
    ? "uploading"
    : pendingCostFile
    ? "pending"
    : costDataUploaded
    ? "uploaded"
    : "idle";
  const plIconStatus = plUploading
    ? "uploading"
    : pendingPlFile
    ? "pending"
    : plDataUploaded
    ? "uploaded"
    : "idle";

  const costIconStyle = getIconStyle(costIconStatus);
  const plIconStyle = getIconStyle(plIconStatus);

  const getCostStatusLabel = () => {
    if (costIconStatus === "uploading") return "분석·반영 중...";
    if (costIconStatus === "uploaded") return "대시보드에 반영됨";
    if (costIconStatus === "pending") return "파일 선택됨";
    return "";
  };

  const getPlStatusLabel = () => {
    if (plIconStatus === "uploading") return "적용 중...";
    if (plIconStatus === "uploaded") return "대시보드에 반영됨";
    if (plIconStatus === "pending") return "파일 선택됨";
    return "";
  };

  const costStatusLabel = getCostStatusLabel();
  const plStatusLabel = getPlStatusLabel();

  // =====================================================
  // 렌더링 분기
  // =====================================================

  if (!isLoggedIn) {
    return (
      <LoginPage
        onLoginSuccess={() => {
          setIsLoggedIn(true);
          setStage("landing");
          setInitProgress(0);

          setCostDataUploaded(false);
          setPlDataUploaded(false);
          setPlReportRequested(false);
          setBackFile(null);

          // ✅ report_data Month 상태 초기화(추가)
          setSelectedReportYm("");
          setReportPeriods([]);
        }}
        theme={theme}
        setTheme={setTheme}
      />
    );
  }

  if (stage === "landing") {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: BG_LIGHT,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <style>{`
          @keyframes fadeUpLogo {
            from { opacity: 0; transform: translateY(12px) scale(0.96); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes fadeUpText {
            from { opacity: 0; transform: translateY(8px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginBottom: 24,
            animation: "fadeUpLogo 0.8s ease-out forwards",
          }}
        >
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: 24,
              backgroundColor: "#f3f4f6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 20px 40px rgba(15,23,42,0.18)",
              marginBottom: 12,
            }}
          >
            <img
              src={logoSmall}
              alt="ILJI TECH"
              style={{
                maxWidth: "72%",
                maxHeight: "72%",
                objectFit: "contain",
              }}
            />
          </div>

          <div
            style={{
              fontSize: 26,
              fontWeight: 800,
              letterSpacing: 3,
              color: BRAND_DARK,
              textTransform: "uppercase",
              marginBottom: 4,
              animation: "fadeUpText 0.9s ease-out 0.15s forwards",
              opacity: 0,
            }}
          >
            ILJI TECH
          </div>

          <div
            style={{
              fontSize: 13,
              color: "#6b7280",
              animation: "fadeUpText 0.9s ease-out 0.25s forwards",
              opacity: 0,
            }}
          >
            AI 기반 월 결산 모니터링 대시보드
          </div>
        </div>

        <div
          style={{ width: 260, marginTop: 8, fontSize: 11, color: "#6b7280" }}
        >
          <div
            style={{
              marginBottom: 6,
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>데이터 로딩 중...</span>
            <span>{initProgress}%</span>
          </div>

          <div
            style={{
              width: "100%",
              height: 6,
              borderRadius: 999,
              backgroundColor: "#e5e7eb",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${initProgress}%`,
                height: "100%",
                background: "linear-gradient(90deg, #22c55e, #3b82f6, #6366f1)",
                transition: "width 0.2s ease-out",
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  if (stage === "error") {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: BG_LIGHT,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          color: BRAND_DARK,
        }}
      >
        <div style={{ marginBottom: 12, fontSize: 18, fontWeight: 700 }}>
          데이터를 불러오는 중 오류가 발생했습니다.
        </div>
        <div style={{ fontSize: 13, color: "#6b7280" }}>
          백엔드 서버({API_BASE})가 실행 중인지 확인해주세요.
        </div>

        <button
          type="button"
          onClick={() => {
            setStage("landing");
            setInitProgress(0);
          }}
          style={{
            marginTop: 14,
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            background: "#fff",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 700,
            color: BRAND_DARK,
          }}
        >
          다시 시도
        </button>

        <button
          type="button"
          onClick={() => {
            setIsLoggedIn(false);
            setStage("landing");
            setInitProgress(0);
          }}
          style={{
            marginTop: 8,
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            background: "#fff",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 700,
            color: "#ef4444",
          }}
        >
          로그아웃
        </button>
      </div>
    );
  }

  // 3) 실제 대시보드 레이아웃 (stage === "app")
  return (
    <div style={layoutStyle}>
      {/* 숨겨진 파일 input들 */}
      <input
        type="file"
        accept=".xlsx,.xls"
        ref={costFileInputRef}
        style={{ display: "none" }}
        onChange={handleUploadCostFile}
      />
      <input
        type="file"
        accept=".xlsx,.xls"
        ref={plFileInputRef}
        style={{ display: "none" }}
        onChange={handleUploadPlFile}
      />

      {/* ✅ 왼쪽 아이콘 열 */}
      <SidebarIcons
        sideMenus={sideMenus}
        tab={tab}
        setTab={setTab}
        logoSmall={logoSmall}
        SIDEBAR_ICON_WIDTH={SIDEBAR_ICON_WIDTH}
        costFileInputRef={costFileInputRef}
        plFileInputRef={plFileInputRef}
        costIconStyle={costIconStyle}
        plIconStyle={plIconStyle}
        pendingCostFile={pendingCostFile}
        pendingPlFile={pendingPlFile}
        costUploading={costUploading}
        plUploading={plUploading}
        costIconStatus={costIconStatus}
        plIconStatus={plIconStatus}
        onPickCostFile={() => costFileInputRef.current?.click()}
        onPickPlFile={() => plFileInputRef.current?.click()}
        onConfirmCost={handleConfirmCostUpload}
        onCancelCost={handleCancelPendingCostFile}
        onConfirmPl={handleConfirmPlUpload}
        onCancelPl={handleCancelPendingPlFile}
        onLogout={() => {
          setIsLoggedIn(false);
          setStage("landing");
          setInitProgress(0);
        }}
      />

      {/* ✅ 오른쪽 설명/업로드 패널 */}
      <SidebarPanel
        sideMenus={sideMenus}
        tab={tab}
        setTab={setTab}
        SIDEBAR_ICON_WIDTH={SIDEBAR_ICON_WIDTH}
        SIDEBAR_PANEL_WIDTH={SIDEBAR_PANEL_WIDTH}
        BRAND_DARK={BRAND_DARK}
        costFileInputRef={costFileInputRef}
        plFileInputRef={plFileInputRef}
        costStatusLabel={costStatusLabel}
        plStatusLabel={plStatusLabel}
        costIconStatus={costIconStatus}
        plIconStatus={plIconStatus}
        pendingCostFile={pendingCostFile}
        pendingPlFile={pendingPlFile}
        handleConfirmCostUpload={handleConfirmCostUpload}
        handleCancelPendingCostFile={handleCancelPendingCostFile}
        costUploading={costUploading}
        handleConfirmPlUpload={handleConfirmPlUpload}
        handleCancelPendingPlFile={handleCancelPendingPlFile}
        plUploading={plUploading}
      />

      {/* 메인 콘텐츠 */}
      <main style={mainWrapperStyle}>
        {/* ✅ 헤더 */}
        {/* ✅ 헤더 (화이트 미니멀 버전) */}
        <header style={{ marginBottom: 10 }}>
          <div
            style={{
              position: "relative",
              padding: "18px 20px 14px",
              margin: "-18px -24px 12px",
              background: "#ffffff",
              borderBottom: "1px solid #e5e7eb",
              // ✅ 헤더를 “화이트지만 예쁘게” 만드는 아주 얇은 톤
              boxShadow: "0 1px 0 rgba(15,23,42,0.02)",
            }}
          >
            {/* ✅ 상단 아주 얇은 포인트 라인 (있어도 과하지 않게) */}
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                height: 2,
                background:
                  "linear-gradient(90deg, rgba(34,197,94,0.9) 0%, rgba(34,197,94,0.7) 30%, rgba(245,158,11,0.75) 65%, rgba(249,115,22,0.85) 100%)",
              }}
            />

            <div style={{ maxWidth: 1400, margin: "0 auto" }}>
              {/* 상단 작은 라벨 */}
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 11,
                  fontWeight: 900,
                  letterSpacing: 0.35,
                  color: "#334155",
                  marginBottom: 10,

                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px solid #e5e7eb",
                  background: "rgba(248,250,252,0.9)",
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    background: "#22c55e",
                    boxShadow: "0 0 0 3px rgba(34,197,94,0.12)",
                  }}
                />
                AI Closing Monitor
              </div>

              {/* 타이틀 */}
              <h1
                style={{
                  fontSize: 22, // ✅ 과하게 크지 않게(전문적인 톤)
                  fontWeight: 950,
                  margin: "0 0 10px",
                  color: "#0f172a",
                  letterSpacing: -0.35,
                  lineHeight: 1.18,
                }}
              >
                AI 기반 월 결산 모니터링 대시보드
              </h1>

              {/* 메뉴 / Month / 상태 영역 */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                  paddingTop: 10,
                  borderTop: "1px solid #f1f5f9",

                  // ✅ 중간 박스 “그림자 큰 느낌” 방지: 카드처럼 보이지 않게
                  background: "transparent",
                }}
              >
                {/* 왼쪽: 현재 메뉴 */}
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 3 }}
                >
                  {/* ✅ “탭 라벨 같은” 느낌의 캡슐 */}
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      width: "fit-content",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        height: 28,
                        padding: "0 12px",
                        borderRadius: 999,
                        background: "rgba(15,23,42,0.03)",
                        border: "1px solid rgba(15,23,42,0.08)",
                        color: "#0f172a",
                        fontSize: 12,
                        fontWeight: 950,
                        letterSpacing: -0.2,
                      }}
                      title={currentMenu?.label || "Closing Check"}
                    >
                      {currentMenu?.label || "Closing Check"}
                    </span>

                    {/* ✅ 아주 옅은 서브 라벨(설명) */}
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 650,
                        color: "#64748b",
                      }}
                    >
                      {currentMenu?.desc || "누락·이상 계정"}
                    </span>
                  </div>
                </div>

                {/* 오른쪽: 컨트롤 */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  {/* Month */}
                  <span
                    style={{
                      ...chipBase,
                      background: "#ffffff",
                      border: "1px solid #e5e7eb",
                      boxShadow: "0 0 0 rgba(0,0,0,0)", // ✅ 확실히 제거
                    }}
                  >
                    <span style={{ color: "#64748b", fontWeight: 900 }}>
                      Month
                    </span>
                    <span style={{ color: "#cbd5e1", fontWeight: 900 }}>·</span>

                    <select
                      value={
                        isPlReportTab
                          ? selectedReportYm || ""
                          : selectedMonth || ""
                      }
                      onMouseDown={(e) => {
                        if (lockMonthSelect) e.preventDefault();
                      }}
                      onKeyDown={(e) => {
                        if (lockMonthSelect) e.preventDefault();
                      }}
                      onChange={(e) => {
                        if (lockMonthSelect) return;
                        const v = e.target.value;
                        if (isPlReportTab) setSelectedReportYm(v);
                        else setSelectedMonth(v);
                      }}
                      style={{
                        border: "none",
                        outline: "none",
                        background: "transparent",
                        fontSize: 11,
                        fontWeight: 900,
                        color: "#0f172a",
                        cursor: "pointer",
                        appearance: "none",
                      }}
                    >
                      {isPlReportTab ? (
                        !reportPeriods?.length ? (
                          <option value="">-</option>
                        ) : (
                          reportPeriods.map((ym) => (
                            <option key={ym} value={ym}>
                              {ym}
                            </option>
                          ))
                        )
                      ) : !costMonthMeta?.length ? (
                        <option value="">-</option>
                      ) : (
                        costMonthMeta.map((m) => (
                          <option key={m.label} value={m.label}>
                            {m.label}
                          </option>
                        ))
                      )}
                    </select>
                    <span style={{ color: "#94a3b8", fontWeight: 900 }}>▾</span>
                  </span>

                  {/* Cost 상태 */}
                  <span
                    style={{
                      ...chipBase,
                      background: "#ffffff",
                      border: "1px solid #e5e7eb",
                      boxShadow: "0 0 0 rgba(0,0,0,0)", // ✅ 확실히 제거
                      color:
                        costIconStatus === "uploaded"
                          ? "#065f46"
                          : costIconStatus === "uploading"
                          ? "#92400e"
                          : costIconStatus === "pending"
                          ? "#334155"
                          : "#94a3b8",
                    }}
                  >
                    <span style={{ color: "#64748b", fontWeight: 900 }}>
                      Cost
                    </span>
                    <span style={{ color: "#cbd5e1", fontWeight: 900 }}>·</span>
                    {costIconStatus === "uploaded"
                      ? "OK"
                      : costIconStatus === "uploading"
                      ? "Loading"
                      : costIconStatus === "pending"
                      ? "Ready"
                      : "None"}
                  </span>

                  {/* P&L 상태 */}
                  <span
                    style={{
                      ...chipBase,
                      background: "#ffffff",
                      border: "1px solid #e5e7eb",
                      boxShadow: "0 0 0 rgba(0,0,0,0)", // ✅ 확실히 제거
                      color:
                        plIconStatus === "uploaded"
                          ? "#065f46"
                          : plIconStatus === "uploading"
                          ? "#92400e"
                          : plIconStatus === "pending"
                          ? "#334155"
                          : "#94a3b8",
                    }}
                  >
                    <span style={{ color: "#64748b", fontWeight: 900 }}>
                      P&amp;L
                    </span>
                    <span style={{ color: "#cbd5e1", fontWeight: 900 }}>·</span>
                    {plIconStatus === "uploaded"
                      ? "OK"
                      : plIconStatus === "uploading"
                      ? "Loading"
                      : plIconStatus === "pending"
                      ? "Ready"
                      : "None"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* 탭별 렌더링 */}
        {tab === "closing" && (
          <ClosingTab
            closingAnalysis={closingAnalysis}
            anomalyResult={anomalyResult}
            anomalyLoading={anomalyLoading}
            anomalyError={anomalyError}
            selectedIssue={selectedIssue}
            onIssueRowClick={handleIssueRowClick}
            cardStyle={cardStyle}
            costMonthMeta={costMonthMeta}
            selectedMonth={selectedMonth}
            setSelectedMonth={setSelectedMonth}
            closingKpi={{ month: selectedMonth, ...kpi }}
            // ✅ (추가) 백엔드 심화분류 맵 전달
            advancedByCcAcc={advancedByCcAcc}
            advancedByAcc={advancedByAcc}
          />
        )}

        {/* ✅ 주제3: P&L 기본 (표 페이지) */}
        {tab === "pl-report-basic" && (
          <PlReportTab
            // ✅ report_data 기준 Month 전달(추가)
            selectedYm={selectedReportYm}
            setSelectedYm={setSelectedReportYm}
            reportPeriods={reportPeriods}
            // ===== 기존 props 전부 유지 =====
            plDetailTab={plDetailTab}
            setPlDetailTab={setPlDetailTab}
            plViewMode={plViewMode}
            setPlViewMode={setPlViewMode}
            plDimension={plDimension}
            setPlDimension={setPlDimension}
            plPeriod={plPeriod}
            setPlPeriod={setPlPeriod}
            plAvailablePeriods={plAvailablePeriods}
            plRows={plRows}
            plSummary={plSummary}
            waterfallData={waterfallData}
            marginRankingData={marginRankingData}
            salesProfitData={salesProfitData}
            topUnitStructureData={topUnitStructureData}
            handleBackDataFile={handleBackDataFile}
            data={plReportData}
            cardStyle={cardStyle}
          />
        )}

        {/* ✅ 주제3: P&L 심화(원인 분석) */}
        {tab === "pl-report-cause" && (
          <PlReportCauseTab selectedYm={selectedReportYm} />
        )}

        {tab === "forecast" && <ForecastTab cardStyle={cardStyle} />}

        {tab === "fx-tariff" && <FxTariffCompareTab cardStyle={cardStyle} />}
      </main>
    </div>
  );
}

export default App;
