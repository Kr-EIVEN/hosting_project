// front/coProject-main/sapcoproject/src/components/tabs/PlReportTab.js

import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx"; // ✅ 엑셀 Export용 추가
import PlReportGraphTab from "./PlReportGraphTab";

const CONDITION_KEYS = [
  "전체",
  "플랜트",
  "대표차종",
  "유통경로",
  "판매문서유형",
  "기타매출유형",
  "레코드유형",
  "평가클래스",
  "Prod.계층구조01-2",
  "손익센터",
];

// 🔹 노란색(주요 경영지표: 행 하이라이트용)
const HIGHLIGHT_YELLOW_ITEMS = new Set([
  "매출액",
  "매출원가계",
  "매출총이익",
  "판매비와일반관리비",
  "영업이익",
  "영업외수익",
  "영업외비용",
  "법인세차감전순이익",
  "당기순이익",
]);

// 🔹 요약 카드에 보여줄 대표 경영지표(순서 포함)
const KPI_ITEMS = [
  "매출액",
  "매출원가계",
  "매출총이익",
  "판매비와일반관리비",
  "영업이익",
  "영업외수익",
  "영업외비용",
  "법인세차감전순이익",
  "당기순이익",
];

// 🔹 요약 카드에서 '핵심 KPI'로 상단 줄에 강조해서 보여줄 항목
const KPI_PRIMARY_ITEMS = new Set([
  "매출액",
  "매출총이익",
  "영업이익",
  "당기순이익",
]);

// 🔹 각 KPI 위(=항목 바로 아래)에 보여줄 계산식/설명 텍스트
const KPI_FORMULAS = {
  매출액: "Top line · 총매출",
  매출원가계: "매출원가 + 기타매출원가",
  매출총이익: "매출총이익 = 매출액 - 매출원가계",
  판매비와일반관리비: "판매·관리 인건비, 감가상각 등",
  영업이익: "영업이익 = 매출총이익 - 판관비",
  영업외수익: "이자수익·평가이익 등",
  영업외비용: "이자비용·평가손실 등",
  법인세차감전순이익: "영업이익 + 영업외수익 - 영업외비용",
  당기순이익: "당기순이익 = 법인세차감전순이익 - 법인세비용",
};

// 🔹 초록색(국내/수출 매출 및 매출원가: 행 하이라이트용)
const HIGHLIGHT_GREEN_ITEMS = new Set([
  "국내매출액",
  "수출매출액",
  "매출원가",
  "매출원가(기타)",
]);

/* ============================
 *  코드 → 내역 매핑 테이블들
 *  (컬럼명 표시용, 데이터/키는 그대로)
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

// 판매문서 유형 (긴 목록 그대로 매핑)
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
  BK1: "대변메모요청계약",
  BK3: "대변메모요청계약",
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
  DZL: "납품오더유형",
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
  RAF: "재고 문의",
  RAG: "재고 정보",
  RAS: "수리 / 서비스 1",
  RE: "반품",
  RE2: "고급 반품",
  RK: "송장 수정 요청",
  RM: "업체 반품 오더",
  RTTC: "고객에게 SPE 반품",
  RTTR: "SPE 반품 정비",
  RX2: "ARM 외부 수리 오더",
  RXE: "XLO 이전 오더",
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

// 각 조건명 → 해당 매핑 테이블
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
function PlReportTab({
  selectedYm,
  cardStyle = {
    backgroundColor: "#ffffff",
    borderRadius: 0,
    border: "1px solid #e5e7eb",
    boxShadow: "0 0 0 rgba(0,0,0,0.02)",
    padding: 14,
  },
}) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const [selectedCond, setSelectedCond] = useState("전체");

  // ✅ 표/그래프 보기 모드
  const [viewMode, setViewMode] = useState("table"); // "table" | "graph"

  const mainScrollRef = useRef(null);

  // =========================
  // ✅ Variance 스타일 계열(각진 카드)
  // =========================
  const panelStyle = {
    ...cardStyle,
    borderRadius: 0,
    border: "1px solid #E5E7EB",
    boxShadow: "0 4px 8px rgba(15,23,42,0.03)",
  };

  // ✅ 탭이 패널 위에 “꽂힌” 느낌(오버랩) 강화용
  // - paddingTop: 탭 높이만큼 살짝 공간
  // - overflow: visible: 탭이 바깥으로 올라오게
  const panelWithTabOverlapStyle = {
    ...panelStyle,
    position: "relative",
    paddingTop: 14,
    overflow: "visible",
  };

  const kpiPrimaryCardStyle = {
    ...panelStyle,
    padding: 12,
    backgroundColor: "#FFFBEB",
    border: "1px solid #FACC15",
  };

  const kpiCardStyle = {
    ...panelStyle,
    padding: 12,
    backgroundColor: "#ffffff",
  };

  // =========================
  // ✅ 탭 스타일 (조금 크게 + “꽂힘” 강화)
  // =========================
  const TAB_H = 34;
  const TAB_PAD_X = 15;
  const TAB_RADIUS = 2; // 각지게(라운드 줄임)
  const TAB_FONT = 12;

  const PANEL_BG = "#ffffff"; // 패널 상단 스트립과 “탭 바닥” 맞출 색

  // ✅ 탭 컬러를 항목별로 은은하게 (각각 다르게)
  const TAB_COLORS = {
    표: { on: "rgba(37,99,235,0.75)", off: "rgba(37,99,235,0.18)" },
    그래프: { on: "rgba(14,165,233,0.75)", off: "rgba(14,165,233,0.18)" },

    전체: { on: "rgba(16,185,129,0.70)", off: "rgba(16,185,129,0.16)" },
    플랜트: { on: "rgba(20,184,166,0.70)", off: "rgba(20,184,166,0.16)" },
    대표차종: { on: "rgba(59,130,246,0.70)", off: "rgba(59,130,246,0.16)" },
    유통경로: { on: "rgba(99,102,241,0.70)", off: "rgba(99,102,241,0.16)" },
    판매문서유형: { on: "rgba(124,58,237,0.70)", off: "rgba(124,58,237,0.16)" },
    기타매출유형: { on: "rgba(168,85,247,0.68)", off: "rgba(168,85,247,0.15)" },
    레코드유형: { on: "rgba(244,63,94,0.62)", off: "rgba(244,63,94,0.14)" },
    평가클래스: { on: "rgba(245,158,11,0.65)", off: "rgba(245,158,11,0.14)" },
    "Prod.계층구조01-2": {
      on: "rgba(34,197,94,0.66)",
      off: "rgba(34,197,94,0.14)",
    },
    손익센터: { on: "rgba(132,204,22,0.62)", off: "rgba(132,204,22,0.14)" },
  };

  function TopBarTab({ active, label, onClick }) {
    const c = TAB_COLORS[label] || {
      on: "rgba(148,163,184,0.75)",
      off: "rgba(148,163,184,0.22)",
    };

    const tabStyle = {
      position: "relative",
      height: TAB_H,
      padding: `0 ${TAB_PAD_X}px`,
      borderRadius: TAB_RADIUS,

      // ✅ 경계 얇게 + “꽂힘”을 위해 바닥선은 패널 배경색으로 소거
      border: "1px solid rgba(15, 23, 42, 0.14)",
      borderBottom: `1px solid ${PANEL_BG}`,

      background: active ? PANEL_BG : "rgba(15,23,42,0.03)",
      color: active ? "#111827" : "rgba(81,96,116,0.95)",
      fontSize: TAB_FONT,
      fontWeight: 900,
      cursor: "pointer",
      boxShadow: "none",

      // ✅ 탭이 패널에 꽂히는 느낌: 항상 살짝 내려앉힘
      transform: "translateY(2px)",
      transition: "all 120ms ease",

      display: "inline-flex",
      alignItems: "center",
      whiteSpace: "nowrap",
      overflow: "hidden",
      lineHeight: 1,
    };

    return (
      <button
        type="button"
        onClick={onClick}
        style={tabStyle}
        aria-pressed={active}
        title={label}
      >
        {/*탭 위 색깔*/}
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            height: 3, // ✅ 조금 더 두껍게(은은하지만 존재감)
            background: active ? c.on : c.off,
          }}
        />
        <span style={{ paddingTop: 1, marginLeft: -2 }}>{label}</span>
      </button>
    );
  }

  // -----------------------------
  // ✅ selectedYm("YYYY-MM") → year/month 파싱
  // -----------------------------
  const { selectedYear, selectedMonth, selectedYmLabel } = useMemo(() => {
    if (!selectedYm || typeof selectedYm !== "string") {
      return { selectedYear: null, selectedMonth: null, selectedYmLabel: "-" };
    }
    const parts = selectedYm.split("-");
    const y = Number(parts[0]);
    const m = Number(parts[1]);
    if (!y || !m) {
      return { selectedYear: null, selectedMonth: null, selectedYmLabel: "-" };
    }
    const label = `${y}-${String(m).padStart(2, "0")}`;
    return { selectedYear: y, selectedMonth: m, selectedYmLabel: label };
  }, [selectedYm]);

  // -----------------------------
  // 1) 선택된 연/월에 해당하는 리포트 조회
  // -----------------------------
  const fetchData = async (year, month) => {
    if (!year || !month) return;

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        year: String(year),
        month: String(month),
      }).toString();

      const res = await fetch(`/api/pl-report?${params}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg =
          data.error ||
          `PL Report 조회 중 오류가 발생했습니다. (HTTP ${res.status})`;
        throw new Error(msg);
      }
      const data = await res.json();
      setRows(data.rows || []);
    } catch (err) {
      console.error("PL report fetch error:", err);
      setError(err.message || "PL Report 조회에 실패했습니다.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedYear || !selectedMonth) return;
    fetchData(selectedYear, selectedMonth);
  }, [selectedYear, selectedMonth]);

  // ✅ 탭/조건 바뀌면 스크롤 상단으로
  useEffect(() => {
    if (mainScrollRef.current) {
      mainScrollRef.current.scrollTop = 0;
    }
  }, [viewMode, selectedCond]);

  const formatNumber = (v) => {
    if (v === null || v === undefined || v === "") return "-";
    const num = Number(v);
    if (Number.isNaN(num)) return String(v);
    return num.toLocaleString("ko-KR");
  };

  if (loading) return <p>불러오는 중...</p>;
  if (error && rows.length === 0)
    return <p style={{ color: "red" }}>{error}</p>;
  if (rows.length === 0) return <p>데이터가 없습니다.</p>;

  // ✅ 선택된 조건에 따라 컬럼 필터링 + "조건_전체"를 항목 바로 뒤로 이동
  const orderedColumns = (() => {
    const cols = Object.keys(rows[0]);
    const base = ["번호", "항목"];
    const others = cols.filter((c) => !base.includes(c));

    if (selectedCond === "전체") {
      const totalCols = others.filter(
        (c) => c === "전체" || c.startsWith("전체_")
      );
      return [...base, ...totalCols];
    }

    const prefix = selectedCond + "_";
    const filtered = others.filter((c) => c.startsWith(prefix));

    const totalCol = `${selectedCond}_전체`;
    const hasTotal = filtered.includes(totalCol);
    const withoutTotal = filtered.filter((c) => c !== totalCol);

    const orderedForCond = hasTotal
      ? [totalCol, ...withoutTotal]
      : withoutTotal;
    return [...base, ...orderedForCond];
  })();

  const summaryColName =
    selectedCond === "전체" ? "전체" : `${selectedCond}_전체`;

  const kpiSummary = KPI_ITEMS.map((name) => {
    const row = rows.find((r) => (r["항목"] || "").trim() === name) || null;
    const raw =
      row &&
      summaryColName &&
      Object.prototype.hasOwnProperty.call(row, summaryColName)
        ? row[summaryColName]
        : null;

    return { name, value: raw, valueFormatted: formatNumber(raw) };
  });

  const primarySummary = kpiSummary.filter((item) =>
    KPI_PRIMARY_ITEMS.has(item.name)
  );
  const secondarySummary = kpiSummary.filter(
    (item) => !KPI_PRIMARY_ITEMS.has(item.name)
  );

  const getDisplayColName = (col) => {
    if (col === "번호" || col === "항목" || col === "전체") return col;

    const idx = col.indexOf("_");
    if (idx === -1) return col;

    const cond = col.slice(0, idx);
    const code = col.slice(idx + 1);

    const map = LABEL_MAPS[cond];
    if (map && Object.prototype.hasOwnProperty.call(map, code) && map[code])
      return map[code];

    return code;
  };

  const getRowBackgroundColor = (itemName) => {
    const key = (itemName || "").trim();
    if (HIGHLIGHT_YELLOW_ITEMS.has(key)) return "#FFF9C4";
    if (HIGHLIGHT_GREEN_ITEMS.has(key)) return "#E8F5E9";
    return "transparent";
  };

  const tableMinWidth = Math.max(orderedColumns.length * 140, 0);

  const exportToExcel = () => {
    if (!rows || rows.length === 0) return;

    const header = orderedColumns.map((col) => getDisplayColName(col));
    const data = rows.map((row) =>
      orderedColumns.map((col) =>
        row[col] === null || row[col] === undefined ? "" : row[col]
      )
    );

    const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PL Report");

    const ym =
      selectedYmLabel && selectedYmLabel !== "-" ? selectedYmLabel : "unknown";
    const condLabel = selectedCond || "전체";
    XLSX.writeFile(wb, `PL_Report_${ym}_${condLabel}.xlsx`);
  };

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      {/* ✅ 상단: 라벨 탭(표/그래프) + EXPORT + 라벨 탭(조건) */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 10,
          width: "100%",
          flexWrap: "nowrap",
          minWidth: 0,

          position: "relative",
          zIndex: 5,

          // ✅ 패널과의 경계를 거의 지우기: 탭이 패널 안으로 “박히게”
          marginBottom: -14,
          paddingBottom: 0,
        }}
      >
        {/* 좌측: 표/그래프 탭 */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 4,
            flexShrink: 0,
            paddingBottom: 2,
          }}
        >
          <TopBarTab
            active={viewMode === "table"}
            label="표"
            onClick={() => setViewMode("table")}
          />
          <TopBarTab
            active={viewMode === "graph"}
            label="그래프"
            onClick={() => setViewMode("graph")}
          />
        </div>

        {/* export 버튼 */}
        <button
          type="button"
          onClick={exportToExcel}
          disabled={!rows || rows.length === 0}
          title="export table to xlsx"
          style={{
            height: 30,
            padding: "0 12px",
            marginBottom: 6,

            background: "#EEF2FF",
            border: "1px solid #C7D2FE",
            borderRadius: 10,

            fontFamily:
              "'Inter', 'Pretendard', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.02em",
            textTransform: "lowercase",
            color: "#1E3A8A",

            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            whiteSpace: "nowrap",

            cursor: !rows || rows.length === 0 ? "not-allowed" : "pointer",
            opacity: !rows || rows.length === 0 ? 0.45 : 1,
            boxShadow: "0 1px 0 rgba(15,23,42,0.04)",
            transition:
              "background 120ms ease, border-color 120ms ease, box-shadow 120ms ease, transform 120ms ease",
          }}
          onMouseEnter={(e) => {
            if (e.currentTarget.disabled) return;
            e.currentTarget.style.background = "#E0E7FF";
            e.currentTarget.style.borderColor = "#A5B4FC";
            e.currentTarget.style.boxShadow = "0 4px 10px rgba(30,58,138,0.18)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "#EEF2FF";
            e.currentTarget.style.borderColor = "#C7D2FE";
            e.currentTarget.style.boxShadow = "0 1px 0 rgba(15,23,42,0.04)";
            e.currentTarget.style.transform = "none";
          }}
          onMouseDown={(e) => {
            if (e.currentTarget.disabled) return;
            e.currentTarget.style.transform = "translateY(1px)";
          }}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M12 3v10"
              stroke="#1E3A8A"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M8 11l4 4 4-4"
              stroke="#1E3A8A"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M4 20h16"
              stroke="#1E3A8A"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <span>Export</span>
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              padding: "2px 6px",
              borderRadius: 8,
              background: "#FFFFFF",
              color: "#1E3A8A",
              border: "1px solid #C7D2FE",
              lineHeight: 1,
            }}
          >
            xlsx
          </span>
        </button>

        {/* 우측: 조건 탭 */}
        <div
          style={{
            marginLeft: "auto",
            minWidth: 0,
            flex: 1,
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 4,
              flexWrap: "nowrap",
              overflowX: "auto",
              overflowY: "hidden",
              paddingLeft: 4,
              scrollbarWidth: "thin",
              WebkitOverflowScrolling: "touch",
            }}
          >
            {CONDITION_KEYS.map((cond) => (
              <TopBarTab
                key={cond}
                active={selectedCond === cond}
                label={cond}
                onClick={() => setSelectedCond(cond)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ✅ 변경: 그래프 보기 모드에서는 이 요약(노란 카드) 영역이 뜨면 안 됨 */}
      {viewMode === "table" && (
        <div
          style={{
            ...panelStyle,
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ fontSize: 11, color: "#6b7280" }}>
            대표 경영지표 요약 (선택된 조건:&nbsp;
            <span style={{ fontWeight: 700, color: "#111827" }}>
              {selectedCond === "전체" ? "전체" : `${selectedCond} - 전체`}
            </span>
            )&nbsp;| 조회 기간:&nbsp;
            <span style={{ fontWeight: 700, color: "#111827" }}>
              {selectedYmLabel}
            </span>
          </div>

          {/* 1줄차: 핵심 KPI */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: 12,
            }}
          >
            {primarySummary.map((item) => {
              const formula = KPI_FORMULAS[item.name] || "";
              return (
                <div key={item.name} style={kpiPrimaryCardStyle}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      gap: 8,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "#374151",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.name}
                    </div>
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 800,
                        color: "#111827",
                        textAlign: "right",
                        maxWidth: "60%",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title={item.valueFormatted}
                    >
                      {item.valueFormatted}
                    </div>
                  </div>

                  {formula && (
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 10,
                        color: "#6b7280",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title={formula}
                    >
                      {formula}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 2줄차: 나머지 KPI */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
              gap: 12,
            }}
          >
            {secondarySummary.map((item) => {
              const formula = KPI_FORMULAS[item.name] || "";
              return (
                <div key={item.name} style={kpiCardStyle}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      gap: 6,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#4b5563",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.name}
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 800,
                        color: "#111827",
                        textAlign: "right",
                        maxWidth: "60%",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title={item.valueFormatted}
                    >
                      {item.valueFormatted}
                    </div>
                  </div>

                  {formula && (
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 10,
                        color: "#9ca3af",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title={formula}
                    >
                      {formula}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ====== 테이블 / 그래프 본문 ====== */}
      {viewMode === "table" ? (
        <div
          style={{
            ...panelWithTabOverlapStyle,
            padding: "12px 12px 10px",
            width: "100%",
            maxWidth: "100%",
            overflow: "hidden",
          }}
        >
          {/* ✅ seam(탭/패널 경계) 거의 지우는 스트립 */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              height: 16,
              background: PANEL_BG,
              // border-top 경계가 느껴질 때만 아주 옅은 그림자
              boxShadow: "0 1px 0 rgba(15,23,42,0.02)",
            }}
          />

          <div
            ref={mainScrollRef}
            style={{
              width: "100%",
              maxWidth: "100%",
              maxHeight: "68vh",
              overflowX: "auto",
              overflowY: "auto",
              position: "relative",
              zIndex: 1,
            }}
          >
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "13px",
                tableLayout: "fixed",
                minWidth: tableMinWidth,
              }}
            >
              <colgroup>
                <col style={{ width: 60 }} />
                <col style={{ width: 260 }} />
                {orderedColumns.slice(2).map((c) => (
                  <col key={c} style={{ width: "auto" }} />
                ))}
              </colgroup>

              <thead>
                <tr>
                  {orderedColumns.map((col) => (
                    <th
                      key={col}
                      style={{
                        borderBottom: "2px solid #e5e7eb",
                        padding: "8px 10px",
                        position: "sticky",
                        top: 0,
                        background: "#f9fafb",
                        textAlign:
                          col === "번호" || col === "항목" ? "left" : "right",
                        zIndex: 2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={getDisplayColName(col)}
                    >
                      {getDisplayColName(col)}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {rows.map((row, idx) => {
                  const itemName = row["항목"];
                  const rowBg = getRowBackgroundColor(itemName);

                  return (
                    <tr key={idx} style={{ backgroundColor: rowBg }}>
                      {orderedColumns.map((col) => {
                        const raw = row[col];
                        const isTextCol = col === "번호" || col === "항목";
                        const display = isTextCol
                          ? raw ?? ""
                          : formatNumber(raw);

                        return (
                          <td
                            key={col}
                            style={{
                              borderBottom: "1px solid #f3f4f6",
                              padding: "6px 10px",
                              textAlign: isTextCol ? "left" : "right",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={String(display ?? "")}
                          >
                            {display}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div style={panelWithTabOverlapStyle}>
          {/* ✅ seam(탭/패널 경계) 거의 지우는 스트립 */}
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              height: 16,
              background: PANEL_BG,
              boxShadow: "0 1px 0 rgba(15,23,42,0.02)",
            }}
          />
          <div style={{ position: "relative", zIndex: 1, padding: 12 }}>
            <PlReportGraphTab
              rows={rows}
              selectedCond={selectedCond}
              selectedYear={selectedYear}
              selectedMonth={selectedMonth}
              showCondBar={false}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default PlReportTab;
