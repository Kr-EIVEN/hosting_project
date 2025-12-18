import React, { useEffect, useMemo, useState } from "react";

/* =========================
 * Numbers
 * ========================= */
function formatNumber(v) {
  if (v === null || v === undefined || v === "") return "-";
  const num = Number(v);
  if (Number.isNaN(num)) return "-";
  return Math.round(num).toLocaleString("ko-KR");
}
function formatSignedNumber(v) {
  const num = Number(v);
  if (Number.isNaN(num)) return "-";
  const sign = num > 0 ? "+" : "";
  return sign + Math.round(num).toLocaleString("ko-KR");
}
function formatRate(v) {
  const num = Number(v);
  if (Number.isNaN(num)) return "-";
  const sign = num > 0 ? "+" : "";
  return `${sign}${num.toFixed(1)}%`;
}
function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}
function safeNum(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

/* =========================
 * ✅ 증가/감소 "정확" 규칙
 * ========================= */
function calcDiff(cur, prev) {
  return safeNum(cur) - safeNum(prev);
}
function calcRateFrom(cur, prev) {
  const p = safeNum(prev);
  const d = calcDiff(cur, prev);

  if (Math.abs(p) < 1e-12) {
    if (Math.abs(d) < 1e-12) return 0;
    return d > 0 ? 100 : -100;
  }
  return (d / Math.abs(p)) * 100;
}

/* =========================
 * Path helpers
 * ========================= */
function splitPath(pathStr) {
  if (!pathStr) return [];
  return String(pathStr)
    .split(">")
    .map((s) => s.trim())
    .filter(Boolean);
}
function joinPath(parts) {
  return (parts || []).join(" > ");
}
function normalizeItem(raw) {
  const path = raw?.path ? String(raw.path) : null;

  const cur = safeNum(raw?.cur ?? 0);
  const prev = safeNum(raw?.prev ?? 0);

  const diff = calcDiff(cur, prev);
  const rate = calcRateFrom(cur, prev);

  return { path, cur, prev, diff, rate, _raw: raw };
}

function buildChildrenFromPathItems(flatItems, prefixParts) {
  const depth = prefixParts.length;

  const under = flatItems.filter((it) => {
    if (!it.path) return false;
    const parts = splitPath(it.path);
    if (parts.length <= depth) return false;
    for (let i = 0; i < depth; i++)
      if (parts[i] !== prefixParts[i]) return false;
    return true;
  });

  const agg = new Map();
  for (const it of under) {
    const parts = splitPath(it.path);
    const childName = parts[depth];
    if (!childName) continue;
    if (!agg.has(childName)) agg.set(childName, { cur: 0, prev: 0, n: 0 });
    const a = agg.get(childName);
    a.cur += safeNum(it.cur);
    a.prev += safeNum(it.prev);
    a.n += 1;
  }

  const out = Array.from(agg.entries()).map(([childName, a]) => {
    const diff = calcDiff(a.cur, a.prev);
    const rate = calcRateFrom(a.cur, a.prev);
    return {
      name: childName,
      cur: a.cur,
      prev: a.prev,
      diff,
      rate,
      _cnt: a.n,
    };
  });

  out.sort((a, b) => Math.abs(safeNum(b.diff)) - Math.abs(safeNum(a.diff)));
  return out;
}

function hasDeeperLevel(flatItems, prefixParts) {
  const depth = prefixParts.length;
  return flatItems.some((it) => {
    if (!it.path) return false;
    const parts = splitPath(it.path);
    if (parts.length <= depth) return false;
    for (let i = 0; i < depth; i++)
      if (parts[i] !== prefixParts[i]) return false;
    return true;
  });
}

/* =========================
 * 기대 드릴다운 트리
 * ========================= */
const PL_TREE = {
  매출액: ["국내매출액", "수출매출액"],
  국내매출액: [
    "판매수량(국내)",
    "제품매출",
    "상품매출",
    "설비매출",
    "시작차매출",
    "부산물매출 (영업)",
    "부산물매출",
    "기타매출",
    "기타매출(금창)",
    "사급",
  ],
  수출매출액: [
    "판매수량(수출)",
    "제품매출",
    "상품매출",
    "설비매출",
    "기타매출",
  ],
  매출원가계: ["국내매출원가", "수출매출원가"],
  국내매출원가: ["제품", "상품", "기타"],
  수출매출원가: ["제품", "상품", "기타"],
  판매비와일반관리비: [
    "급여",
    "퇴직급여",
    "복리후생비",
    "감가상각비",
    "지급수수료",
    "운반비",
    "광고선전비",
    "기타",
  ],
  영업외손익: ["영업외수익", "영업외비용"],
};

/* =========================
 * Design tokens
 * ========================= */
const UI = {
  bg: "#F3F6FB",
  card: "#FFFFFF",
  text: "#0B1220",
  sub: "#516074",
  line: "rgba(15, 23, 42, 0.12)",

  radius: 2,
  radiusLg: 1,

  shadow: "0 1px 2px rgba(15,23,42,0.06)",
  shadowSm: "0 1px 1px rgba(15,23,42,0.05)",

  mono: { fontVariantNumeric: "tabular-nums" },

  green: "#15803D",
  red: "#B91C1C",
  gray: "#475569",

  greenBg: "rgba(21, 128, 61, 0.10)",
  redBg: "rgba(185, 28, 28, 0.10)",
  grayBg: "rgba(148, 163, 184, 0.16)",

  blue: "#2563EB",
  blueBg: "rgba(37, 99, 235, 0.12)",

  amberBg: "rgba(245, 158, 11, 0.12)",
};

function signTone(v) {
  const n = safeNum(v);
  if (n > 0) return "pos";
  if (n < 0) return "neg";
  return "zero";
}

function isCostLikeLabel(label) {
  const s = String(label || "");
  return /비용|원가|판관비|판매비|관리비|비와일반관리비|급여|수수료|감가상각|운반비|광고/i.test(
    s
  );
}
function pickColorByMode(value, mode = "profit") {
  const tone = signTone(value);

  if (tone === "zero") {
    return { fg: UI.gray, bg: UI.grayBg, bd: "rgba(148,163,184,0.28)" };
  }

  const isCost = mode === "cost";
  const isPosGood = !isCost;
  const goodTone = isPosGood ? "pos" : "neg";
  const isGood = tone === goodTone;

  if (isGood) {
    return { fg: UI.green, bg: UI.greenBg, bd: "rgba(21,128,61,0.26)" };
  }
  return { fg: UI.red, bg: UI.redBg, bd: "rgba(185,28,28,0.26)" };
}

function pickBlue() {
  return { fg: UI.blue, bg: UI.blueBg, bd: "rgba(37,99,235,0.28)" };
}
function pickGray() {
  return { fg: UI.gray, bg: UI.grayBg, bd: "rgba(148,163,184,0.28)" };
}

function impactTone(impactPct, parentDiff) {
  const pd = safeNum(parentDiff);
  const ii = safeNum(impactPct);

  if (Math.abs(pd) < 1e-9) return "gray";

  const MIN_IMPACT_PCT = 5;
  if (Math.abs(ii) < MIN_IMPACT_PCT) return "gray";

  return "blue";
}

/* =========================
 * ▲▼ 아이콘
 * ========================= */
function TrendIcon({ value, size = 11, color }) {
  const n = safeNum(value);
  const dir = n > 0 ? "up" : n < 0 ? "down" : "flat";
  const s = size;

  const common = {
    width: s,
    height: s,
    viewBox: "0 0 12 12",
    style: { display: "inline-block", verticalAlign: "-1px" },
  };

  if (dir === "flat") {
    return (
      <svg {...common} aria-hidden="true">
        <rect x="2" y="5.2" width="8" height="1.6" rx="0.8" fill={color} />
      </svg>
    );
  }

  if (dir === "up") {
    return (
      <svg {...common} aria-hidden="true">
        <path d="M6 2 L10 8 H2 Z" fill={color} />
      </svg>
    );
  }

  return (
    <svg {...common} aria-hidden="true">
      <path d="M6 10 L2 4 H10 Z" fill={color} />
    </svg>
  );
}

/* =========================
 * ✅ 배지
 * ========================= */
function AmountBadge({ value, title, style, mode = "profit" }) {
  const n = safeNum(value);
  const tone = pickColorByMode(n, mode);
  return (
    <span
      title={title || "전월 대비 금액 변화"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "5px 8px",
        borderRadius: UI.radius,
        border: `1px solid ${tone.bd}`,
        background: tone.bg,
        color: tone.fg,
        fontSize: 11,
        fontWeight: 900,
        whiteSpace: "nowrap",
        lineHeight: 1,
        ...UI.mono,
        ...style,
      }}
    >
      <TrendIcon value={n} size={11} color={tone.fg} />
      <span>{formatSignedNumber(n)}</span>
    </span>
  );
}

function RateBadge({ value, toneValue, title, style, mode = "profit" }) {
  const n = safeNum(value);
  const tv = toneValue === undefined ? n : safeNum(toneValue);
  const tone = pickColorByMode(tv, mode);

  return (
    <span
      title={title || "변화율(%)"}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "5px 8px",
        borderRadius: UI.radius,
        border: `1px solid ${tone.bd}`,
        background: tone.bg,
        color: tone.fg,
        fontSize: 11,
        fontWeight: 900,
        whiteSpace: "nowrap",
        lineHeight: 1,
        ...UI.mono,
        ...style,
      }}
    >
      <TrendIcon value={tv} size={11} color={tone.fg} />
      <span>{formatRate(n)}</span>
    </span>
  );
}

/* =========================
 * UI atoms
 * ========================= */
function Card({ title, right, children, style }) {
  return (
    <div
      style={{
        position: "relative",
        background: UI.card,
        border: `1px solid ${UI.line}`,
        borderRadius: UI.radiusLg,
        boxShadow: "0 2px 4px rgba(15,23,42,0.04)",
        padding: 16,
        overflow: "visible", // ✅ 부모 overflow 영향 덜 받게
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -1,
          left: 0,
          right: 0,
          height: 10,
          background: UI.card,
          borderTopLeftRadius: UI.radiusLg,
          borderTopRightRadius: UI.radiusLg,
          zIndex: 1,
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative", zIndex: 2, overflow: "visible" }}>
        {(title || right) && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 900, color: UI.text }}>
              {title}
            </div>
            {right}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

function Pill({ children, tone = "neutral", title, style }) {
  const t =
    tone === "blue"
      ? pickBlue()
      : tone === "gray"
      ? pickGray()
      : tone === "amber"
      ? { fg: "#92400E", bg: UI.amberBg, bd: "rgba(245,158,11,0.26)" }
      : tone === "pos"
      ? pickColorByMode(1, "profit")
      : tone === "neg"
      ? pickColorByMode(-1, "profit")
      : pickGray();

  return (
    <span
      title={title || ""}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        borderRadius: UI.radius,
        border: `1px solid ${t.bd}`,
        background: t.bg,
        color: t.fg,
        fontSize: 11,
        fontWeight: 800,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

function IndexTab({ active, label, onClick }) {
  const TAB_COLORS = {
    영업이익: { on: "#2563EB", off: "rgba(37,99,235,0.35)" },
    당기순이익: { on: "#855eefff", off: "rgba(118, 79, 184, 0.32)" },
  };

  const c = TAB_COLORS[label] || { on: UI.blue, off: "rgba(148,163,184,0.55)" };

  const tabStyle = {
    position: "relative",
    height: 30,
    padding: "0 12px",
    borderRadius: UI.radiusLg,
    border: "1px solid rgba(15, 23, 42, 0.14)",
    borderBottom: "1px solid #ffffff",
    background: active ? "#ffffff" : "rgba(15,23,42,0.03)",
    color: active ? UI.text : "rgba(81,96,116,0.95)",
    fontSize: 11,
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "none",
    transform: "translateY(1px)",
    transition: "all 120ms ease",
    display: "inline-flex",
    alignItems: "center",
    whiteSpace: "nowrap",
    overflow: "hidden",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      style={tabStyle}
      aria-pressed={active}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: 3,
          background: active ? c.on : c.off,
        }}
      />
      <span style={{ paddingTop: 1, marginLeft: -2 }}>{label}</span>
    </button>
  );
}

function BarMeter({ value, maxAbs, mode = "profit" }) {
  const v = safeNum(value);
  const m = Math.max(1e-9, safeNum(maxAbs, 1));
  const w = clamp((Math.abs(v) / m) * 100, 0, 100);
  const c = pickColorByMode(v, mode);

  return (
    <div
      style={{
        height: 10,
        borderRadius: UI.radius,
        background: "rgba(15,23,42,0.06)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${w}%`,
          background: c.fg,
          opacity: 0.9,
        }}
      />
    </div>
  );
}

/* =========================
 * KPI Strip
 * ========================= */
function KpiStrip({ items = [] }) {
  const maxAbsRate = useMemo(() => {
    const m = Math.max(1, ...items.map((x) => Math.abs(safeNum(x.rate))));
    return m;
  }, [items]);

  return (
    <div
      style={{
        background: UI.card,
        border: `1px solid ${UI.line}`,
        borderRadius: UI.radiusLg,
        boxShadow: UI.shadow,
        padding: 12,
        marginBottom: 12,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(180px, 1fr))",
          gap: 10,
          alignItems: "stretch",
        }}
      >
        {items.map((it) => {
          const cur = safeNum(it.cur);
          const prev = safeNum(it.prev);
          const diff = calcDiff(cur, prev);
          const rate = calcRateFrom(cur, prev);

          const mode =
            it.mode || (isCostLikeLabel(it.label) ? "cost" : "profit");

          return (
            <div
              key={it.key}
              style={{
                border: `1px solid ${UI.line}`,
                borderRadius: UI.radiusLg,
                padding: 10,
                background: "rgba(15,23,42,0.02)",
                minWidth: 0,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "center",
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 950,
                    color: UI.text,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    minWidth: 0,
                  }}
                  title={it.label}
                >
                  {it.label}
                </div>

                <div
                  style={{
                    display: "inline-flex",
                    gap: 6,
                    alignItems: "center",
                  }}
                >
                  <AmountBadge value={diff} mode={mode} />
                  <RateBadge value={rate} toneValue={diff} mode={mode} />
                </div>
              </div>

              <div
                style={{
                  marginTop: 10,
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 850, color: UI.sub }}>
                    전월
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 13,
                      fontWeight: 950,
                      color: UI.text,
                      ...UI.mono,
                    }}
                  >
                    {formatNumber(prev)}
                  </div>
                </div>

                <div style={{ textAlign: "right", minWidth: 0 }}>
                  <div style={{ fontSize: 10, fontWeight: 850, color: UI.sub }}>
                    당월
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 13,
                      fontWeight: 950,
                      color: UI.text,
                      ...UI.mono,
                    }}
                  >
                    {formatNumber(cur)}
                  </div>
                </div>
              </div>

              <div
                style={{
                  marginTop: 10,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: 10,
                  fontWeight: 800,
                  color: UI.sub,
                }}
              >
                <span>감소</span>
                <span style={{ ...UI.mono }}>0</span>
                <span>증가</span>
              </div>

              <div style={{ marginTop: 6 }}>
                <div
                  style={{
                    position: "relative",
                    height: 9,
                    borderRadius: UI.radius,
                    background: "rgba(15,23,42,0.06)",
                    overflow: "hidden",
                  }}
                  title={`${formatRate(rate)} / ${formatSignedNumber(diff)}`}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: "50%",
                      top: 0,
                      bottom: 0,
                      width: 1,
                      background: "rgba(15,23,42,0.18)",
                    }}
                  />
                  {rate < 0 ? (
                    <div
                      style={{
                        position: "absolute",
                        right: "50%",
                        top: 0,
                        bottom: 0,
                        width: `${clamp(
                          (Math.abs(rate) / Math.max(1, maxAbsRate)) * 50,
                          0,
                          50
                        )}%`,
                        background: pickColorByMode(diff, mode).fg,
                        opacity: 0.9,
                      }}
                    />
                  ) : rate > 0 ? (
                    <div
                      style={{
                        position: "absolute",
                        left: "50%",
                        top: 0,
                        bottom: 0,
                        width: `${clamp(
                          (Math.abs(rate) / Math.max(1, maxAbsRate)) * 50,
                          0,
                          50
                        )}%`,
                        background: pickColorByMode(diff, mode).fg,
                        opacity: 0.9,
                      }}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* =========================
 * Auto Trace
 * ========================= */
function autoTracePath({ getChildren, getHasNext, startParts, maxDepth = 10 }) {
  const trace = [
    {
      parts: startParts.slice(),
      label: startParts[startParts.length - 1],
      value: null,
    },
  ];
  let curParts = startParts.slice();

  for (let step = 0; step < maxDepth; step++) {
    const children = getChildren(curParts);
    if (!children || children.length === 0) break;

    const top = children
      .slice()
      .sort((a, b) => Math.abs(safeNum(b.diff)) - Math.abs(safeNum(a.diff)))[0];
    if (!top) break;

    const nextParts = [...curParts, top.name];
    trace.push({ parts: nextParts, label: top.name, value: top });

    if (!getHasNext(nextParts)) break;
    curParts = nextParts;
  }

  return trace;
}

/* =========================
 * Summary sentence generator
 * ========================= */
function buildSummarySentenceAdvanced({
  activeKpi,
  viewData,
  driver,
  getChildren,
  getHasNext,
}) {
  const kpiCards = viewData?.kpi_cards || [];
  const map = new Map();
  kpiCards.forEach((x) => map.set(String(x.name), x));

  const k = map.get(activeKpi);

  const kpiCur = safeNum(k?.cur);
  const kpiPrev = safeNum(k?.prev);
  const kpiDiff = calcDiff(kpiCur, kpiPrev);
  const kpiDir = kpiDiff >= 0 ? "증가" : "감소";

  const topDriver =
    driver?.components
      ?.slice()
      ?.sort(
        (a, b) => Math.abs(safeNum(b.contrib)) - Math.abs(safeNum(a.contrib))
      )[0] || null;

  const traceLeaf = (rootName) => {
    if (!rootName) return null;
    const trace = autoTracePath({
      getChildren,
      getHasNext,
      startParts: [rootName],
      maxDepth: 12,
    });
    if (!trace || trace.length <= 1) return null;
    const leaf = trace[trace.length - 1];
    return { trace, leaf };
  };

  if (activeKpi === "영업이익") {
    const sales = map.get("매출액");
    const cogs = map.get("매출원가계");
    const sga = map.get("판매비와일반관리비");

    const salesDiff = calcDiff(safeNum(sales?.cur), safeNum(sales?.prev));
    const cogsDiff = calcDiff(safeNum(cogs?.cur), safeNum(cogs?.prev));
    const sgaDiff = calcDiff(safeNum(sga?.cur), safeNum(sga?.prev));

    const salesHelp = salesDiff > 0;
    const cogsHelp = cogsDiff < 0;
    const sgaHelp = sgaDiff < 0;

    const salesLeaf = salesHelp ? traceLeaf("매출액") : null;
    const sgaLeaf = sgaHelp ? traceLeaf("판매비와일반관리비") : null;
    const cogsLeaf = cogsHelp ? traceLeaf("매출원가계") : null;

    const lines = [];
    lines.push(
      `결론: 영업이익이 ${kpiDir}했습니다 (${formatSignedNumber(kpiDiff)}).`
    );

    if (topDriver) {
      lines.push(
        `주요 요인: ${topDriver.component} (${formatSignedNumber(
          safeNum(topDriver.contrib)
        )}).`
      );
    }

    if (salesHelp && salesLeaf?.leaf?.value) {
      const v = salesLeaf.leaf.value;
      lines.push(
        `매출 상세: ${salesLeaf.leaf.label} (${formatSignedNumber(
          safeNum(v.diff)
        )}, ${formatRate(safeNum(v.rate))}).`
      );
    } else if (salesDiff !== 0) {
      lines.push(`매출액 ${formatSignedNumber(salesDiff)}.`);
    }

    if (sgaHelp && sgaLeaf?.leaf?.value) {
      const v = sgaLeaf.leaf.value;
      lines.push(
        `판관비 상세: ${sgaLeaf.leaf.label} (${formatSignedNumber(
          safeNum(v.diff)
        )}, ${formatRate(safeNum(v.rate))}).`
      );
    } else if (sgaDiff !== 0) {
      lines.push(`판관비 ${formatSignedNumber(sgaDiff)}.`);
    }

    if (cogsHelp && cogsLeaf?.leaf?.value) {
      const v = cogsLeaf.leaf.value;
      lines.push(
        `원가 상세: ${cogsLeaf.leaf.label} (${formatSignedNumber(
          safeNum(v.diff)
        )}, ${formatRate(safeNum(v.rate))}).`
      );
    }

    return lines.join(" ");
  }

  if (k) {
    const drv = topDriver
      ? `주요 원인: ${topDriver.component} (${formatSignedNumber(
          safeNum(topDriver.contrib)
        )}).`
      : `주요 원인 데이터 부족.`;

    return `결론: ${activeKpi}이(가) ${kpiDir}했습니다 (${formatSignedNumber(
      kpiDiff
    )}). ${drv}`;
  }

  return `${activeKpi} KPI 정보가 없습니다.`;
}

/* =========================
 * Conclusion render
 * ========================= */
function splitToLines(text) {
  const s = String(text || "").trim();
  if (!s) return [];
  return s
    .replace(/\s*([.?!])\s+/g, "$1\n")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
}

function renderHighlightedText(text, activeKpi) {
  const s = String(text || "");
  const re =
    /(영업이익|당기순이익|매출액|매출원가계|판매비와일반관리비|판관비|영업외손익|영업비용|주요 요인|주요 원인|기여|결론|[+-]?\d[\d,]*|[+-]?\d+(?:\.\d+)?%)/g;

  const parts = s.split(re).filter((x) => x !== "");
  const mode = isCostLikeLabel(activeKpi) ? "cost" : "profit";

  return parts.map((p, i) => {
    if (/%$/.test(p)) {
      const n = Number(String(p).replace("%", ""));
      const tone = pickColorByMode(n, mode);
      return (
        <span
          key={i}
          style={{
            color: tone.fg,
            fontWeight: 950,
            ...UI.mono,
            padding: "0 1px",
          }}
        >
          {p}
        </span>
      );
    }

    if (/^[+-]?\d[\d,]*$/.test(p)) {
      const n = Number(String(p).replace(/,/g, ""));
      const tone = pickColorByMode(n, mode);
      return (
        <span
          key={i}
          style={{
            color: tone.fg,
            fontWeight: 950,
            ...UI.mono,
            padding: "0 1px",
          }}
        >
          {p}
        </span>
      );
    }

    if (
      /^(영업이익|당기순이익|매출액|매출원가계|판매비와일반관리비|판관비|영업외손익|영업비용|주요 요인|주요 원인|기여|결론)$/.test(
        p
      )
    ) {
      return (
        <span
          key={i}
          style={{ color: UI.blue, fontWeight: 950, padding: "0 1px" }}
        >
          {p}
        </span>
      );
    }

    return (
      <span key={i} style={{ color: UI.sub, fontWeight: 650 }}>
        {p}
      </span>
    );
  });
}

function ConclusionInline({ text, activeKpi }) {
  const lines = splitToLines(text);
  if (!lines.length)
    return (
      <span style={{ color: UI.sub, fontWeight: 800 }}>
        요약 문장을 만들 데이터가 없습니다.
      </span>
    );

  return (
    <>
      {lines.map((line, idx) => (
        <React.Fragment key={idx}>
          {renderHighlightedText(line, activeKpi)}
          {idx !== lines.length - 1 && <br />}
        </React.Fragment>
      ))}
    </>
  );
}

/* =========================
 * KPI Header
 * ========================= */
function KpiHeader({
  activeKpi,
  kpi,
  topDrivers = [],
  kpiDiff = 0,
  activeComponent,
  onPickDriver,
  conclusionText,
}) {
  const cur = safeNum(kpi?.cur);
  const prev = safeNum(kpi?.prev);

  const mainDiff = calcDiff(cur, prev);
  const mainRate = calcRateFrom(cur, prev);

  const mode = isCostLikeLabel(activeKpi) ? "cost" : "profit";
  const rateTone = pickColorByMode(mainDiff, mode);

  const maxAbsDiffTop3 = useMemo(() => {
    if (!topDrivers?.length) return 1;
    const diffs = topDrivers.map((d) =>
      calcDiff(safeNum(d.cur), safeNum(d.prev))
    );
    return Math.max(1, ...diffs.map((x) => Math.abs(safeNum(x))));
  }, [topDrivers]);

  return (
    <div
      style={{
        background: UI.card,
        border: `1px solid ${UI.line}`,
        borderRadius: UI.radiusLg,
        boxShadow: UI.shadow,
        padding: 16,
        overflow: "visible",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 14,
          alignItems: "stretch",
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 300, flex: "0 0 auto" }}>
          <div style={{ fontSize: 18, fontWeight: 950, color: UI.text }}>
            {activeKpi} 변화 핵심
          </div>

          <div
            style={{
              marginTop: 10,
              borderRadius: UI.radiusLg,
              border: `1px solid ${rateTone.bd}`,
              background: rateTone.bg,
              padding: 14,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                alignItems: "center",
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 900, color: UI.sub }}>
                전월 대비 변화율
              </div>
              <RateBadge value={mainRate} toneValue={mainDiff} mode={mode} />
            </div>

            <div
              style={{
                marginTop: 10,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
              }}
            >
              <div
                style={{
                  borderRadius: UI.radiusLg,
                  border: `1px solid ${UI.line}`,
                  background: "rgba(255,255,255,0.72)",
                  padding: 10,
                  minWidth: 0,
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 900, color: UI.sub }}>
                  전월
                </div>
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 15,
                    fontWeight: 950,
                    color: UI.text,
                    ...UI.mono,
                  }}
                >
                  {formatNumber(prev)}
                </div>
              </div>

              <div
                style={{
                  borderRadius: UI.radiusLg,
                  border: `1px solid ${UI.line}`,
                  background: "rgba(255,255,255,0.72)",
                  padding: 10,
                  minWidth: 0,
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 900, color: UI.sub }}>
                  당월
                </div>
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 15,
                    fontWeight: 950,
                    color: UI.text,
                    ...UI.mono,
                  }}
                >
                  {formatNumber(cur)}
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            <AmountBadge
              value={mainDiff}
              mode={mode}
              title={`KPI 금액 변화(UI 기준: cur-prev=${formatSignedNumber(
                mainDiff
              )}) / 백엔드 kpi_diff=${formatSignedNumber(safeNum(kpiDiff))}`}
              style={{ fontSize: 11 }}
            />
            <span style={{ marginLeft: 8, color: UI.sub, fontWeight: 800 }}>
              (KPI)
            </span>
          </div>

          <div
            style={{
              marginTop: 12,
              borderRadius: UI.radiusLg,
              border: `1px solid ${UI.line}`,
              background: "rgba(15,23,42,0.02)",
              padding: 14,
              fontSize: 13,
              lineHeight: 1.85,
              letterSpacing: "-0.01em",
              wordBreak: "keep-all",
            }}
          >
            <ConclusionInline
              text={conclusionText || "요약 문장을 만들 데이터가 없습니다."}
              activeKpi={activeKpi}
            />
          </div>
        </div>

        <div style={{ minWidth: 360, flex: 1 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 900,
              color: UI.sub,
              marginBottom: 10,
            }}
          >
            변화 요인 TOP 3 (클릭하면 세부요인 출력)
          </div>

          {topDrivers.length === 0 ? (
            <div style={{ fontSize: 12, color: UI.sub }}>
              주요 요인 데이터가 없습니다.
            </div>
          ) : (
            <div
              style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}
            >
              {topDrivers.map((d, idx) => {
                const isActive = activeComponent === d.component;

                const prev2 = safeNum(d.prev);
                const cur2 = safeNum(d.cur);
                const diff2 = calcDiff(cur2, prev2);
                const rate2 = calcRateFrom(cur2, prev2);

                const t = pickColorByMode(diff2, "profit");

                return (
                  <div
                    key={d.component}
                    onClick={() => onPickDriver?.(d.component)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ")
                        onPickDriver?.(d.component);
                    }}
                    style={{
                      cursor: "pointer",
                      border: `1px solid ${
                        isActive ? "rgba(15,23,42,0.22)" : UI.line
                      }`,
                      borderRadius: UI.radiusLg,
                      padding: 14,
                      background: isActive ? "#FFFFFF" : "rgba(15,23,42,0.02)",
                      boxShadow: isActive ? UI.shadowSm : "none",
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: 12,
                      alignItems: "center",
                    }}
                    title="클릭하면 세부요인"
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 900,
                          color: UI.text,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                        title={d.component}
                      >
                        {idx + 1}. {d.component}
                      </div>

                      <div style={{ marginTop: 8 }}>
                        <BarMeter
                          value={diff2}
                          maxAbs={maxAbsDiffTop3}
                          mode="profit"
                        />
                      </div>

                      <div
                        style={{
                          marginTop: 8,
                          display: "flex",
                          gap: 8,
                          flexWrap: "wrap",
                          alignItems: "center",
                        }}
                      >
                        <RateBadge
                          value={rate2}
                          toneValue={diff2}
                          mode="profit"
                          style={{ fontSize: 11 }}
                        />
                        <AmountBadge
                          value={diff2}
                          mode="profit"
                          style={{ fontSize: 11 }}
                        />
                      </div>

                      <div
                        style={{
                          marginTop: 10,
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: 8,
                        }}
                      >
                        <div
                          style={{
                            borderRadius: UI.radiusLg,
                            border: `1px solid ${UI.line}`,
                            background: "#fff",
                            padding: "8px 10px",
                            minWidth: 0,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 10,
                              fontWeight: 900,
                              color: UI.sub,
                            }}
                          >
                            전월
                          </div>
                          <div
                            style={{
                              marginTop: 3,
                              fontSize: 12,
                              fontWeight: 950,
                              color: UI.text,
                              ...UI.mono,
                            }}
                          >
                            {formatNumber(prev2)}
                          </div>
                        </div>

                        <div
                          style={{
                            borderRadius: UI.radiusLg,
                            border: `1px solid ${UI.line}`,
                            background: "#fff",
                            padding: "8px 10px",
                            minWidth: 0,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 10,
                              fontWeight: 900,
                              color: UI.sub,
                            }}
                          >
                            당월
                          </div>
                          <div
                            style={{
                              marginTop: 3,
                              fontSize: 12,
                              fontWeight: 950,
                              color: UI.text,
                              ...UI.mono,
                            }}
                          >
                            {formatNumber(cur2)}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                        alignItems: "flex-end",
                      }}
                    >
                      <Pill tone="gray" style={{ fontSize: 12 }}>
                        TOP {idx + 1}
                      </Pill>
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: UI.radius,
                          background: t.fg,
                          opacity: 0.9,
                        }}
                      />
                      {isActive && <Pill tone="blue">선택됨</Pill>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================
 * Backend helpers
 * ========================= */
function aggregateRootTotals(flatItems, rootName) {
  if (!flatItems?.length) return null;
  let cur = 0,
    prev = 0,
    hit = 0;

  for (const it of flatItems) {
    if (!it?.path) continue;
    const parts = splitPath(it.path);
    if (!parts.length) continue;
    if (parts[0] !== rootName) continue;
    cur += safeNum(it.cur);
    prev += safeNum(it.prev);
    hit += 1;
  }
  if (!hit) return null;

  const diff = calcDiff(cur, prev);
  const rate = calcRateFrom(cur, prev);

  return { name: rootName, cur, prev, diff, rate, _cnt: hit };
}

/* =========================
 * NonOp Section
 * ========================= */
function NonOpSection({
  title,
  isOpen,
  onToggle,
  list = [],
  getHasNext,
  onDrillTo,
}) {
  const parentSummary = useMemo(() => {
    if (!list.length) return { cur: 0, prev: 0, diff: 0, rate: 0 };
    const cur = list.reduce((a, x) => a + safeNum(x.cur), 0);
    const prev = list.reduce((a, x) => a + safeNum(x.prev), 0);
    const diff = calcDiff(cur, prev);
    const rate = calcRateFrom(cur, prev);
    return { cur, prev, diff, rate };
  }, [list]);

  const maxAbs = useMemo(() => {
    if (!list.length) return 1;
    return Math.max(1, ...list.map((x) => Math.abs(safeNum(x.diff))));
  }, [list]);

  const headTone = pickGray();

  return (
    <div
      style={{
        border: `1px solid ${UI.line}`,
        borderRadius: UI.radiusLg,
        overflow: "hidden",
        background: "#fff",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%",
          textAlign: "left",
          cursor: "pointer",
          background: "rgba(15,23,42,0.02)",
          border: "none",
          padding: "12px 12px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 950, color: UI.text }}>
            {title}
          </span>
          <Pill tone="gray" style={{ fontSize: 11 }}>
            전월 {formatNumber(parentSummary.prev)} → 당월{" "}
            {formatNumber(parentSummary.cur)}
          </Pill>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 10px",
              borderRadius: UI.radius,
              border: `1px solid ${headTone.bd}`,
              background: headTone.bg,
              color: headTone.fg,
              fontSize: 11,
              fontWeight: 900,
              ...UI.mono,
            }}
            title="이 섹션 합계 변화"
          >
            {formatSignedNumber(parentSummary.diff)} (
            {formatRate(parentSummary.rate)})
          </span>
        </div>

        <Pill tone="gray" style={{ fontSize: 11 }}>
          {isOpen ? "접기" : "펼치기"}
        </Pill>
      </button>

      {isOpen && (
        <div style={{ padding: 12 }}>
          {!list.length ? (
            <div style={{ fontSize: 12, color: UI.sub, fontWeight: 800 }}>
              하위 데이터가 없습니다.
            </div>
          ) : (
            <div
              style={{
                border: `1px solid ${UI.line}`,
                borderRadius: UI.radiusLg,
                overflow: "hidden",
                background: "#fff",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.2fr 0.7fr 0.7fr 0.9fr 0.7fr 0.6fr",
                  background: "rgba(15,23,42,0.03)",
                  padding: "10px 12px",
                  fontSize: 11,
                  fontWeight: 900,
                  color: UI.sub,
                }}
              >
                <div>항목</div>
                <div style={{ textAlign: "right" }}>%</div>
                <div style={{ textAlign: "right" }}>영향도</div>
                <div style={{ textAlign: "right" }}>금액</div>
                <div style={{ textAlign: "right" }}>전월</div>
                <div style={{ textAlign: "right" }}>당월</div>
              </div>

              {list.map((x) => {
                const hasNext = !!getHasNext?.(x.__parts || []);
                const diff = calcDiff(x.cur, x.prev);
                const rowMode = isCostLikeLabel(x.name) ? "cost" : "profit";

                const pd = safeNum(parentSummary?.diff);
                const impact = pd ? (diff / pd) * 100 : 0;
                const tone = impactTone(impact, parentSummary?.diff);
                const cc = tone === "blue" ? pickBlue() : pickGray();
                const parentZero = Math.abs(pd) < 1e-9;

                return (
                  <div
                    key={joinPath(x.__parts || [title, x.name])}
                    onClick={() => {
                      if (!hasNext) return;
                      onDrillTo?.(x.__parts);
                    }}
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "1.2fr 0.7fr 0.7fr 0.9fr 0.7fr 0.6fr",
                      padding: "12px 12px",
                      borderTop: `1px solid ${UI.line}`,
                      background: hasNext ? "#fff" : "rgba(15,23,42,0.01)",
                      cursor: hasNext ? "pointer" : "default",
                      alignItems: "center",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                        }}
                      >
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 900,
                            color: UI.text,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                          title={x.name}
                        >
                          {x.name}
                        </div>
                        {hasNext && (
                          <Pill tone="gray" style={{ fontSize: 10 }}>
                            드릴다운
                          </Pill>
                        )}
                      </div>

                      <div style={{ marginTop: 8 }}>
                        <BarMeter value={diff} maxAbs={maxAbs} mode={rowMode} />
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <RateBadge
                        value={calcRateFrom(x.cur, x.prev)}
                        toneValue={diff}
                        mode={rowMode}
                      />
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          padding: "6px 10px",
                          borderRadius: UI.radius,
                          border: `1px solid ${cc.bd}`,
                          background: cc.bg,
                          color: cc.fg,
                          fontSize: 13,
                          fontWeight: 900,
                          ...UI.mono,
                          whiteSpace: "nowrap",
                        }}
                        title={
                          parentZero
                            ? "상위 변화=0 → 영향도 의미 없음"
                            : "상위 변화 대비 비중"
                        }
                      >
                        {parentZero ? "—" : formatRate(impact)}
                      </span>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <AmountBadge
                        value={diff}
                        mode={rowMode}
                        style={{ fontSize: 12 }}
                      />
                    </div>

                    <div
                      style={{
                        textAlign: "right",
                        fontSize: 12,
                        fontWeight: 800,
                        color: UI.sub,
                        ...UI.mono,
                      }}
                    >
                      {formatNumber(safeNum(x.prev))}
                    </div>

                    <div
                      style={{
                        textAlign: "right",
                        fontSize: 12,
                        fontWeight: 800,
                        color: UI.sub,
                        ...UI.mono,
                      }}
                    >
                      {formatNumber(safeNum(x.cur))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* =========================
 * Main
 * ========================= */
export default function PlReportCauseTab({ selectedYm: selectedYmProp }) {
  const [selectedYm, setSelectedYm] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [causeData, setCauseData] = useState(null);

  const [activeKpi, setActiveKpi] = useState("영업이익");
  const [drillStack, setDrillStack] = useState([]);
  const [activeComponent, setActiveComponent] = useState(null);

  const [childFilter, setChildFilter] = useState("");
  const [sortMode, setSortMode] = useState("absdiff");

  const [nonOpOpen, setNonOpOpen] = useState({
    영업외수익: false,
    영업외비용: false,
  });

  useEffect(() => {
    if (selectedYmProp) setSelectedYm(selectedYmProp);
  }, [selectedYmProp]);

  useEffect(() => {
    if (selectedYmProp) return;
    const fetchPeriods = async () => {
      try {
        const res = await fetch("/api/pl-cause/periods");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        const list = data.periods || [];
        if (list.length > 0) {
          const last = list[list.length - 1];
          const ym = `${last.year}-${String(last.month).padStart(2, "0")}`;
          setSelectedYm(ym);
        }
      } catch (err) {
        setError(err.message || "원인 분석 기간 목록 조회 오류");
      }
    };
    fetchPeriods();
  }, [selectedYmProp]);

  useEffect(() => {
    if (!selectedYm) return;
    const [yStr, mStr] = String(selectedYm).split("-");
    const y = Number(yStr);
    const m = Number(mStr);
    if (!y || !m) return;

    const fetchCause = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          year: String(y),
          month: String(m),
        }).toString();
        const res = await fetch(`/api/pl-cause?${params}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        setCauseData(data);

        setActiveComponent(null);
        setDrillStack([]);
        setChildFilter("");
        setSortMode("absdiff");
        setNonOpOpen({ 영업외수익: false, 영업외비용: false });
      } catch (err) {
        setError(err.message || "원인 분석 조회 실패");
        setCauseData(null);
      } finally {
        setLoading(false);
      }
    };
    fetchCause();
  }, [selectedYm]);

  const viewData = causeData;
  const kpiCards = viewData?.kpi_cards || [];
  const drivers = viewData?.drivers || {};
  const driver = drivers?.[activeKpi] || null;

  const backendDrilldowns = viewData?.drilldowns || {};
  const flatItems = useMemo(() => {
    const src =
      viewData?.all_items || viewData?.items || viewData?.top_items || [];
    return (src || [])
      .map(normalizeItem)
      .filter((x) => x.path && x.path.length > 0);
  }, [viewData]);

  const kpiMap = useMemo(() => {
    const map = new Map();
    (kpiCards || []).forEach((k) => map.set(String(k.name), k));
    return map;
  }, [kpiCards]);

  const pickKpi = (name) => {
    const k = kpiMap.get(name);
    const cur = safeNum(k?.cur);
    const prev = safeNum(k?.prev);
    const diff = calcDiff(cur, prev);
    const rate = calcRateFrom(cur, prev);
    return { name, cur, prev, diff, rate };
  };

  const kpi4 = useMemo(() => {
    const a = pickKpi("매출액");
    const op = pickKpi("영업이익");
    const ni = pickKpi("당기순이익");
    const oeRaw = kpiMap.has("영업비용")
      ? pickKpi("영업비용")
      : pickKpi("판매비와일반관리비");
    const oe = { ...oeRaw, name: "영업비용" };

    return [
      { key: "sales", label: "매출액", mode: "profit", ...a },
      { key: "op", label: "영업이익", mode: "profit", ...op },
      { key: "ni", label: "당기순이익", mode: "profit", ...ni },
      { key: "oe", label: "영업비용", mode: "cost", ...oe },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kpiMap]);

  const heroKpi = useMemo(() => pickKpi(activeKpi), [activeKpi, kpiMap]); // eslint-disable-line

  const topDrivers = useMemo(() => {
    const list = (driver?.components || []).slice();
    list.sort(
      (a, b) => Math.abs(safeNum(b.contrib)) - Math.abs(safeNum(a.contrib))
    );
    return list.slice(0, 3);
  }, [driver]);

  const onPickDriver = (component) => {
    setActiveComponent(component);
    setDrillStack([
      { key: joinPath([component]), label: component, parts: [component] },
    ]);
    setChildFilter("");
    setSortMode("absdiff");
  };

  useEffect(() => {
    if (!driver?.components?.length) {
      setActiveComponent(null);
      setDrillStack([]);
      return;
    }
    const top = driver.components
      .slice()
      .sort(
        (a, b) => Math.abs(safeNum(b.contrib)) - Math.abs(safeNum(a.contrib))
      )[0];
    if (!top) return;
    onPickDriver(top.component);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKpi, driver]);

  const currentDrill = drillStack.length
    ? drillStack[drillStack.length - 1]
    : null;
  const isNonOpLevel = currentDrill?.label === "영업외손익";

  const getChildren = useMemo(() => {
    return (prefixParts) => {
      const keyName = prefixParts[prefixParts.length - 1];

      if (keyName === "영업외손익") {
        const backendList = backendDrilldowns?.[keyName];
        if (Array.isArray(backendList) && backendList.length > 0) {
          const names = backendList.map((x) => String(x.name));
          const hasSplit =
            names.includes("영업외수익") || names.includes("영업외비용");
          if (hasSplit) {
            return backendList
              .map((x) => {
                const cur = safeNum(x.cur);
                const prev = safeNum(x.prev);
                return {
                  name: String(x.name),
                  cur,
                  prev,
                  diff: calcDiff(cur, prev),
                  rate: calcRateFrom(cur, prev),
                };
              })
              .slice()
              .sort(
                (a, b) => Math.abs(safeNum(b.diff)) - Math.abs(safeNum(a.diff))
              );
          }
        }

        const a = aggregateRootTotals(flatItems, "영업외수익");
        const b = aggregateRootTotals(flatItems, "영업외비용");
        const out = [];
        if (a) out.push(a);
        if (b) out.push(b);
        if (!out.length) {
          return ["영업외수익", "영업외비용"].map((name) => ({
            name,
            cur: 0,
            prev: 0,
            diff: 0,
            rate: 0,
          }));
        }
        out.sort(
          (x, y) => Math.abs(safeNum(y.diff)) - Math.abs(safeNum(x.diff))
        );
        return out;
      }

      const backendList = backendDrilldowns?.[keyName];
      if (Array.isArray(backendList) && backendList.length > 0) {
        const filtered = backendList.filter(
          (x) => !(keyName === "매출원가계" && String(x?.name) === "매출원가")
        );
        return filtered
          .map((x) => {
            const cur = safeNum(x.cur);
            const prev = safeNum(x.prev);
            return {
              name: String(x.name),
              cur,
              prev,
              diff: calcDiff(cur, prev),
              rate: calcRateFrom(cur, prev),
            };
          })
          .slice()
          .sort(
            (a, b) => Math.abs(safeNum(b.diff)) - Math.abs(safeNum(a.diff))
          );
      }

      if (!flatItems.length) return [];
      const built = buildChildrenFromPathItems(flatItems, prefixParts);
      return built.filter(
        (x) => !(keyName === "매출원가계" && String(x?.name) === "매출원가")
      );
    };
  }, [backendDrilldowns, flatItems]);

  const getHasNext = useMemo(() => {
    return (parts) => {
      const last = parts[parts.length - 1];
      if (last === "영업외손익") return true;
      if (backendDrilldowns?.[last] && backendDrilldowns[last].length > 0)
        return true;
      if (!flatItems.length) return false;
      return hasDeeperLevel(flatItems, parts);
    };
  }, [backendDrilldowns, flatItems]);

  const rawCurrentDrillList = useMemo(() => {
    if (!currentDrill) return [];
    return getChildren(currentDrill.parts);
  }, [currentDrill, getChildren]);

  const parentSummary = useMemo(() => {
    if (!currentDrill) return null;
    if (!rawCurrentDrillList.length)
      return { cur: 0, prev: 0, diff: 0, rate: 0 };
    const cur = rawCurrentDrillList.reduce((a, x) => a + safeNum(x.cur), 0);
    const prev = rawCurrentDrillList.reduce((a, x) => a + safeNum(x.prev), 0);
    const diff = calcDiff(cur, prev);
    const rate = calcRateFrom(cur, prev);
    return { cur, prev, diff, rate };
  }, [currentDrill, rawCurrentDrillList]);

  const drillMaxAbs = useMemo(() => {
    const list = rawCurrentDrillList || [];
    if (!list.length) return 0;
    return Math.max(
      ...list.map((x) => Math.abs(safeNum(calcDiff(x.cur, x.prev))))
    );
  }, [rawCurrentDrillList]);

  const expectedChildren = useMemo(() => {
    if (!currentDrill) return [];
    return PL_TREE[currentDrill.label] || [];
  }, [currentDrill]);

  const availableChildNames = useMemo(
    () => rawCurrentDrillList.map((x) => x.name),
    [rawCurrentDrillList]
  );

  const missingChildren = useMemo(() => {
    const set = new Set(availableChildNames);
    return expectedChildren.filter((n) => !set.has(n));
  }, [expectedChildren, availableChildNames]);
  useEffect(() => {
    console.log("현재 레벨:", currentDrill?.label);
    console.log("expectedChildren:", expectedChildren);
    console.log("availableChildNames:", availableChildNames);
    console.log("missingChildren:", missingChildren);
  }, [currentDrill, expectedChildren, availableChildNames, missingChildren]);

  const currentDrillList = useMemo(() => {
    const list = (rawCurrentDrillList || []).map((x) => {
      const diff = calcDiff(x.cur, x.prev);
      const pd = safeNum(parentSummary?.diff);
      const impact = pd ? (diff / pd) * 100 : 0;
      return { ...x, diff, rate: calcRateFrom(x.cur, x.prev), impact };
    });

    const q = String(childFilter || "")
      .trim()
      .toLowerCase();
    let filtered = q
      ? list.filter((x) => String(x.name).toLowerCase().includes(q))
      : list;

    if (isNonOpLevel) {
      filtered = filtered.filter(
        (x) => x.name !== "영업외수익" && x.name !== "영업외비용"
      );
    }

    return filtered.slice().sort((a, b) => {
      if (sortMode === "impact")
        return Math.abs(safeNum(b.impact)) - Math.abs(safeNum(a.impact));
      if (sortMode === "rate")
        return Math.abs(safeNum(b.rate)) - Math.abs(safeNum(a.rate));
      return Math.abs(safeNum(b.diff)) - Math.abs(safeNum(a.diff));
    });
  }, [rawCurrentDrillList, parentSummary, childFilter, sortMode, isNonOpLevel]);

  const nonOpIncomeList = useMemo(() => {
    if (!isNonOpLevel) return [];
    const parts = [...(currentDrill?.parts || []), "영업외수익"];
    const list = getChildren(parts) || [];
    return list
      .map((x) => ({
        ...x,
        diff: calcDiff(x.cur, x.prev),
        rate: calcRateFrom(x.cur, x.prev),
        __parts: [...parts, x.name],
      }))
      .sort((a, b) => Math.abs(safeNum(b.diff)) - Math.abs(safeNum(a.diff)));
  }, [isNonOpLevel, currentDrill, getChildren]);

  const nonOpCostList = useMemo(() => {
    if (!isNonOpLevel) return [];
    const parts = [...(currentDrill?.parts || []), "영업외비용"];
    const list = getChildren(parts) || [];
    return list
      .map((x) => ({
        ...x,
        diff: calcDiff(x.cur, x.prev),
        rate: calcRateFrom(x.cur, x.prev),
        __parts: [...parts, x.name],
      }))
      .sort((a, b) => Math.abs(safeNum(b.diff)) - Math.abs(safeNum(a.diff)));
  }, [isNonOpLevel, currentDrill, getChildren]);

  const conclusionText = useMemo(() => {
    try {
      return buildSummarySentenceAdvanced({
        activeKpi,
        viewData,
        driver,
        getChildren,
        getHasNext,
      });
    } catch (e) {
      return "요약 문장을 만들 데이터가 없습니다.";
    }
  }, [activeKpi, viewData, driver, getChildren, getHasNext]);

  const kpiTabs = ["영업이익", "당기순이익"];

  return (
    // ✅✅✅ 핵심: 여기서 스크롤 컨테이너를 “강제로” 만든다

    <div
      style={{
        width: "100%",
        height: "100%",
        minHeight: 0,
        overflowY: "auto",
        overflowX: "hidden",
        background: UI.bg,
        padding: 14,
        boxSizing: "border-box",
        flex: "1 1 auto",
      }}
    >
      {!loading && !error && viewData && <KpiStrip items={kpi4} />}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 8,
          width: "100%",
          flexWrap: "nowrap",
          minWidth: 0,
          position: "relative",
          zIndex: 5,
          marginBottom: -4,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 6,
            flexShrink: 0,
            paddingBottom: 2,
          }}
        >
          {kpiTabs.map((k) => (
            <IndexTab
              key={k}
              label={k}
              active={activeKpi === k}
              onClick={() => setActiveKpi(k)}
            />
          ))}
        </div>
      </div>
      {loading && (
        <div style={{ fontSize: 12, color: UI.sub, fontWeight: 800 }}>
          불러오는 중...
        </div>
      )}
      {error && !loading && (
        <div style={{ fontSize: 12, color: UI.red, fontWeight: 900 }}>
          {error}
        </div>
      )}
      {!loading && !error && viewData && (
        <>
          <div style={{ marginBottom: 12 }}>
            <div style={{ marginBottom: 12 }}>
              <KpiHeader
                activeKpi={activeKpi}
                kpi={heroKpi}
                topDrivers={topDrivers}
                kpiDiff={safeNum(driver?.kpi_diff)}
                activeComponent={activeComponent}
                onPickDriver={onPickDriver}
                conclusionText={conclusionText}
              />
            </div>
          </div>

          <Card
            title={
              drillStack.length
                ? `세부 요인 — ${drillStack[drillStack.length - 1].label}`
                : "세부 요인"
            }
            style={{ paddingTop: 18 }}
          >
            {!drillStack.length ? (
              <div style={{ fontSize: 12, color: UI.sub, lineHeight: 1.7 }}>
                상단의 <b style={{ color: UI.text }}>TOP3</b>를 클릭하면, 해당
                항목부터 <b style={{ color: UI.text }}>전월→당월 변화</b>를
                드릴다운으로 추적합니다.
              </div>
            ) : rawCurrentDrillList.length === 0 ? (
              <div style={{ fontSize: 12, color: UI.sub, lineHeight: 1.7 }}>
                이 레벨에서 하위 데이터가 없습니다.
              </div>
            ) : (
              <>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    alignItems: "center",
                    marginBottom: 10,
                  }}
                >
                  <input
                    value={childFilter}
                    onChange={(e) => setChildFilter(e.target.value)}
                    placeholder="항목 검색"
                    style={{
                      flex: 1,
                      minWidth: 220,
                      padding: "10px 12px",
                      borderRadius: UI.radiusLg,
                      border: `1px solid ${UI.line}`,
                      background: "#fff",
                      outline: "none",
                      fontWeight: 800,
                      fontSize: 12,
                      color: UI.text,
                      boxShadow: "inset 0 1px 0 rgba(15,23,42,0.03)",
                    }}
                  />

                  <select
                    value={sortMode}
                    onChange={(e) => setSortMode(e.target.value)}
                    style={{
                      padding: "10px 12px",
                      borderRadius: UI.radiusLg,
                      border: `1px solid ${UI.line}`,
                      background: "#fff",
                      fontWeight: 800,
                      fontSize: 12,
                      color: UI.text,
                      outline: "none",
                    }}
                  >
                    <option value="absdiff">금액</option>
                    <option value="impact">영향도</option>
                    <option value="rate">%</option>
                  </select>

                  {isNonOpLevel && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        type="button"
                        onClick={() =>
                          setNonOpOpen({ 영업외수익: true, 영업외비용: true })
                        }
                        style={{
                          padding: "10px 12px",
                          borderRadius: UI.radiusLg,
                          border: `1px solid ${UI.line}`,
                          background: "#fff",
                          fontWeight: 900,
                          fontSize: 12,
                          color: UI.text,
                          cursor: "pointer",
                        }}
                      >
                        둘다 펼치기
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setNonOpOpen({ 영업외수익: false, 영업외비용: false })
                        }
                        style={{
                          padding: "10px 12px",
                          borderRadius: UI.radiusLg,
                          border: `1px solid ${UI.line}`,
                          background: "#fff",
                          fontWeight: 900,
                          fontSize: 12,
                          color: UI.text,
                          cursor: "pointer",
                        }}
                      >
                        둘다 접기
                      </button>
                    </div>
                  )}
                </div>

                <div
                  style={{
                    border: `1px solid ${UI.line}`,
                    borderRadius: UI.radiusLg,
                    overflow: "hidden",
                    background: "#fff",
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "1.2fr 0.7fr 0.7fr 0.9fr 0.7fr 0.6fr",
                      background: "rgba(15,23,42,0.03)",
                      padding: "10px 12px",
                      fontSize: 11,
                      fontWeight: 900,
                      color: UI.sub,
                    }}
                  >
                    <div>항목</div>
                    <div style={{ textAlign: "right" }}>%</div>
                    <div style={{ textAlign: "right" }}>영향도</div>
                    <div style={{ textAlign: "right" }}>금액</div>
                    <div style={{ textAlign: "right" }}>전월</div>
                    <div style={{ textAlign: "right" }}>당월</div>
                  </div>

                  {currentDrillList.map((x) => {
                    const nextParts = [...(currentDrill?.parts || []), x.name];
                    const hasNext = getHasNext(nextParts);

                    const diff = calcDiff(x.cur, x.prev);
                    const rowMode = isCostLikeLabel(x.name) ? "cost" : "profit";

                    return (
                      <div
                        key={joinPath(nextParts)}
                        onClick={() => {
                          if (!hasNext) return;
                          setDrillStack([
                            ...drillStack,
                            {
                              key: joinPath(nextParts),
                              label: x.name,
                              parts: nextParts,
                            },
                          ]);
                          setChildFilter("");
                          setSortMode("absdiff");
                        }}
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "1.2fr 0.7fr 0.7fr 0.9fr 0.7fr 0.6fr",
                          padding: "12px 12px",
                          borderTop: `1px solid ${UI.line}`,
                          background: hasNext ? "#fff" : "rgba(15,23,42,0.01)",
                          cursor: hasNext ? "pointer" : "default",
                          alignItems: "center",
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              alignItems: "center",
                            }}
                          >
                            <div
                              style={{
                                fontSize: 12,
                                fontWeight: 900,
                                color: UI.text,
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                              title={x.name}
                            >
                              {x.name}
                            </div>

                            {hasNext && (
                              <Pill tone="gray" style={{ fontSize: 10 }}>
                                드릴다운
                              </Pill>
                            )}
                          </div>

                          <div style={{ marginTop: 8 }}>
                            <BarMeter
                              value={diff}
                              maxAbs={drillMaxAbs || 1}
                              mode={rowMode}
                            />
                          </div>
                        </div>

                        <div style={{ textAlign: "right" }}>
                          <RateBadge
                            value={calcRateFrom(x.cur, x.prev)}
                            toneValue={diff}
                            mode={rowMode}
                          />
                        </div>

                        <div style={{ textAlign: "right" }}>
                          {(() => {
                            const ii = safeNum(x.impact);
                            const tone = impactTone(ii, parentSummary?.diff);
                            const cc =
                              tone === "blue" ? pickBlue() : pickGray();
                            const parentZero =
                              Math.abs(safeNum(parentSummary?.diff)) < 1e-9;

                            return (
                              <span
                                style={{
                                  display: "inline-flex",
                                  padding: "6px 10px",
                                  borderRadius: UI.radius,
                                  border: `1px solid ${cc.bd}`,
                                  background: cc.bg,
                                  color: cc.fg,
                                  fontSize: 13,
                                  fontWeight: 900,
                                  ...UI.mono,
                                  whiteSpace: "nowrap",
                                }}
                                title={
                                  parentZero
                                    ? "상위 변화=0 → 영향도 의미 없음"
                                    : "상위 변화 대비 비중"
                                }
                              >
                                {parentZero ? "—" : formatRate(ii)}
                              </span>
                            );
                          })()}
                        </div>

                        <div style={{ textAlign: "right" }}>
                          <AmountBadge
                            value={diff}
                            mode={rowMode}
                            style={{ fontSize: 12 }}
                          />
                        </div>

                        <div
                          style={{
                            textAlign: "right",
                            fontSize: 12,
                            fontWeight: 800,
                            color: UI.sub,
                            ...UI.mono,
                          }}
                        >
                          {formatNumber(safeNum(x.prev))}
                        </div>

                        <div
                          style={{
                            textAlign: "right",
                            fontSize: 12,
                            fontWeight: 800,
                            color: UI.sub,
                            ...UI.mono,
                          }}
                        >
                          {formatNumber(safeNum(x.cur))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {isNonOpLevel && (
                  <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                    <NonOpSection
                      title="영업외수익"
                      isOpen={!!nonOpOpen?.영업외수익}
                      onToggle={() =>
                        setNonOpOpen((p) => ({
                          ...p,
                          영업외수익: !p?.영업외수익,
                        }))
                      }
                      list={nonOpIncomeList}
                      getHasNext={(parts) => getHasNext(parts)}
                      onDrillTo={(parts) => {
                        setDrillStack([
                          ...drillStack,
                          {
                            key: joinPath(parts),
                            label: parts[parts.length - 1],
                            parts,
                          },
                        ]);
                        setChildFilter("");
                        setSortMode("absdiff");
                      }}
                    />

                    <NonOpSection
                      title="영업외비용"
                      isOpen={!!nonOpOpen?.영업외비용}
                      onToggle={() =>
                        setNonOpOpen((p) => ({
                          ...p,
                          영업외비용: !p?.영업외비용,
                        }))
                      }
                      list={nonOpCostList}
                      getHasNext={(parts) => getHasNext(parts)}
                      onDrillTo={(parts) => {
                        setDrillStack([
                          ...drillStack,
                          {
                            key: joinPath(parts),
                            label: parts[parts.length - 1],
                            parts,
                          },
                        ]);
                        setChildFilter("");
                        setSortMode("absdiff");
                      }}
                    />
                  </div>
                )}

                {missingChildren.length > 0 && (
                  <div
                    style={{
                      marginTop: 12,
                      borderRadius: UI.radiusLg,
                      border: "1px solid rgba(245,158,11,0.26)",
                      background: UI.amberBg,
                      padding: 14,
                      fontSize: 12,
                      fontWeight: 900,
                      color: "#92400E",
                    }}
                  >
                    누락 가능: {missingChildren.join(", ")}
                  </div>
                )}
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
