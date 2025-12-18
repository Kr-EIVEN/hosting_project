// src/config/plConfig.js

// 메인 / 포인트 컬러 (이름은 그대로 쓰지만 색만 바꾼 것)
export const BRAND_DARK = "#111827"; // 거의 검정에 가까운 딥 그레이
export const BRAND_GREEN = "#2563EB"; // 지금은 메인 블루 느낌으로 사용
export const BRAND_ORANGE = "#FB7185"; // 핑크 톤 포인트
export const BG_LIGHT = "#F3F4F6";

export const PIE_COLORS = [
  "#2563EB",
  "#0EA5E9",
  "#14B8A6",
  "#6366F1",
  "#FB7185",
  "#FBBF24",
];

// ----------------------
// 결산 P&L 리포트용: Back data 엑셀 기반
// ----------------------

// 분류 기준 옵션 (손익센터, 계층구조, 평가클래스, 유통경로, 차종)
export const PL_DIMENSION_OPTIONS = [
  { id: "profitCenter", label: "손익센터", col: "손익 센터" },
  {
    id: "hierarchy",
    label: "계층구조(Prod.계층구조01-2)",
    col: "Prod.계층구조01-2",
  },
  { id: "evalClass", label: "평가클래스", col: "평가클래스" },
  { id: "channel", label: "유통경로", col: "유통 경로" },
  { id: "vehicle", label: "대표차종(차종)", col: "대표차종" },
];

export const PL_DIM_LABELS = PL_DIMENSION_OPTIONS.reduce((acc, cur) => {
  acc[cur.id] = cur.label;
  return acc;
}, {});

export const DIM_COL_MAP = PL_DIMENSION_OPTIONS.reduce((acc, cur) => {
  acc[cur.id] = cur.col;
  return acc;
}, {});

// 파이썬 ilji_pl_dashboard_ceo.py 와 동일한 계정 묶음
export const SALES_COLS = [
  "매출액-일반-제품",
  "매출액-일반-상품",
  "매출액-일반-설비",
  "매출액-일반-시작차",
  "매출액-일반-부산물",
  "매출액-일반-기타매출",
  "매출액-일반-기타",
  "매출액-일반-사급",
  "매출액-일반-유상사급",
];

export const COGS_COLS = ["(제실)매출원가(A)", "기타매출원가"];

export const SGA_COLS = [
  "(판)급여",
  "(판)퇴직급여",
  "(판)복리후생비",
  "(판)여비교통비",
  "(판)광고선전비",
  "(판)사무용품비",
  "(판)인쇄료",
  "(판)잡비",
  "(판)대손상각비",
  "(판)수도광열비",
  "(판)통신비",
  "(판)수선비",
  "(판)차량유지비",
  "(판)세금과공과",
  "(판)감가상각비",
  "(판)보험료",
  "(판)교육훈련비",
  "(판)용역비",
  "(판)수출제비용",
  "(판)무형자산상각비",
  "(판)지급임차료",
  "판관기타",
  "수동-판관관리",
];

export const NONOP_REV_COLS = [
  "(영수)이자수익",
  "(영수)임대료",
  "(영수)유가증권처분이익",
  "(영수)에펙처분이익",
  "(영수)외환차익",
  "(영수)외화환산이익",
  "(영수)잡이익",
  "영업외수익-기타",
];

export const NONOP_EXP_COLS = [
  "(영비)외환차손",
  "(영비)이자비용",
  "(영비)잡손실",
  "(영비)기부금",
  "(영비)장기투자증권평가손실",
  "(영비)당기손익인식자산평가손실",
  "(영비)당기손익인식자산처분손실",
  "(영비)파생상품자산거래손실",
  "(영비)파생상품자산평가손실",
  "(영비)유형자산처분손실",
  "(영비)종속기업투자손상차손",
  "(영비)외화환산손실",
  "영업외비용기타",
];

export const TAX_COLS = ["법인세비용"];
