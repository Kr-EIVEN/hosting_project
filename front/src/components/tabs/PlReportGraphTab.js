// front/coProject-main/sapcoproject/src/components/tabs/PlReportGraphTab.js

import React, { useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

/* ============================
 *  코드 → 내역 매핑 테이블들
 *  (PlReportTab.js 와 동일한 매핑)
 * ============================ */

// 플랜트
const PLANT_LABELS = {
  1010: "경산",
  1021: "경주1",
  1022: "경주2",
  1023: "경주3",
  1024: "경주4",
};

// Prod.계층구조01-2
const PROD_HIER_LABELS = {
  100001: "BACK",
  101001: "C/LAMP",
  102001: "COWL",
  103001: "CTR FLR",
  104001: "DASH",
  104002: "DASH&COWL",
  104003: "DASH&COWL&FR PLR",
  105001: "DASH CROSS MBR",
  106001: "F/APRON COMPL",
  106002: "F/APRON PNL",
  106003: "F/APRON MBR",
  107001: "FR PLR",
  108001: "P/TRAY",
  109001: "QTR INR COMPL",
  109002: "QTR LWR",
  109003: "QTR UPR",
  110001: "SUNROOF",
  110002: "PANORAMA SUNROOF",
  110003: "VISION ROOF",
  111001: "RR EXTN",
  112001: "RR FLR COMPL",
  112002: "PNL-RR FLR",
  112003: "MBR-RR FLR",
  113001: "RR STEP",
  114001: "REINF SIDE OTR COMPL",
  114002: "SIDE INR",
  114003: "SIDE OTR",
  115001: "SIDE SILL",
  116001: "STRC 740",
  116002: "STRC 741",
  116003: "STRC 747",
  116004: "STRC 749",
  116005: "STRC 760",
  116006: "STRC 764",
  116007: "STRC 767",
  116008: "STRC 768",
  116009: "STRC 780",
  116010: "STRC 789",
  116011: "STRC 793",
  116012: "STRC 798",
  116013: "STRC 799",
  116014: "STRC 801",
  116015: "STRC 805",
  116016: "STRC 808",
  116017: "STRC 810",
  116018: "STRC 813",
  116019: "STRC 816",
  116020: "STRC 840",
  116021: "STRC 845",
  116022: "STRC 846",
  116023: "STRC 859",
  116024: "STRC 863",
  116025: "STRC 864",
  200001: "FR DR",
  200002: "RR DR",
  201001: "HOOD",
  202001: "T/GATE",
  203001: "T/LID",
  300001: "RAD SUPT",
  800001: "BCA",
  800002: "BATTERY",
  801001: "H/W",
  802001: "PARTITION",
  803001: "PAD, SEALER",
  804001: "TYPE D",
  804002: "TYPE E",
  804003: "TYPE F",
  804004: "TYPE D-HV",
  804005: "TYPE E-HV",
  810001: "금형",
  810002: "설비",
  820001: "I/F",
  820002: "C/F",
  830001: "COIL",
  890001: "ETC",
  "900S11": "공구류",
  "900S12": "벨트류",
  "900S13": "베어링류",
  "900S14": "CASTER류",
  "900S15": "볼트너트류",
  "900S16": "철자재류",
  "900S17": "금형부품류",
  "900S18": "전기부품류",
  "900S19": "용접부품류",
  "900S20": "안전보호구류",
  "900S21": "페인트류",
  "900S22": "유공압류",
  "900S23": "GAS류",
  "900S24": "OIL류",
  "900S25": "배관자재류",
  "900S26": "호스류",
  "900S27": "잡자재류",
  "900S28": "시설수리비",
  "900S29": "금형펀치류",
  "910P01": "납입용기",
  "910P02": "운반구",
  "910P03": "포장재",
  "920I01": "(IT)하드웨어",
  "920I02": "(IT)소프트웨어",
  "920I03": "(IT)네트워크",
  "920I04": "(IT)솔루션",
  "920I05": "(IT)소모품",
  "920I06": "(IT)유지보수",
  "930F01": "(사무)장비",
  "930F02": "(사무)라이선스",
  "930F03": "(사무)사무기기",
  "930F04": "(사무)소모품",
  "980V01": "공사/프로젝트",
  "980V02": "설비수리",
  "980V03": "용역",
};

// 평가클래스
const VAL_CLASS_LABELS = {
  3000: "원재료",
  3010: "부재료-1차사직거래품",
  3011: "부재료-2차사반제품",
  3012: "부재료-핫스템핑",
  3013: "부재료-HMC사급품",
  3014: "부재료-H/W",
  3015: "부재료-PAD",
  3016: "부재료-구조용접착제",
  3100: "상품(부품)",
  3110: "상품(투자개발)",
  7900: "반제품",
  7920: "완제품",
};

// 손익센터
const PROFIT_CENTER_LABELS = {
  1010: "본사공통",
  1011: "본사1",
  1012: "본사2",
  1020: "경주공통",
  1021: "경주1",
  1022: "경주2",
  1023: "경주3",
  1024: "경주4",
};

// 유통경로
const CHANNEL_LABELS = {
  10: "내수 (10,20)",
  20: "로컬",
  30: "직수출",
  90: "사급 (90,91)",
  91: "비사급",
  92: "스크랩",
};

// 기타매출 유형
const OTHER_SALES_TYPE_LABELS = {
  1: "OEM",
  2: "시작차",
  3: "부산물",
  4: "수수료",
  5: "태양광",
  6: "리비안",
  7: "NX5",
  8: "NX5a",
  A: "폐기(배부)",
  B: "실사조정(배부)",
  C: "유상사급(배부)",
  D: "경상개발비(배부)",
  E: "소비재평가(배부)",
  F: "기타(무상)",
  G: "고객무상판매",
  H: "재료비 기타",
  Z: "결산조정",
};

// 레코드 유형
const RECORD_TYPE_LABELS = {
  1: "기타매출계획",
  2: "수출제비용 계획",
  3: "운송비계획",
  A: "수주",
  B: "FI에서 직접전기",
  C: "오더/프로젝트 정산",
  D: "간접비",
  E: "단일거래코스팅",
  F: "청구 데이터",
  G: "고객계약",
  H: "통계 주요 지표",
  I: "오더관련 프로젝트",
  L: "출고",
  Y: "PA재집계",
  Z: "매출원가조정(프로그램)",
};

// 판매문서 유형 (원본 유지)
const SD_DOC_TYPE_LABELS = {
  1: "고객 독립 소요량",
  AA: "판촉 오더",
  AD1: "A&D 계약",
  AD2: "A&D 차변 메모 요청",
  AD3: "A&D 소급 대금청구",
  AD9: "RRB 오더",
  AE: "서비스 오더 견적",
  AEBO: "표준 오더",
  AEBQ: "오퍼",
  AP: "프로젝트 견적",
  AR: "수리 견적",
  AS: "서비스 견적",
  AV: "일괄 계약 견적",
  B1: "리베이트대변메모요청",
  B1E: "예상리베이트대변메모",
  B2: "리베이트 수정 요청",
  B2E: "확장리베이트수정요청",
  B3: "분할리베이트정산요청",
  B3E: "예상분할리베이트정산",
  B4: "수동발생리베이트요청",
  BIND: "간접 영업 리베이트",
  BK1: "대변 메모 요청계약",
  BK3: "대변 메모 요청계약",
  BM1: "차변메모요청계약",
  BM3: "차변메모요청계약",
  BSC: "서비스 계약 BDR",
  BSVC: "서비스 확인 eBDR",
  BSVO: "서비스 오더 eBDR",
  BV: "현금 판매",
  CBIC: "회사 간 오더",
  CBOS: "신용 서비스 시트",
  CBRE: "약식 반품",
  CBSS: "신용 서비스 시트",
  CFB3: "CF 분할리베이트정산",
  CFG2: "CF 대변 메모 요청",
  CH: "계약 처리",
  CLRP: "요청 및 반품",
  CMDM: "표준 오더",
  CMR: "표준 오더",
  CMRC: "표준 오더",
  CMRP: "표준 오더",
  CQ: "수량 일괄 계약",
  CR: "대변 메모 요청",
  CR1: "서비스 대변메모 요청",
  DHU: "SlsDocTypeDelyHUmvmt",
  DJIT: "오더 유형 JIT",
  DL: "오더 유형 일정 계약",
  DL2: "ARM 고객 반품",
  DLR: "반품 오더 유형",
  DLRE: "반품 오더 유형",
  DMRB: "표준 오더",
  DMRP: "표준 오더",
  DMRR: "표준 오더",
  DR: "차변 메모 요청",
  DR1: "서비스 차변메모요청",
  DZL: "납입오더유형",
  ED: "외부대행업체출고",
  EDKO: "외부대행업체수정",
  FCQ: "",
  FD: "무상 납품",
  G2LV: "",
  G2W: "대변 메모 요청",
  G2WT: "대변메모 요청값",
  GA2: "대변 메모 요청",
  GCQ: "GG 수량 계약",
  GCTA: "표준 오더",
  GK: "마스터 계약",
  GOR: "GG 표준 오더",
  GPLM: "GG SW 유지보수",
  GQT: "GG 견적",
  GRE: "GG 반품",
  GVC: "GG 금액 계약",
  HBIN: "문의",
  HBOR: "표준 오더",
  HBQT: "견적",
  IBOS: "문의",
  ICPL: "고객 가격 리스트",
  IN: "문의",
  J3G1: "CEM 원가 정산",
  J3G2: "CEM 고객 정산",
  J3G6: "CEM 내부 자재 판매",
  J3G7: "CEM 내부 자재 재매입",
  J3G8: "CEM 외부 자재 판매",
  J3G9: "CEM 외부 자재 재매입",
  J3GB: "CEM 내부 대변 메모",
  J3GC: "CEM 외부 대변 메모",
  JBCD: "대변 메모 요청",
  JBDM: "차변 메모 요청",
  JGL: "대변 메모 요청(반품)",
  JLL: "차변 메모 요청(반품)",
  JOR: "표준 오더",
  JPCD: "대변 메모 요청",
  JPCM: "대변 메모 요청",
  JPDD: "차변 메모 요청",
  JPDM: "차변 메모 요청",
  JRE: "표준 오더",
  JREW: "표준 오더",
  JSDC: "대변 메모 요청",
  JSDD: "차변 메모 요청",
  JSDQ: "출하후지급 수량 계약",
  JSMC: "대변 메모 요청",
  JST1: "",
  KA: "위탁품 회수",
  KAZU: "위탁품회수 CompS",
  KB: "위탁품 입고",
  KE: "위탁품 출고",
  KR: "위탁품 반환",
  KRZU: "위탁품 반환 CompS",
  L2DM: "비용: 차변 메모 요청",
  L2DP: "비용: 지급 요청",
  L2W: "차변 메모 요청",
  L2WT: "차변 메모 요청 값",
  LA: "반품용 포장재 회수",
  LK: "납품일정계약Ex.Agent",
  LKJ: "JIT 일정계약(위탁품)",
  LN: "반환용포장재출고",
  LP: "일정 계약",
  LV: "일괄계약차변메모요청",
  LXE: "XLO 대체 납품 일정",
  LXI: "XLO 내부 납품 일정",
  LZ: "릴리스 납품일정계약",
  LZER: "",
  LZJ: "JIT 일정 계약",
  LZJE: "JIT 일정 계약 ESA",
  LZJQ: "JIT 일정 계약(LQ)",
  LZM: "납품오더납품일정계약",
  LZS: "SA:송장으로 자체청구",
  MAKO: "납품오더수정",
  MV: "임대차 계약",
  NL: "보충 납품",
  OBLS: "오더 총액",
  OBOS: "오더 단위",
  OBSS: "OBSS",
  OR: "표준 오더",
  OR1: "표준 오더",
  PHAM: "",
  PHAV: "",
  PHOR: "",
  PLPA: "펜듀럼 리스트 요청",
  PLPR: "펜듀럼 리스트 재설정",
  PLPS: "펜듀럼 리스트 취소",
  POOL: "풀링 오더",
  PV: "품목 제안",
  QBLS: "견적 총액",
  QBOS: "견적 단위 BOS",
  QCPL: "고객 가격 리스트",
  QT: "견적",
  QTLV: "LV/QTO 요청",
  RA: "수리 요청",
  RA2: "ARM 사내 수리",
  RAF: "",
  RAG: "재고 정보",
  RAS: "수리 / 서비스 1",
  RE: "반품",
  RE2: "고급 반품",
  RK: "송장 수정 요청",
  RM: "업체 반품 오더",
  RTTC: "고객에게 SPE 반품",
  RTTR: "SPE 반품 정비",
  RX2: "ARM 외부 수리 오더",
  RXE: "XLO 이전 반품",
  RXI: "XLO 내부 오더",
  RZ: "반품 납품 일정 계약",
  SCR: "서비스의대변메모요청",
  SD: "차후 무상 납품",
  SD2: "ARM SDF",
  SI: "판매 정보",
  SO: "긴급 오더",
  SOR: "",
  SRVO: "판매 오더(서비스)",
  SRVP: "솔루션 견적 오더",
  STAT: "문의",
  TAF: "표준 오더(FPl)",
  TAM: "납품 오더",
  TAV: "표준 오더(VMI)",
  TBOS: "서비스 입력 시트",
  TBSS: "수행된 서비스 입력",
  TSA: "전화 영업",
  TXE: "XLO 이전 오더",
  TXI: "XLO 내부 오더",
  UPRR: "사용 부품 반품",
  UUPR: "신규 부품 반품",
  VBOS: "자재 관련 값 계약",
  VLAF: "",
  VLAG: "",
  VLRE: "",
  VLTA: "",
  VSH1: "버전 오더",
  WA: "값일괄계약관련",
  WK1: "값일괄계약-생성",
  WK2: "자재관련 값일괄계약",
  WL: "",
  WMPP: "WM 제품 공급",
  WV: "서비스 및 유지보수",
  ZCR: "대변 메모(-)",
  ZCR1: "선입고(-)",
  ZDR: "차변 메모(+)",
  ZDR1: "선입고(+)",
  ZEX: "KD수출",
  ZFD: "기타출고(무상)",
  ZKA: "위탁품 회수",
  ZKB: "위탁품 보충",
  ZKE: "위탁품 출고",
  ZKE2: "위탁품 출고(XXX)",
  ZKR: "위탁품 반환",
  ZOR: "고객판매",
  ZOR1: "사급판매",
  ZOR3: "투자개발 매각",
  ZOR4: "투자개발-잡이익",
  ZOR9: "스크랩 매각",
  ZRE: "고객 반품",
  ZRE1: "사급 반품",
  ZREN: "고객 무상 반품",
  ZTO: "시작품 판매",
};

// 조건명 → 매핑 테이블
const LABEL_MAPS = {
  플랜트: PLANT_LABELS,
  "Prod.계층구조01-2": PROD_HIER_LABELS,
  평가클래스: VAL_CLASS_LABELS,
  손익센터: PROFIT_CENTER_LABELS,
  유통경로: CHANNEL_LABELS,
  판매문서유형: SD_DOC_TYPE_LABELS,
  기타매출유형: OTHER_SALES_TYPE_LABELS,
  레코드유형: RECORD_TYPE_LABELS,
};

const getCodeLabel = (cond, code) => {
  const map = LABEL_MAPS[cond];
  if (!map) return code;
  return map[code] || code;
};

// 손익 구조에서 보여줄 항목 순서
const KPI_ORDER = [
  "매출액",
  "매출원가계",
  "매출총이익",
  "판매비와일반관리비",
  "영업이익",
  "영업외수익",
  "영업외비용",
  "당기순이익",
];

/* ============================
 * ✅ 조건 화면 전용: "전부 다른 색" 생성기
 * ============================ */
const colorFromIndex = (idx) => {
  const hue = (idx * 137.508) % 360;
  return `hsl(${hue}, 70%, 42%)`;
};

// 세부항목 막대 색상(share 기반) - 기본(양수용)
const getShareColor = (share) => {
  if (share >= 25) return "#1d4ed8";
  if (share >= 15) return "#2563eb";
  if (share >= 8) return "#60a5fa";
  return "#cbd5e1";
};

// ✅ 4-3~4-4 diverging 전용(음수는 빨강)
const getDivergingColor = (pct) => {
  const v = Math.abs(Number(pct) || 0);
  if (pct < 0) {
    if (v >= 25) return "#b91c1c";
    if (v >= 15) return "#dc2626";
    if (v >= 8) return "#fb7185";
    return "#fecdd3";
  }
  if (v >= 25) return "#1d4ed8";
  if (v >= 15) return "#2563eb";
  if (v >= 8) return "#60a5fa";
  return "#cbd5e1";
};

/* ============================
 * ✅ 상단 헤더용 조건 버튼 목록
 * ============================ */
const CONDITION_KEYS = [
  "전체",
  "플랜트",
  "대표차종",
  "유통경로",
  "판매문서유형",
  "기타매출유형",
  "평가클래스",
  "Prod.계층구조01-2",
  "손익센터",
];

/* ============================
 * ✅ PDF Export (시각화 영역만)
 * ============================ */
async function exportToPDF(targetEl, filename) {
  if (!targetEl) return;

  const canvas = await html2canvas(targetEl, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    scrollX: 0,
    scrollY: -window.scrollY,
  });

  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF("p", "mm", "a4");

  const pdfW = pdf.internal.pageSize.getWidth();
  const pdfH = pdf.internal.pageSize.getHeight();

  const imgW = pdfW;
  const imgH = (canvas.height * imgW) / canvas.width;

  let y = 0;
  let remaining = imgH;

  pdf.addImage(imgData, "PNG", 0, y, imgW, imgH);
  remaining -= pdfH;

  while (remaining > 0) {
    pdf.addPage();
    y = remaining - imgH;
    pdf.addImage(imgData, "PNG", 0, y, imgW, imgH);
    remaining -= pdfH;
  }

  pdf.save(filename);
}

/**
 * ✅ 추가 props
 * - showCondBar: 부모가 조건바를 렌더링하든 말든, "그래프 탭 내부"에서 조건바를 보여줄지
 */
function PlReportGraphTab({
  rows,
  selectedCond,
  selectedYear,
  selectedMonth,
  setSelectedCond,
  showCondBar = true,
}) {
  const hasData = rows && rows.length > 0;
  const exportRef = useRef(null);

// ✅ export 영역 자체가 비어 보이는 박스가 생기지 않도록 (안전장치)
const shouldRenderExportArea = hasData;


  const canControlByParent = typeof setSelectedCond === "function";
  const [localCond, setLocalCond] = useState(selectedCond || "전체");

  useEffect(() => {
    if (selectedCond) setLocalCond(selectedCond);
  }, [selectedCond]);

  const effectiveCond = canControlByParent ? selectedCond : localCond;

  const onCondClick = (c) => {
    if (canControlByParent) setSelectedCond(c);
    else setLocalCond(c);
  };

  const summaryColName =
    effectiveCond === "전체" ? "전체" : `${effectiveCond}_전체`;

  const getValue = (itemName, colOverride = null) => {
    if (!hasData) return 0;
    const colName = colOverride || summaryColName;
    const row = rows.find((r) => (r["항목"] || "").trim() === itemName) || null;
    if (!row) return 0;
    if (!Object.prototype.hasOwnProperty.call(row, colName)) return 0;
    const v = Number(row[colName]);
    if (Number.isNaN(v)) return 0;
    return v;
  };

  const toInt = (v) => {
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  };

  const getPrevYM = (y, m) => {
    const yy = toInt(y);
    const mm = toInt(m);
    if (!yy || !mm) return null;
    let py = yy;
    let pm = mm - 1;
    if (pm <= 0) {
      py = yy - 1;
      pm = 12;
    }
    return { y: py, m: pm };
  };

  const buildYmVariants = (y, m) => {
    const yy = toInt(y);
    const mm = toInt(m);
    if (!yy || !mm) return [];
    const mm2 = String(mm).padStart(2, "0");
    const yy2 = String(yy).slice(-2);

    return [
      `${yy}-${mm2}`,
      `${yy}_${mm2}`,
      `${yy}.${mm2}`,
      `${yy}/${mm2}`,
      `${yy}${mm2}`,
      `${yy2}-${mm2}`,
      `${yy2}.${mm2}`,
      `${yy2}${mm2}`,
      `${yy}년${mm}월`,
      `${yy}년${mm2}월`,
      `${mm}월`,
      `${mm2}월`,
    ];
  };

  const formatNumber = (v) => {
    if (v === null || v === undefined || v === "" || Number.isNaN(v))
      return "-";
    return Number(v).toLocaleString("ko-KR");
  };

  const formatSigned = (v) => {
    const num = Number(v);
    if (Number.isNaN(num)) return "-";
    const sign = num > 0 ? "+" : "";
    return sign + Math.round(num).toLocaleString("ko-KR");
  };

  const formatRate = (v) => {
    const num = Number(v);
    if (Number.isNaN(num)) return "-";
    const sign = num > 0 ? "+" : "";
    return `${sign}${num.toFixed(1)}%`;
  };

  const formatDeltaRateFromPrev = (cur, prev) => {
    const c = Number(cur);
    const p = Number(prev);
    if (Number.isNaN(c) || Number.isNaN(p) || p === 0) return "-";
    const r = ((c - p) / Math.abs(p)) * 100;
    return formatRate(r);
  };

  const getIndentLevel = (rawName) => {
    if (!rawName) return 0;
    const match = String(rawName).match(/^(\s*)/);
    return match ? match[1].length : 0;
  };

  const getDetailGroup = (
    parentTitle,
    topN = 10,
    colNameOverride = null,
    alwaysIncludeNames = []
  ) => {
    if (!hasData) return { total: 0, items: [] };

    const colName = colNameOverride || summaryColName;

    const parentIndex = rows.findIndex(
      (r) => (r["항목"] || "").trim() === parentTitle
    );
    if (parentIndex === -1) return { total: 0, items: [] };

    const parentRaw = rows[parentIndex]["항목"] || "";
    const parentIndent = getIndentLevel(parentRaw);
    const parentValue = Number(rows[parentIndex][colName]) || 0;

    const agg = {};

    for (let i = parentIndex + 1; i < rows.length; i += 1) {
      const rawName = rows[i]["항목"] || "";
      const indent = getIndentLevel(rawName);

      if (indent <= parentIndent) break;

      const label = rawName.trim();
      if (!label) continue;

      if (
        (parentTitle === "매출원가계" && label === "매출원가") ||
        (parentTitle === "판매비와일반관리비" && label === "판관비")
      )
        continue;

      const value = Number(rows[i][colName]) || 0;
      if (!value) continue;

      if (!agg[label]) agg[label] = 0;
      agg[label] += value;
    }

    const labels = Object.keys(agg);
    if (labels.length === 0) return { total: parentValue, items: [] };

    let items = labels
      .map((name) => ({ name, value: agg[name] }))
      .filter((d) => d.value !== 0);
    if (items.length === 0) return { total: parentValue, items: [] };

    items.sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    let sliced = items.slice(0, topN);

    alwaysIncludeNames.forEach((nm) => {
      const found = items.find((x) => x.name === nm);
      if (!found) return;
      if (sliced.some((x) => x.name === nm)) return;
      sliced = [...sliced, found];
    });

    const base = parentValue || sliced.reduce((s, d) => s + d.value, 0) || 1;

    const withShare = sliced.map((d) => ({
      ...d,
      share: (d.value / base) * 100,
    }));

    return { total: parentValue, items: withShare };
  };

  // ✅ 조건 Top10: "국내/수출"은 항상 '매출액(조건_전체)' 대비 비율로 계산
  const getConditionTop10ByItem = (itemName) => {
    if (!hasData || effectiveCond === "전체") return { total: 0, items: [] };

    const row = rows.find((r) => (r["항목"] || "").trim() === itemName) || null;
    if (!row) return { total: 0, items: [] };

    const prefix = `${effectiveCond}_`;
    const totalCol = `${effectiveCond}_전체`;

    const cols = Object.keys(rows[0] || {}).filter(
      (c) => c.startsWith(prefix) && c !== totalCol
    );

    const itemTotal = Number(row[totalCol]) || 0;

    const totalSalesForCond = getValue("매출액", totalCol) || 0;
    const isSalesMixItem =
      itemName === "국내매출액" || itemName === "수출매출액";
    const baseForShare = isSalesMixItem ? totalSalesForCond : itemTotal;

    const items = cols
      .map((col) => {
        const code = col.replace(prefix, "");
        const value = Number(row[col]) || 0;
        return {
          col,
          code,
          label: getCodeLabel(effectiveCond, code),
          value,
          share: baseForShare ? (value / baseForShare) * 100 : 0,
        };
      })
      .filter((d) => d.value !== 0)
      .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
      .slice(0, 10);

    return { total: itemTotal, items };
  };

  // -----------------------------
  // 0) 핵심 값
  // -----------------------------
  const totalSalesAll = getValue("매출액");
  const operatingIncome = getValue("영업이익");
  const netIncome = getValue("당기순이익");

  const domesticSales = getValue("국내매출액");
  const exportSales = getValue("수출매출액");

  const salesSafe = totalSalesAll || 1;

  const domesticPct = totalSalesAll ? (domesticSales / salesSafe) * 100 : 0;
  const exportPct = totalSalesAll ? (exportSales / salesSafe) * 100 : 0;

  const operatingMargin = totalSalesAll
    ? (operatingIncome / totalSalesAll) * 100
    : 0;
  const netMargin = totalSalesAll ? (netIncome / totalSalesAll) * 100 : 0;

  const cogs = getValue("매출원가계");
  const sga = getValue("판매비와일반관리비");
  const gross = getValue("매출총이익");

  // ✅ 영업비용 = 매출원가계 + 판관비, 영업비용률 = (원가+판관비)/매출
  const operatingCost = (Number(cogs) || 0) + (Number(sga) || 0);
  const operatingCostRatio = totalSalesAll
    ? (operatingCost / totalSalesAll) * 100
    : 0;

  const grossMargin = totalSalesAll ? (gross / totalSalesAll) * 100 : 0;

  // -----------------------------
  // 1) 손익 구조 시리즈(유지)
  // -----------------------------
  const kpiSeries = useMemo(() => {
    return KPI_ORDER.map((name) => ({
      name,
      value: getValue(name),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, summaryColName]);

  // -----------------------------
  // 2) 대표 지표 비율 (전체)
  // -----------------------------
  const ratioItems = useMemo(() => {
    const meta = [
      {
        key: "매출원가계",
        label: "매출원가율",
        sub: "COGS / Sales",
        formula: "매출원가계 ÷ 매출액",
        value: getValue("매출원가계"),
        tone: "blue",
      },
      {
        key: "매출총이익",
        label: "매출총이익률",
        sub: "Gross Margin",
        formula: "매출총이익 ÷ 매출액",
        value: getValue("매출총이익"),
        tone: "green",
      },
      {
        key: "판매비와일반관리비",
        label: "판관비율",
        sub: "SG&A / Sales",
        formula: "판관비 ÷ 매출액",
        value: getValue("판매비와일반관리비"),
        tone: "indigo",
      },
      {
        key: "영업이익",
        label: "영업이익률",
        sub: "Operating",
        formula: "영업이익 ÷ 매출액",
        value: getValue("영업이익"),
        tone: "teal",
      },
      {
        key: "당기순이익",
        label: "순이익률",
        sub: "Net Profit / Sales",
        formula: "당기순이익 ÷ 매출액",
        value: getValue("당기순이익"),
        tone: "slate",
      },
    ];

    const toneColor = (tone) => {
      if (tone === "blue") return "#2563eb";
      if (tone === "green") return "#16a34a";
      if (tone === "indigo") return "#4f46e5";
      if (tone === "teal") return "#0f766e";
      return "#0f172a";
    };

    return meta.map((it) => {
      const ratio = (it.value / salesSafe) * 100;
      return {
        ...it,
        ratio,
        ratioAbs: Math.max(0, Math.min(Math.abs(ratio), 100)),
        color: toneColor(it.tone),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, summaryColName, totalSalesAll]);

  // -----------------------------
  // 3) ✅ 조건 화면 KPI Top10
  // -----------------------------
  const conditionKpiTop10 = useMemo(() => {
    if (effectiveCond === "전체") return null;
    return {
      매출액: getConditionTop10ByItem("매출액"),
      매출원가계: getConditionTop10ByItem("매출원가계"),
      매출총이익: getConditionTop10ByItem("매출총이익"),
      판매비와일반관리비: getConditionTop10ByItem("판매비와일반관리비"),
      영업이익: getConditionTop10ByItem("영업이익"),
      영업외수익: getConditionTop10ByItem("영업외수익"),
      영업외비용: getConditionTop10ByItem("영업외비용"),
      당기순이익: getConditionTop10ByItem("당기순이익"),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, effectiveCond, hasData]);

  const conditionDomesticTop10 = useMemo(() => {
    if (effectiveCond === "전체") return { total: 0, items: [] };
    return getConditionTop10ByItem("국내매출액");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, effectiveCond, hasData]);

  const conditionExportTop10 = useMemo(() => {
    if (effectiveCond === "전체") return { total: 0, items: [] };
    return getConditionTop10ByItem("수출매출액");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, effectiveCond, hasData]);

  // -----------------------------
  // ✅ 조건 화면 공통 색상 맵
  // -----------------------------
  const conditionColorMap = useMemo(() => {
    if (effectiveCond === "전체") return {};

    const order = [];
    const seen = new Set();

    const pushCodes = (items = []) => {
      items.forEach((it) => {
        if (!it || !it.code) return;
        if (seen.has(it.code)) return;
        seen.add(it.code);
        order.push(it.code);
      });
    };

    pushCodes(conditionKpiTop10?.["매출액"]?.items || []);
    KPI_ORDER.forEach((kpi) => pushCodes(conditionKpiTop10?.[kpi]?.items || []));
    pushCodes(conditionDomesticTop10?.items || []);
    pushCodes(conditionExportTop10?.items || []);

    const map = {};
    order.forEach((code, idx) => {
      map[code] = colorFromIndex(idx);
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    effectiveCond,
    conditionKpiTop10,
    conditionDomesticTop10,
    conditionExportTop10,
  ]);

  const getCodeColor = (code) => conditionColorMap?.[code] || "#64748b";

  // -----------------------------
  // 4) ✅ 조건 세부 코드 목록
  // -----------------------------
  const conditionDetailCodes = useMemo(() => {
    if (!hasData || effectiveCond === "전체") return [];

    const prefix = `${effectiveCond}_`;
    const totalCol = `${effectiveCond}_전체`;
    const cols = Object.keys(rows[0] || {}).filter(
      (c) => c.startsWith(prefix) && c !== totalCol
    );
    const codes = cols.map((c) => c.replace(prefix, ""));

    return codes
      .map((code) => ({
        code,
        label: `${getCodeLabel(effectiveCond, code)} (${code})`,
        col: `${effectiveCond}_${code}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "ko-KR"));
  }, [hasData, rows, effectiveCond]);

  // ✅ 요청: 4-1~4-4 + 워터폴 “세부조건 선택”을 한 번에 동기화
  const [detailPickAll, setDetailPickAll] = useState("전체");

  useEffect(() => {
    setDetailPickAll("전체");
  }, [effectiveCond]);

  const getDetailCol = (pick) => {
    if (effectiveCond === "전체") return summaryColName;
    if (!pick || pick === "전체") return `${effectiveCond}_전체`;
    return `${effectiveCond}_${pick}`;
  };

  const detailCol41 = getDetailCol(detailPickAll);
  const detailCol42 = getDetailCol(detailPickAll);
  const detailCol43 = getDetailCol(detailPickAll);
  const detailCol44 = getDetailCol(detailPickAll);

  const cogsDetailTop10 = useMemo(
    () => getDetailGroup("매출원가계", 12, detailCol41, ["매출원가 기타"]),
    [rows, hasData, detailCol41]
  ); // eslint-disable-line
  const sgaDetailTop10 = useMemo(
    () => getDetailGroup("판매비와일반관리비", 10, detailCol42),
    [rows, hasData, detailCol42]
  ); // eslint-disable-line
  const nonOpIncomeDetailTop10 = useMemo(
    () => getDetailGroup("영업외수익", 10, detailCol43),
    [rows, hasData, detailCol43]
  ); // eslint-disable-line
  const nonOpExpenseDetailTop10 = useMemo(
    () => getDetailGroup("영업외비용", 10, detailCol44),
    [rows, hasData, detailCol44]
  ); // eslint-disable-line

  const domesticDetail = useMemo(
    () => getDetailGroup("국내매출액", 10, summaryColName),
    [rows, summaryColName, hasData]
  ); // eslint-disable-line
  const exportDetail = useMemo(
    () => getDetailGroup("수출매출액", 10, summaryColName),
    [rows, summaryColName, hasData]
  ); // eslint-disable-line

  const domesticItemsFiltered = domesticDetail.items.filter(
    (it) => !it.name.includes("판매수량")
  );
  const exportItemsFiltered = exportDetail.items.filter(
    (it) => !it.name.includes("판매수량")
  );

  /* ============================
   * ✅ Angular(각진) UI Tokens
   * ============================ */
  const UI = {
    bg: "#ffffff",
    page: "#f8fafc",
    border: "1px solid #e2e8f0",
    border2: "1px solid #cbd5e1",
    text: "#0f172a",
    sub: "#475569",
    mute: "#94a3b8",
    shadow: "0 0 0 rgba(0,0,0,0)",
    shadow2: "0 0 0 rgba(0,0,0,0)",
    radius: 4,
    radius2: 4,
    pad: 14,
    gap: 12,
  };

  const Tone = {
    blue: { fg: "#1d4ed8", bg: "#eff6ff", bd: "#bfdbfe" },
    green: { fg: "#166534", bg: "#f0fdf4", bd: "#bbf7d0" },
    red: { fg: "#991b1b", bg: "#fef2f2", bd: "#fecaca" },
    slate: { fg: "#0f172a", bg: "#f1f5f9", bd: "#cbd5e1" },
    indigo: { fg: "#3730a3", bg: "#eef2ff", bd: "#c7d2fe" },
    teal: { fg: "#115e59", bg: "#f0fdfa", bd: "#99f6e4" },
  };

  const condBtnBase = {
    height: 32,
    padding: "0 12px",
    borderRadius: UI.radius2,
    border: "1px solid #e2e8f0",
    background: "#ffffff",
    color: UI.text,
    fontSize: 12,
    fontWeight: 900,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };
  const condBtnActive = {
    border: "1px solid #0f172a",
    background: "#0f172a",
    color: "#fff",
  };

  const exportBtn = {
    height: 32,
    padding: "0 12px",
    borderRadius: UI.radius2,
    border: "1px solid #0f172a",
    background: "#fff",
    color: UI.text,
    fontSize: 12,
    fontWeight: 950,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    whiteSpace: "nowrap",
  };

  const GridRow = ({ min = 320, gap = UI.gap, children }) => (
    <div
      style={{
        width: "100%",
        display: "grid",
        gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`,
        gap,
        alignItems: "stretch",
      }}
    >
      {children}
    </div>
  );

  // ✅ (수정) 4-1~4-4: 가로폭 줄여 4개가 한 화면에 "딱" 보이도록
  const FourColRow = ({ gap = UI.gap, children }) => (
    <div style={{ width: "100%", overflowX: "hidden" }}>
      <div
        style={{
          width: "100%",
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap,
          alignItems: "stretch",
        }}
      >
        {children}
      </div>
    </div>
  );

  const Card = ({ title, kicker, right, children }) => {
    return (
      <div
        style={{
          width: "100%",
          background: UI.bg,
          borderRadius: UI.radius2,
          border: UI.border,
          overflow: "hidden",
          minWidth: 0,
        }}
      >
        <div
          style={{
            padding: "10px 12px",
            borderBottom: UI.border,
            background: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div style={{ minWidth: 0 }}>
            {kicker && (
              <div
                style={{
                  fontSize: 11,
                  color: UI.mute,
                  fontWeight: 900,
                  letterSpacing: 0.2,
                  textTransform: "uppercase",
                }}
              >
                {kicker}
              </div>
            )}
            {title && (
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 950,
                  color: UI.text,
                  marginTop: 2,
                  lineHeight: 1.25,
                }}
              >
                {title}
              </div>
            )}
          </div>
          {right && <div style={{ flex: "0 0 auto" }}>{right}</div>}
        </div>
        <div style={{ padding: "12px 12px 14px" }}>{children}</div>
      </div>
    );
  };

  const Pill = ({ text, tone = "slate" }) => {
    const t = Tone[tone] || Tone.slate;
    return (
      <span
        style={{
          padding: "5px 8px",
          borderRadius: UI.radius2,
          background: t.bg,
          color: t.fg,
          fontSize: 12,
          fontWeight: 900,
          border: `1px solid ${t.bd}`,
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
      >
        {text}
      </span>
    );
  };

  const LabelRow = ({ left, right }) => (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: 10,
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: UI.sub,
          fontWeight: 900,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {left}
      </div>
      <div
        style={{
          fontSize: 12,
          color: UI.text,
          fontWeight: 950,
          whiteSpace: "nowrap",
        }}
      >
        {right}
      </div>
    </div>
  );

  const Donut = ({ ratioAbs, label, sub, ratioText, formula, color }) => {
    const clamped = Math.max(0, Math.min(ratioAbs, 100));
    const bg = `conic-gradient(${color} ${clamped}%, #e2e8f0 0)`;

    return (
      <div
        style={{
          width: "100%",
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          style={{
            width: 140,
            height: 140,
            borderRadius: "50%",
            background: bg,
            border: UI.border,
            display: "grid",
            placeItems: "center",
          }}
        >
          <div
            style={{
              width: 104,
              height: 104,
              borderRadius: "50%",
              background: "#fff",
              border: UI.border,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                fontSize: 20,
                fontWeight: 950,
                color: UI.text,
                lineHeight: 1,
              }}
            >
              {ratioText}
            </div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 900,
                color: UI.mute,
                marginTop: 4,
              }}
            >
              {sub}
            </div>
          </div>
        </div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 950,
            color: UI.text,
            textAlign: "center",
          }}
        >
          {label}
        </div>
        {formula && (
          <div style={{ fontSize: 11, color: UI.mute, textAlign: "center" }}>
            {formula}
          </div>
        )}
      </div>
    );
  };

  /* ============================
   * ✅ 워터폴: 컨테이너 폭에 “꽉 차게” (공백 제거)
   * ============================ */
  const WaterfallPL = ({ height = 460, colNameOverride = null }) => {
    const col = colNameOverride || summaryColName;

    const vSales = getValue("매출액", col);
    const vCogs = getValue("매출원가계", col);
    const vSga = getValue("판매비와일반관리비", col);
    const vGross = getValue("매출총이익", col);
    const vOp = getValue("영업이익", col);
    const vNonOpInc = getValue("영업외수익", col);
    const vNonOpExp = getValue("영업외비용", col);
    const vNet = getValue("당기순이익", col);

    const steps = [
      { key: "매출액", label: "매출", value: vSales, kind: "base" },
      { key: "매출원가계", label: "원가", value: -Math.abs(vCogs), kind: "delta" },
      { key: "매출총이익", label: "매출총이익", value: vGross, kind: "total" },
      { key: "판매비와일반관리비", label: "판관비", value: -Math.abs(vSga), kind: "delta" },
      { key: "영업이익", label: "영업이익", value: vOp, kind: "total" },
      { key: "영업외수익", label: "영업외수익", value: Math.abs(vNonOpInc), kind: "delta" },
      { key: "영업외비용", label: "영업외비용", value: -Math.abs(vNonOpExp), kind: "delta" },
      { key: "당기순이익", label: "순이익", value: vNet, kind: "total" },
    ];

    let cum = 0;
    const points = steps.map((s, idx) => {
      if (idx === 0) {
        cum = s.value;
        return { ...s, from: 0, to: cum };
      }
      if (s.kind === "delta") {
        const from = cum;
        cum = cum + s.value;
        return { ...s, from, to: cum };
      }
      const from = 0;
      cum = s.value;
      return { ...s, from, to: cum };
    });

    const maxAbs = Math.max(
      ...points.map((p) => Math.max(Math.abs(p.from), Math.abs(p.to))),
      1
    );

    const wrapRef = useRef(null);
    const [wrapW, setWrapW] = useState(0);

    useEffect(() => {
      if (!wrapRef.current) return;
      const el = wrapRef.current;

      const ro = new ResizeObserver((entries) => {
        const w = entries?.[0]?.contentRect?.width || 0;
        setWrapW(w);
      });

      ro.observe(el);
      return () => ro.disconnect();
    }, []);

    const pad = 18;
    const labelH = 40;
    const h = height;

    // ✅ (수정) 워터폴이 한 눈에 보이도록 bar 폭/슬롯 폭을 더 타이트하게
    const minPer = 92;
    const maxPer = 155;

    const effectiveW = Math.max(0, wrapW || 0);
    const usableW = Math.max(1, effectiveW - pad * 2);
    const autoPer = usableW / points.length;
    const per = Math.max(minPer, Math.min(maxPer, autoPer));

    const needScroll = pad * 2 + points.length * per > effectiveW + 1;
    const w = pad * 2 + points.length * per;

    const chartH = h - pad * 2 - labelH;
    const topY = pad;
    const bottomY = pad + chartH;

    const zeroY = topY + chartH * 0.68;

    const scaleUp = (zeroY - topY) / maxAbs;
    const scaleDown = (bottomY - zeroY) / maxAbs;
    const scale = Math.min(scaleUp, scaleDown);

    const gap = Math.max(12, Math.min(20, per * 0.16));
    const barW = Math.max(54, per - gap);

    const yOf = (v) => zeroY - v * scale;

    const toneFor = (p) => {
      if (p.kind === "total") return p.to >= 0 ? "#16a34a" : "#b91c1c";
      return p.value >= 0 ? "#2563eb" : "#e11d48";
    };

    return (
      <div
        ref={wrapRef}
        style={{
          width: "100%",
          overflowX: needScroll ? "auto" : "hidden",
          paddingBottom: 2,
        }}
      >
        <svg
          width={needScroll ? w : "100%"}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          style={{ display: "block" }}
        >
          <rect
            x="0"
            y="0"
            width={w}
            height={h}
            rx={UI.radius2}
            fill="#fff"
            stroke="#e2e8f0"
          />

          {[0, 0.25, 0.5, 0.75, 1].map((k) => {
            const yy = topY + k * chartH;
            return (
              <line
                key={k}
                x1={pad}
                y1={yy}
                x2={w - pad}
                y2={yy}
                stroke="#e2e8f0"
                strokeWidth="1"
              />
            );
          })}
          <line
            x1={pad}
            y1={zeroY}
            x2={w - pad}
            y2={zeroY}
            stroke="#94a3b8"
            strokeWidth="1"
          />

          {points.map((p, i) => {
            const slotX = pad + i * per;
            const x = slotX + gap / 2;

            const y1 = yOf(p.from);
            const y2 = yOf(p.to);
            const top = Math.min(y1, y2);
            const barH = Math.max(12, Math.abs(y2 - y1));
            const color = toneFor(p);

            const prev = points[i - 1];
            const prevX = pad + (i - 1) * per + gap / 2 + barW;
            const prevY = prev ? yOf(prev.to) : zeroY;

            return (
              <g key={p.key}>
                {i > 0 && (
                  <line
                    x1={prevX}
                    y1={prevY}
                    x2={x}
                    y2={y1}
                    stroke="#cbd5e1"
                    strokeWidth="2"
                    strokeDasharray={p.kind === "total" ? "4 4" : "0"}
                  />
                )}
                <rect
                  x={x}
                  y={top}
                  width={barW}
                  height={barH}
                  rx={UI.radius2}
                  fill={color}
                  opacity="0.92"
                />
                <text
                  x={x + barW / 2}
                  y={top - 12}
                  textAnchor="middle"
                  fontSize="13"
                  fontWeight="900"
                  fill="#0f172a"
                >
                  {formatSigned(p.kind === "delta" ? p.value : p.to)}
                </text>
                <text
                  x={x + barW / 2}
                  y={h - 14}
                  textAnchor="middle"
                  fontSize="13"
                  fontWeight="900"
                  fill="#475569"
                >
                  {p.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    );
  };

  const SegmentedBar = ({ items, getColor, height = 14 }) => {
    const safeItems = (items || []).filter((it) => (Number(it.share) || 0) > 0);
    if (safeItems.length === 0)
      return (
        <div style={{ height, border: UI.border, background: "#f1f5f9" }} />
      );

    let sum = safeItems.reduce((s, it) => s + (Number(it.share) || 0), 0);
    if (!sum) sum = 1;

    return (
      <div
        style={{
          height,
          background: "#f1f5f9",
          overflow: "hidden",
          display: "flex",
          border: UI.border,
        }}
      >
        {safeItems.map((it) => {
          const pct = (Number(it.share) || 0) / sum;
          const widthPct = Math.max(pct * 100, 0);
          return (
            <div
              key={it.col || it.code || it.name}
              title={`${it.label || it.name} (${(Number(it.share) || 0).toFixed(
                1
              )}%)`}
              style={{
                width: `${widthPct}%`,
                minWidth: 2,
                background: getColor(it),
              }}
            />
          );
        })}
      </div>
    );
  };

  const MiniSelect = ({ value, onChange, options }) => (
    <select
      value={value}
      onChange={onChange}
      style={{
        fontSize: 12,
        padding: "7px 10px",
        borderRadius: UI.radius2,
        border: UI.border,
        color: UI.text,
        background: "#fff",
        maxWidth: 320,
        fontWeight: 900,
        outline: "none",
      }}
    >
      {options}
    </select>
  );

  const Bar = ({ pct, color }) => (
    <div
      style={{
        border: UI.border,
        background: "#f1f5f9",
        height: 10,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${Math.max(0, Math.min(100, pct))}%`,
          height: "100%",
          background: color,
        }}
      />
    </div>
  );

  const DivergingBar = ({ pct, maxAbs, color, height = 10 }) => {
    const p = Number(pct) || 0;
    const m = Math.max(1e-6, Number(maxAbs) || 1);
    const w = Math.min(1, Math.abs(p) / m) * 50;
    const isNeg = p < 0;

    return (
      <div
        style={{
          position: "relative",
          border: UI.border,
          background: "#f1f5f9",
          height,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            bottom: 0,
            width: 1,
            background: "#94a3b8",
            opacity: 0.8,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: isNeg ? `calc(50% - ${w}%)` : "50%",
            width: `${w}%`,
            background: color,
          }}
        />
      </div>
    );
  };

  const RankTop10Card = ({ title, data }) => {
    const items = data?.items || [];
    const total = data?.total || 0;

    return (
      <div
        style={{
          width: "100%",
          minWidth: 0,
          border: UI.border,
          background: "#fff",
          padding: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "baseline",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 950, color: UI.text }}>
            {title} Top 10
          </div>
          <div
            style={{
              fontSize: 12,
              color: UI.mute,
              whiteSpace: "nowrap",
              fontWeight: 900,
            }}
          >
            합계 {formatNumber(total)}
          </div>
        </div>

        {items.length === 0 ? (
          <div style={{ fontSize: 12, color: UI.mute, marginTop: 10 }}>
            데이터가 없습니다.
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              marginTop: 12,
            }}
          >
            {items.map((it, idx) => {
              const color = getCodeColor(it.code);
              const widthPct = Math.min(Math.abs(it.share), 100);
              return (
                <div
                  key={it.col}
                  style={{ display: "flex", flexDirection: "column", gap: 6 }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      fontSize: 12,
                      color: UI.sub,
                    }}
                  >
                    <span
                      style={{
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 950,
                          color: UI.text,
                          marginRight: 6,
                        }}
                      >
                        {idx + 1}.
                      </span>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          minWidth: 0,
                        }}
                      >
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            background: color,
                            display: "inline-block",
                          }}
                        />
                        <span
                          style={{
                            minWidth: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {it.label}{" "}
                          <span style={{ color: UI.mute }}>({it.code})</span>
                        </span>
                      </span>
                    </span>
                    <span
                      style={{
                        whiteSpace: "nowrap",
                        fontWeight: 950,
                        color: UI.text,
                      }}
                    >
                      {formatNumber(it.value)}{" "}
                      <span style={{ color: UI.mute, fontWeight: 900 }}>
                        ({it.share.toFixed(1)}%)
                      </span>
                    </span>
                  </div>

                  <Bar pct={widthPct} color={color} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const ConditionSegmentWithList = ({ title, data, note = null }) => {
    const items = data?.items || [];
    const total = data?.total || 0;

    return (
      <div
        style={{
          width: "100%",
          minWidth: 0,
          border: UI.border,
          background: "#fff",
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            alignItems: "baseline",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              minWidth: 0,
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 950,
                color: UI.text,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {title} Top 10
            </div>
            {note && (
              <div style={{ fontSize: 11, color: UI.mute, fontWeight: 900 }}>
                {note}
              </div>
            )}
          </div>
          <div
            style={{
              fontSize: 12,
              color: UI.mute,
              whiteSpace: "nowrap",
              fontWeight: 900,
            }}
          >
            합계 {formatNumber(total)}
          </div>
        </div>

        {items.length === 0 ? (
          <div style={{ fontSize: 12, color: UI.mute }}>데이터가 없습니다.</div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 12, color: UI.mute, fontWeight: 900 }}>
                Top10 구성 비중(누적)
              </div>
              <SegmentedBar
                items={items}
                getColor={(it) => getCodeColor(it.code)}
                height={14}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 12, color: UI.mute, fontWeight: 900 }}>
                Top 10 상세
              </div>
              {items.map((it) => {
                const color = getCodeColor(it.code);
                const widthPct = Math.min(Math.abs(it.share), 100);

                return (
                  <div
                    key={it.col}
                    style={{ display: "flex", flexDirection: "column", gap: 6 }}
                  >
                    <LabelRow
                      left={
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            minWidth: 0,
                          }}
                        >
                          <span
                            style={{
                              width: 10,
                              height: 10,
                              background: color,
                              display: "inline-block",
                            }}
                          />
                          <span
                            style={{
                              minWidth: 0,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {it.label}{" "}
                            <span style={{ color: UI.mute }}>({it.code})</span>
                          </span>
                        </span>
                      }
                      right={
                        <>
                          {formatNumber(it.value)}{" "}
                          <span style={{ color: UI.mute, fontWeight: 900 }}>
                            ({it.share.toFixed(1)}%)
                          </span>
                        </>
                      }
                    />
                    <Bar pct={widthPct} color={color} />
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  };

  const getSalesForCol = (colName) => getValue("매출액", colName) || 0;

  const withSalesShare = (detailGroup, baseSalesCol) => {
    const baseSales = Math.abs(getSalesForCol(baseSalesCol)) || 1;
    const items = (detailGroup?.items || []).map((it) => {
      const shareSales = (Number(it.value) / baseSales) * 100;
      return {
        ...it,
        shareSales,
        shareSalesAbs: Math.max(0, Math.min(Math.abs(shareSales), 100)),
      };
    });
    return { ...detailGroup, items };
  };

  const TotalSalesDetailSegment = ({
    title,
    totalValue,
    items,
    showSegment = false,
  }) => {
    const safeItems = items || [];
    return (
      <div
        style={{
          width: "100%",
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 10,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 950, color: UI.text }}>
            {title}
          </div>
          <div
            style={{
              fontSize: 12,
              color: UI.mute,
              whiteSpace: "nowrap",
              fontWeight: 900,
            }}
          >
            세부합계 {formatNumber(totalValue)}
          </div>
        </div>

        {safeItems.length === 0 ? (
          <div style={{ fontSize: 12, color: UI.mute }}>
            {title} 세부 항목 데이터가 없습니다.
          </div>
        ) : (
          <>
            {showSegment && (
              <SegmentedBar
                items={safeItems.map((it) => ({
                  ...it,
                  col: it.name,
                  share: Number(it.shareSales ?? it.share) || 0,
                }))}
                getColor={() => "#94a3b8"}
                height={14}
              />
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {safeItems.map((it) => {
                const pct = Number(it.shareSales ?? 0) || 0;
                const pctAbs = Math.max(0, Math.min(Math.abs(pct), 100));
                return (
                  <div
                    key={it.name}
                    style={{ display: "flex", flexDirection: "column", gap: 6 }}
                  >
                    <LabelRow
                      left={it.name}
                      right={
                        <>
                          {formatNumber(it.value)}{" "}
                          <span style={{ color: UI.mute, fontWeight: 900 }}>
                            (매출액 대비 {pct.toFixed(1)}%)
                          </span>
                        </>
                      }
                    />
                    <Bar pct={pctAbs} color={getShareColor(Math.abs(pct))} />
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  };

  const SalesMixPie = ({ totalSales, domValue, expValue, size = 210 }) => {
    const total = Math.max(0, Number(totalSales) || 0);
    const dom = Math.max(0, Number(domValue) || 0);
    const exp = Math.max(0, Number(expValue) || 0);
    const etc = Math.max(0, total - dom - exp);

    const sum = total || 1;

    const domPct2 = (dom / sum) * 100;
    const expPct2 = (exp / sum) * 100;
    const etcPct2 = (etc / sum) * 100;

    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 8;

    const polar = (angleDeg) => {
      const a = (Math.PI / 180) * angleDeg;
      return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
    };

    const arcPath = (startDeg, endDeg) => {
      const s = polar(startDeg);
      const e = polar(endDeg);
      const large = endDeg - startDeg > 180 ? 1 : 0;
      return `M ${cx} ${cy} L ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y} Z`;
    };

    const start = -90;
    const domEnd = start + (domPct2 / 100) * 360;
    const expEnd = domEnd + (expPct2 / 100) * 360;
    const etcEnd = start + 360;

    const centerText = formatNumber(total);
    const len = String(centerText).length;
    const centerFont = len >= 12 ? 12 : len >= 10 ? 13 : 14;

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          alignItems: "center",
        }}
      >
        <svg width={size} height={size} style={{ display: "block" }}>
          <circle cx={cx} cy={cy} r={r} fill="#f1f5f9" stroke="#e2e8f0" />
          {domPct2 > 0 && (
            <path d={arcPath(start, domEnd)} fill="#3b82f6" opacity="0.95" />
          )}
          {expPct2 > 0 && (
            <path d={arcPath(domEnd, expEnd)} fill="#10b981" opacity="0.95" />
          )}
          {etcPct2 > 0 && (
            <path d={arcPath(expEnd, etcEnd)} fill="#94a3b8" opacity="0.9" />
          )}

          <circle
            cx={cx}
            cy={cy}
            r={r * 0.58}
            fill="#ffffff"
            stroke="#e2e8f0"
          />
          <text
            x={cx}
            y={cy - 4}
            textAnchor="middle"
            fontSize={centerFont}
            fontWeight="950"
            fill="#0f172a"
          >
            {centerText}
          </text>
          <text
            x={cx}
            y={cy + 14}
            textAnchor="middle"
            fontSize="11"
            fontWeight="900"
            fill="#64748b"
          >
            전체 매출액
          </text>
        </svg>

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <Pill text={`국내 ${domPct2.toFixed(1)}%`} tone="blue" />
          <Pill text={`수출 ${expPct2.toFixed(1)}%`} tone="green" />
          <Pill text={`기타 ${etcPct2.toFixed(1)}%`} tone="slate" />
        </div>

        <div
          style={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {[
            { k: "dom", label: "국내매출", color: "#3b82f6", v: dom, p: domPct2 },
            { k: "exp", label: "수출매출", color: "#10b981", v: exp, p: expPct2 },
            { k: "etc", label: "기타", color: "#94a3b8", v: etc, p: etcPct2 },
          ].map((it) => (
            <div
              key={it.k}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                fontSize: 12,
                width: "100%",
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  color: UI.sub,
                  fontWeight: 900,
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    background: it.color,
                    display: "inline-block",
                  }}
                />
                {it.label}{" "}
                <span style={{ color: UI.mute, fontWeight: 900 }}>
                  {it.p.toFixed(1)}%
                </span>
              </span>
              <span style={{ color: UI.text, fontWeight: 950 }}>
                {formatNumber(it.v)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const exportFilename = useMemo(() => {
    const ym =
      selectedYear && selectedMonth
        ? `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`
        : "NA";
    const cond = effectiveCond === "전체" ? "전체" : `${effectiveCond}`;
    return `PL_Graph_Report_${ym}_${cond}.pdf`;
  }, [selectedYear, selectedMonth, effectiveCond]);

  const cogsDetailTop10_salesShare = useMemo(
    () => withSalesShare(cogsDetailTop10, detailCol41),
    [cogsDetailTop10, detailCol41]
  ); // eslint-disable-line
  const sgaDetailTop10_salesShare = useMemo(
    () => withSalesShare(sgaDetailTop10, detailCol42),
    [sgaDetailTop10, detailCol42]
  ); // eslint-disable-line
  const nonOpIncomeDetailTop10_salesShare = useMemo(
    () => withSalesShare(nonOpIncomeDetailTop10, detailCol43),
    [nonOpIncomeDetailTop10, detailCol43]
  ); // eslint-disable-line
  const nonOpExpenseDetailTop10_salesShare = useMemo(
    () => withSalesShare(nonOpExpenseDetailTop10, detailCol44),
    [nonOpExpenseDetailTop10, detailCol44]
  ); // eslint-disable-line

  const domesticDetail_salesShare = useMemo(
    () =>
      withSalesShare(
        { ...domesticDetail, items: domesticItemsFiltered },
        summaryColName
      ),
    [domesticDetail, summaryColName]
  ); // eslint-disable-line
  const exportDetail_salesShare = useMemo(
    () =>
      withSalesShare(
        { ...exportDetail, items: exportItemsFiltered },
        summaryColName
      ),
    [exportDetail, summaryColName]
  ); // eslint-disable-line

  const condWaterfallCol = useMemo(
    () => getDetailCol(detailPickAll),
    [effectiveCond, detailPickAll]
  ); // eslint-disable-line

  const shouldShowDetailPicker = effectiveCond !== "전체";

  const DetailPickerBar = ({ compact = false }) => {
    if (!shouldShowDetailPicker) return null;

    return (
      <div
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 10,
          flexWrap: "wrap",
          padding: compact ? "10px 12px" : "0px",
          border: compact ? UI.border : "none",
          background: compact ? "#fff" : "transparent",
          borderRadius: compact ? UI.radius2 : 0,
        }}
      >
        <div
          style={{
            fontSize: 12,
            color: UI.mute,
            fontWeight: 900,
            whiteSpace: "nowrap",
          }}
        >
          세부조건 선택
        </div>
        <MiniSelect
          value={detailPickAll}
          onChange={(e) => setDetailPickAll(e.target.value)}
          options={
            <>
              <option value="전체">세부조건: 전체(조건_전체)</option>
              {conditionDetailCodes.map((o) => (
                <option key={o.code} value={o.code}>
                  세부조건: {o.label}
                </option>
              ))}
            </>
          }
        />
      </div>
    );
  };

  const BridgeInsightPanel = ({ colNameOverride = null }) => {
    const col = colNameOverride || summaryColName;

    const sales = getValue("매출액", col);
    const grossV = getValue("매출총이익", col);
    const opV = getValue("영업이익", col);
    const netV = getValue("당기순이익", col);

    const sSafe = sales || 1;

    const salesR = (sales / sSafe) * 100;
    const grossR = (grossV / sSafe) * 100;
    const opR = (opV / sSafe) * 100;
    const netR = (netV / sSafe) * 100;

    const gm = grossR;
    const opm = opR;
    const npm = netR;

    const cogsV = getValue("매출원가계", col);
    const sgaV = getValue("판매비와일반관리비", col);
    const opCostV = (Number(cogsV) || 0) + (Number(sgaV) || 0);
    const opCostR = (opCostV / sSafe) * 100;

    const nonInc = getValue("영업외수익", col);
    const nonExp = getValue("영업외비용", col);
    const nonNet = -(Number(nonInc) || 0) - (Number(nonExp) || 0);
    const nonNetR = (nonNet / sSafe) * 100;

    const badgeTone = (v) => (v >= 0 ? "green" : "red");

    const InsightRow = ({ left, cur, ratioText }) => {
      return (
        <div style={{ padding: "6px 0" }}>
          <LabelRow
            left={left}
            right={
              <span style={{ fontWeight: 950 }}>
                {formatNumber(cur)}
                {ratioText ? (
                  <span style={{ color: UI.mute, fontWeight: 900 }}>
                    {" "}
                    · {ratioText}
                  </span>
                ) : null}
              </span>
            }
          />
        </div>
      );
    };

    return (
      <div
        style={{
          width: "100%",
          minWidth: 0,
          border: UI.border,
          background: "#fff",
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            alignItems: "baseline",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 950, color: UI.text }}>
            요약 인사이트
          </div>
          <div
            style={{
              fontSize: 12,
              color: UI.mute,
              fontWeight: 900,
              whiteSpace: "nowrap",
            }}
          >
            단위: 원 / %
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <InsightRow
            left="매출액"
            cur={sales}
            ratioText={`(매출 대비 ${formatRate(salesR)})`}
          />
          <InsightRow
            left="매출총이익"
            cur={grossV}
            ratioText={`(매출 대비 ${formatRate(grossR)})`}
          />
          <InsightRow
            left="영업이익"
            cur={opV}
            ratioText={`(매출 대비 ${formatRate(opR)})`}
          />
          <InsightRow
            left="당기순이익"
            cur={netV}
            ratioText={`(매출 대비 ${formatRate(netR)})`}
          />
        </div>

        <div
          style={{
            borderTop: UI.border,
            paddingTop: 10,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ padding: "6px 0" }}>
            <LabelRow
              left="매출총이익률(GM)"
              right={<Pill text={formatRate(gm)} tone={gm >= 0 ? "blue" : "red"} />}
            />
          </div>
          <div style={{ padding: "6px 0" }}>
            <LabelRow
              left="영업이익률(OPM)"
              right={<Pill text={formatRate(opm)} tone={opm >= 0 ? "blue" : "red"} />}
            />
          </div>
          <div style={{ padding: "6px 0" }}>
            <LabelRow
              left="순이익률(NPM)"
              right={<Pill text={formatRate(npm)} tone={npm >= 0 ? "blue" : "red"} />}
            />
          </div>
          <div style={{ padding: "6px 0" }}>
            <LabelRow
              left="영업비용률(원가+판관비)"
              right={<Pill text={formatRate(opCostR)} tone={"red"} />}
            />
          </div>
        </div>

        <div
          style={{
            borderTop: UI.border,
            paddingTop: 10,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ fontSize: 12, color: UI.mute, fontWeight: 900 }}>
            영업외손익 영향
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              alignItems: "center",
            }}
          >
            <div style={{ fontSize: 12, color: UI.sub, fontWeight: 900 }}>
              영업외손익
            </div>
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                flexWrap: "wrap",
                justifyContent: "flex-end",
              }}
            >
              <Pill text={formatSigned(nonNet)} tone={badgeTone(nonNet)} />
              <span style={{ fontSize: 12, color: UI.mute, fontWeight: 900 }}>
                매출 대비 {formatRate(nonNetR)}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // ✅ (수정) 워터폴 오른쪽 요약 인사이트 폭 축소 → 왼쪽 그래프가 한 눈에 보이게
  const WaterfallWithInsight = ({ colNameOverride = null }) => {
    return (
      <div
        style={{
          width: "100%",
          display: "grid",
          gridTemplateColumns: "minmax(680px, 2.6fr) minmax(240px, 0.85fr)",
          gap: 12,
          alignItems: "stretch",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <WaterfallPL height={460} colNameOverride={colNameOverride} />
        </div>
        <BridgeInsightPanel colNameOverride={colNameOverride} />
      </div>
    );
  };

  // -----------------------------
  // 렌더
  // -----------------------------
  return !hasData ? (
    <div
      style={{
        padding: "16px 0 4px",
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
      }}
    >
      <p>그래프로 시각화할 데이터가 없습니다.</p>
    </div>
  ) : (
    <div style={{ width: "100%", maxWidth: "100%", boxSizing: "border-box" }}>
      {/* ✅ 상단 헤더 (수정: 좌측 'YYYY년 MM월' 날짜 칸 완전 제거) */}
      {showCondBar && (
        <div
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 10,
            padding: "10px 12px",
            border: UI.border,
            borderRadius: UI.radius2,
            background: "#fff",
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              justifyContent: "flex-end",
              alignItems: "center",
              width: "100%",
            }}
          >
            <button
              style={exportBtn}
              onClick={() => exportToPDF(exportRef.current, exportFilename)}
              title="현재 시각화 화면을 PDF로 저장"
            >
              ⬇ EXPORT
            </button>

            {shouldShowDetailPicker && (
              <MiniSelect
                value={detailPickAll}
                onChange={(e) => setDetailPickAll(e.target.value)}
                options={
                  <>
                    <option value="전체">세부조건: 전체(조건_전체)</option>
                    {conditionDetailCodes.map((o) => (
                      <option key={o.code} value={o.code}>
                        세부조건: {o.label}
                      </option>
                    ))}
                  </>
                }
              />
            )}

            {CONDITION_KEYS.map((c) => {
              const active = c === effectiveCond;
              return (
                <button
                  key={c}
                  style={{ ...condBtnBase, ...(active ? condBtnActive : {}) }}
                  onClick={() => onCondClick(c)}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>
      )}


      {/* ✅ EXPORT 대상: “시각화 영역만” */}
      <div
        ref={exportRef}
        style={{
          padding: "12px",
          width: "100%",
          maxWidth: "100%",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          background: UI.page,
          border: UI.border,
          borderRadius: UI.radius2,
        }}
      >
        {!showCondBar && shouldShowDetailPicker && <DetailPickerBar compact />}

        <GridRow min={300} gap={12}>
          <Card
            kicker="Revenue"
            title="당월 매출액"
            right={
              <div
                style={{
                  display: "flex",
                  gap: 6,
                  flexWrap: "wrap",
                  justifyContent: "flex-end",
                }}
              >
                <Pill text={`국내 ${domesticPct.toFixed(1)}%`} tone="blue" />
                <Pill text={`수출 ${exportPct.toFixed(1)}%`} tone="green" />
              </div>
            }
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 950,
                    color: UI.text,
                    lineHeight: 1.1,
                  }}
                >
                  {formatNumber(totalSalesAll)} 원
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 12,
                    flexWrap: "wrap",
                    justifyContent: "flex-end",
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      color: UI.sub,
                      fontWeight: 950,
                      whiteSpace: "nowrap",
                    }}
                  >
                    국내 {formatNumber(domesticSales)}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: UI.sub,
                      fontWeight: 950,
                      whiteSpace: "nowrap",
                    }}
                  >
                    수출 {formatNumber(exportSales)}
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Card
            kicker="Operating"
            title="영업이익"
            right={
              <Pill
                text={`OPM ${formatRate(operatingMargin)}`}
                tone={operatingMargin >= 0 ? "blue" : "red"}
              />
            }
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                minHeight: 72,
                justifyContent: "flex-start",
              }}
            >
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 950,
                  color: operatingIncome >= 0 ? Tone.green.fg : Tone.red.fg,
                }}
              >
                {formatNumber(operatingIncome)} 원
              </div>
            </div>
          </Card>

          <Card
            kicker="Net"
            title="당기순이익"
            right={
              <Pill
                text={`NPM ${formatRate(netMargin)}`}
                tone={netMargin >= 0 ? "blue" : "red"}
              />
            }
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                minHeight: 72,
                justifyContent: "flex-start",
              }}
            >
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 950,
                  color: netIncome >= 0 ? Tone.green.fg : Tone.red.fg,
                }}
              >
                {formatNumber(netIncome)} 원
              </div>
            </div>
          </Card>

          <Card
            kicker="Cost"
            title="영업비용 (원가+판관비)"
            right={
              <Pill
                text={`영업비용률 ${formatRate(operatingCostRatio)}`}
                tone={"red"}
              />
            }
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                minHeight: 72,
                justifyContent: "flex-start",
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 950, color: Tone.red.fg }}>
                {formatNumber(operatingCost)} 원
              </div>

                {/* ✅ (수정) 원가/판관비 글자색·크기: 국내/수출 매출액과 동일하게 */}
                <div style={{ fontSize: 12, color: UI.sub, fontWeight: 950 }}>
                  <span>원가{" "}{formatNumber(cogs)}</span>
                  <span style={{ marginLeft: 10 }}>판관비{" "}{formatNumber(sga)}</span>
                </div>
            </div>
          </Card>
        </GridRow>

        {effectiveCond === "전체" && (
          <>
            <Card kicker="Ratios" title="대표 경영지표 — 매출 대비 비율">
              <div
                style={{
                  width: "100%",
                  display: "grid",
                  gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
                  gap: 18,
                  alignItems: "start",
                }}
              >
                {ratioItems.map((it) => {
                  const ratioText = `${it.ratio.toFixed(1)}%`;
                  return (
                    <Donut
                      key={it.key}
                      ratioAbs={it.ratioAbs}
                      label={it.label}
                      sub={it.sub}
                      ratioText={ratioText}
                      formula={it.formula}
                      color={it.color}
                    />
                  );
                })}
              </div>
            </Card>

            <Card kicker="Bridge" title="손익 워터폴 — 매출 → 원가/판관비 → 순이익">
              <WaterfallWithInsight colNameOverride={summaryColName} />
            </Card>

            <Card kicker="Sales Mix" title="매출 구조 — 전체 매출액 대비 비중 & 세부 구성">
              <div
                style={{
                  width: "100%",
                  display: "grid",
                  gridTemplateColumns:
                    "minmax(260px, 0.95fr) minmax(420px, 1.55fr) minmax(420px, 1.55fr)",
                  gap: 12,
                  alignItems: "start",
                }}
              >
                <div style={{ border: UI.border, background: "#fff", padding: 12 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 950,
                      color: UI.text,
                      marginBottom: 10,
                    }}
                  >
                    매출 비중 (Pie · 전체 매출액 대비)
                  </div>
                  <SalesMixPie
                    totalSales={totalSalesAll}
                    domValue={domesticSales}
                    expValue={exportSales}
                  />
                </div>

                <div style={{ border: UI.border, background: "#fff", padding: 12 }}>
                  <TotalSalesDetailSegment
                    title="국내매출 세부 항목"
                    totalValue={domesticDetail.total}
                    items={domesticDetail_salesShare.items}
                    showSegment={false}
                  />
                </div>

                <div style={{ border: UI.border, background: "#fff", padding: 12 }}>
                  <TotalSalesDetailSegment
                    title="수출매출 세부 항목"
                    totalValue={exportDetail.total}
                    items={exportDetail_salesShare.items}
                    showSegment={false}
                  />
                </div>
              </div>
            </Card>
          </>
        )}

        {effectiveCond !== "전체" && (
          <Card
            kicker="Bridge"
            title={`조건별 손익 워터폴 — ${effectiveCond}`}
            right={
              <Pill
                text={`세부조건: ${detailPickAll === "전체" ? "전체" : detailPickAll}`}
                tone="slate"
              />
            }
          >
            <WaterfallWithInsight colNameOverride={condWaterfallCol} />
          </Card>
        )}

        {/* ✅ (수정) 조건별 손익 Top10: KPI별 4개/줄 → 총 2줄에 한꺼번에 */}
        {effectiveCond !== "전체" && (
          <Card
            kicker="Segment"
            title={`조건별 손익 KPI Top 10 — ${effectiveCond}`}
            right={<Pill text="코드별 기여도" tone="blue" />}
          >
            <div style={{ width: "100%", overflowX: "hidden" }}>
              <div
                style={{
                  width: "100%",
                  display: "grid",
                  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                  gap: 10,
                  alignItems: "stretch",
                }}
              >
                {KPI_ORDER.map((kpi) => (
                  <RankTop10Card key={kpi} title={kpi} data={conditionKpiTop10?.[kpi]} />
                ))}
              </div>
            </div>
          </Card>
        )}

        {effectiveCond !== "전체" && (
          <Card
            kicker="Sales Mix"
            title={`조건별 국내/수출 매출 Top 10 — ${effectiveCond}`}
            right={<Pill text="Top10 누적 + 상세" tone="blue" />}
          >
            <GridRow min={520} gap={10}>
              <ConditionSegmentWithList
                title="국내매출액"
                data={conditionDomesticTop10}
                note="※ %는 매출액(조건_전체) 대비"
              />
              <ConditionSegmentWithList
                title="수출매출액"
                data={conditionExportTop10}
                note="※ %는 매출액(조건_전체) 대비"
              />
            </GridRow>
          </Card>
        )}

        <FourColRow gap={12}>
          {[
            {
              kicker: "Cost Driver",
              title: "4-1. 매출원가 세부 항목 Top 10",
              data: cogsDetailTop10_salesShare,
              emptyMsg: '"매출원가계" 하위 세부 항목 데이터가 없습니다.',
              mode: "normal",
            },
            {
              kicker: "SG&A Driver",
              title: "4-2. 판관비 세부 항목 Top 10",
              data: sgaDetailTop10_salesShare,
              emptyMsg: "판관비 관련 세부 항목 데이터가 없습니다.",
              mode: "normal",
            },
            {
              kicker: "Non-Op Income",
              title: "4-3. 영업외수익 세부 항목 Top 10",
              data: nonOpIncomeDetailTop10_salesShare,
              emptyMsg: "영업외수익 관련 세부 항목 데이터가 없습니다.",
              mode: "diverging",
            },
            {
              kicker: "Non-Op Expense",
              title: "4-4. 영업외비용 세부 항목 Top 10",
              data: nonOpExpenseDetailTop10_salesShare,
              emptyMsg: "영업외비용 관련 세부 항목 데이터가 없습니다.",
              mode: "diverging",
            },
          ].map((cfg, idx) => (
            <Card
              key={idx}
              kicker={cfg.kicker}
              title={cfg.title}
              right={
                effectiveCond !== "전체" ? (
                  <Pill
                    text={`세부조건: ${detailPickAll === "전체" ? "전체" : detailPickAll}`}
                    tone="slate"
                  />
                ) : (
                  <Pill text="OVERALL" tone="blue" />
                )
              }
            >
              {(cfg.data?.items || []).length === 0 ? (
                <div style={{ fontSize: 12, color: UI.mute }}>{cfg.emptyMsg}</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {(() => {
                    const items = cfg.data.items || [];
                    const maxAbs =
                      cfg.mode === "diverging"
                        ? Math.max(...items.map((it) => Math.abs(Number(it.share) || 0)), 1)
                        : 1;

                    return (
                      <>
                        {items.map((it) => {
                          const parentPct = Number(it.share) || 0;
                          const salesPct = Number(it.shareSales) || 0;

                          return (
                            <div
                              key={it.name}
                              style={{ display: "flex", flexDirection: "column", gap: 6 }}
                            >
                              <LabelRow
                                left={it.name}
                                right={
                                  <>
                                    {formatNumber(it.value)}{" "}
                                    <span style={{ color: UI.sub, fontWeight: 950 }}>
                                      (매출액 대비 {salesPct.toFixed(1)}%)
                                    </span>
                                  </>
                                }
                              />

                              {cfg.mode === "diverging" ? (
                                <DivergingBar
                                  pct={parentPct}
                                  maxAbs={maxAbs}
                                  color={getDivergingColor(parentPct)}
                                />
                              ) : (
                                <Bar
                                  pct={Math.min(Math.abs(parentPct), 100)}
                                  color={getShareColor(Math.abs(parentPct))}
                                />
                              )}
                            </div>
                          );
                        })}
                      </>
                    );
                  })()}
                </div>
              )}
            </Card>
          ))}
        </FourColRow>
      </div>
    </div>
  );
}

export default PlReportGraphTab;
