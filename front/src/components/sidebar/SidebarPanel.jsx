// src/components/sidebar/SidebarPanel.jsx
import React, { useMemo } from "react";

export default function SidebarPanel({
  sideMenus,
  tab,
  setTab,

  SIDEBAR_ICON_WIDTH,
  SIDEBAR_PANEL_WIDTH,

  BRAND_DARK,

  // refs
  costFileInputRef,
  plFileInputRef,

  // status labels
  costStatusLabel,
  plStatusLabel,
  costIconStatus,
  plIconStatus,

  // pending files
  pendingCostFile,
  pendingPlFile,

  // handlers
  handleConfirmCostUpload,
  handleCancelPendingCostFile,
  costUploading,

  handleConfirmPlUpload,
  handleCancelPendingPlFile,
  plUploading,
}) {
  // ✅ SidebarIcons와 동일한 merge 로직(미래결산시나리오: 내부요인/외부요인)
  const normalizeMenus = (menus) => {
    const arr = Array.isArray(menus) ? menus.filter(Boolean) : [];

    const findById = (id) => arr.find((m) => m?.id === id);
    const findFxMenu = () => {
      const candidates = [
        "fxTariffCompare",
        "FxTariffCompare",
        "fx_tariff_compare",
        "fxTariff",
        "tariffCompare",
        "fxCompare",
      ];
      for (const id of candidates) {
        const hit = findById(id);
        if (hit) return hit;
      }
      return arr.find((m) => {
        const id = String(m?.id || "").toLowerCase();
        const lb = String(m?.label || "").toLowerCase();
        const dc = String(m?.desc || "").toLowerCase();
        return (
          (id.includes("fx") && id.includes("tariff")) ||
          (lb.includes("fx") && lb.includes("tariff")) ||
          (dc.includes("fx") && dc.includes("tariff")) ||
          lb.includes("관세") ||
          lb.includes("환율")
        );
      });
    };

    const forecastMenu = findById("forecast");
    const fxMenu = findFxMenu();

    if (forecastMenu && fxMenu) {
      const mergedParent = {
        ...forecastMenu,
        id: "forecast_scenario",
        label: "Forcast",
        desc: forecastMenu.desc || "Forecast & External",
        children: [
          {
            ...forecastMenu,
            id: "forecast",
            label: "내부 요인",
            desc: "ForecastTab",
          },
          {
            ...fxMenu,
            id: fxMenu.id,
            label: "외부 요인",
            desc: "FxTariffCompareTab",
          },
        ],
      };

      const filtered = arr.filter(
        (m) => m?.id !== forecastMenu.id && m?.id !== fxMenu.id
      );

      const fIdx = arr.findIndex((m) => m?.id === forecastMenu.id);
      const insertIdx =
        fIdx >= 0 ? Math.min(fIdx, filtered.length) : filtered.length;

      const out = [...filtered];
      out.splice(insertIdx, 0, mergedParent);
      return out;
    }

    return arr;
  };

  const isChildActive = (m) => {
    if (!m) return false;
    if (tab === m.id) return true;
    const kids = Array.isArray(m.children) ? m.children : [];
    return kids.some((c) => c?.id === tab);
  };

  const safeMenus = useMemo(() => {
    return normalizeMenus(sideMenus).filter(
      (m) => !!m && typeof m === "object"
    );
  }, [sideMenus]);

  const MenuButton = ({
    label,
    desc,
    active,
    onClick,
    indent = 0,
    isChild = false,
  }) => {
    return (
      <button
        type="button"
        onClick={onClick}
        style={{
          border: "none",
          textAlign: "left",
          padding: isChild ? "6px 8px" : "8px 10px",
          borderRadius: 10,
          cursor: "pointer",
          backgroundColor: active
            ? isChild
              ? "#eef2ff"
              : "#f1f5f9"
            : "transparent",
          color: active ? BRAND_DARK : isChild ? "#64748b" : "#475569",
          position: "relative",
        }}
        onMouseEnter={(e) => {
          if (!active)
            e.currentTarget.style.backgroundColor = isChild
              ? "#f8fafc"
              : "#f1f5f9";
        }}
        onMouseLeave={(e) => {
          if (!active) e.currentTarget.style.backgroundColor = "transparent";
        }}
      >
        {active && !isChild && (
          <span
            style={{
              position: "absolute",
              left: 4,
              top: 8,
              bottom: 8,
              width: 3,
              borderRadius: 999,
              backgroundColor: "#1e40af",
            }}
          />
        )}

        {isChild && (
          <span
            style={{
              position: "absolute",
              left: indent - 6,
              top: "50%",
              width: 4,
              height: 4,
              borderRadius: 999,
              backgroundColor: active ? "#6366f1" : "#c7d2fe",
              transform: "translateY(-50%)",
            }}
          />
        )}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            paddingLeft: indent,
          }}
        >
          <span
            style={{
              fontSize: isChild ? 11 : 12,
              fontWeight: active ? 700 : 600,
            }}
          >
            {label}
          </span>

          {!isChild && desc && (
            <span
              style={{
                fontSize: 10,
                color: "#94a3b8",
                fontWeight: 600,
              }}
            >
              {desc}
            </span>
          )}
        </div>
      </button>
    );
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        bottom: 0,
        left: SIDEBAR_ICON_WIDTH,
        width: SIDEBAR_PANEL_WIDTH - SIDEBAR_ICON_WIDTH,
        backgroundColor: "#ffffff",
        borderRight: "1px solid #e5e7eb",
        boxSizing: "border-box",
        padding: "16px 14px",
        display: "flex",
        flexDirection: "column",
        opacity: 1,
        transform: "translateX(0)",
        pointerEvents: "auto",
        transition: "none",
        zIndex: 25,
        fontSize: 11,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: 34,
          marginBottom: 14,
          paddingLeft: 2,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span
            style={{
              fontSize: 14,
              fontWeight: 900,
              letterSpacing: 1,
              color: BRAND_DARK,
            }}
          >
            ILJI TECH
          </span>
          <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600 }}>
            AI Closing Monitor
          </span>
        </div>
      </div>

      <nav
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 7,
          marginBottom: 12,
          marginTop: 10,
        }}
      >
        {safeMenus.map((m) => {
          const kids = Array.isArray(m.children) ? m.children : [];
          const parentActive = isChildActive(m);

          return (
            <React.Fragment key={m.id}>
              {kids.length === 0 ? (
                <MenuButton
                  label={m.label}
                  desc={m.desc}
                  active={tab === m.id}
                  onClick={() => setTab(m.id)}
                />
              ) : (
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 4 }}
                >
                  <MenuButton
                    label={m.label}
                    desc={m.desc}
                    active={parentActive}
                    onClick={() => setTab(kids[0].id)} // ✅ 내부요인(=forecast)로 이동
                  />

                  <div
                    style={{ display: "flex", flexDirection: "column", gap: 4 }}
                  >
                    {kids.map((c) => {
                      const active = tab === c.id;
                      return (
                        <MenuButton
                          key={c.id}
                          label={c.label}
                          desc={c.desc}
                          active={active}
                          onClick={() => setTab(c.id)}
                          indent={14}
                          isChild={true}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </nav>

      {/* 업로드 영역 (원래 있던거 그대로 이어서 쓰면 됨) */}
    </div>
  );
}
