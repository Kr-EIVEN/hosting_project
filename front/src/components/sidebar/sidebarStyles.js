// src/components/sidebar/sidebarStyles.js

export const getIconStyle = (status) => {
  let bg = "#E5E7EB";
  let border = "#9CA3AF";
  let color = "#374151";

  if (status === "pending") {
    bg = "#DBEAFE";
    border = "#3B82F6";
    color = "#1D4ED8";
  } else if (status === "uploading") {
    bg = "#FEF3C7";
    border = "#F59E0B";
    color = "#C2410C";
  } else if (status === "uploaded") {
    bg = "#DCFCE7";
    border = "#22C55E";
    color = "#15803D";
  }
  return { bg, border, color };
};

export const chipBase = {
  fontSize: 10,
  fontWeight: 800,
  padding: "6px 10px",
  borderRadius: 999,
  background: "rgba(248,250,252,0.85)",
  border: "1px solid rgba(15,23,42,0.10)",
  color: "#0f172a",
  boxShadow: "0 4px 10px rgba(15,23,42,0.06)",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
};
