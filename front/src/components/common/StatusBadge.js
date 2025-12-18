const StatusBadge = ({ status }) => {
  let bg = "#e5e7eb";
  let txt = "#374151";
  let label = "확인";

  if (status === "issue") {
    // 누락 의심
    bg = "rgba(239, 68, 68, 0.08)";
    txt = "#b91c1c";
    label = "누락 의심";
  } else if (status === "check") {
    // 점검 필요
    bg = "rgba(245, 158, 11, 0.12)";
    txt = "#92400e";
    label = "점검 필요";
  } else if (status === "ok") {
    bg = "rgba(16, 185, 129, 0.12)";
    txt = "#047857";
    label = "정상";
  }

  return (
    <span
      style={{
        fontSize: 11,
        padding: "2px 6px",
        borderRadius: 999,
        backgroundColor: bg,
        color: txt,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
};
