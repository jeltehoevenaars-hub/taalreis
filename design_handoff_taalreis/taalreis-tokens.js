export const T = {
  bg: "#FAF8F5",
  surface: "#FFFFFF",
  border: "#E8E2D9",
  accent: "#C4714A",
  accentLight: "#FFF8F5",
  accentMid: "#E8C4B0",
  text: "#1A1714",
  textSec: "#6B6560",
  success: "#4A7C59",
  successLight: "#F0F7F2",
  neutral: "#D4CEC6",
  neutralLight: "#F5F2EE",
  font: "var(--font-outfit, 'Outfit', sans-serif)",
  fw: { reg: 400, med: 500, semi: 600 },
  fs: { xs: 11, sm: 13, base: 15, md: 16, lg: 20, xl: 24 },
  radius: { sm: 6, md: 10, lg: 14, pill: 999 },
  pad: { card: "18px 22px", btn: "0 18px", tag: "3px 12px" },
  shadow: {
    sm: "0 1px 3px rgba(26,23,20,0.07)",
    md: "0 4px 16px rgba(26,23,20,0.09)"
  },
  trans: "all 0.18s ease"
};

export const S = {
  card: (extra = {}) => ({
    background: T.surface,
    border: `1px solid ${T.border}`,
    borderRadius: T.radius.md,
    padding: T.pad.card,
    boxShadow: T.shadow.sm,
    ...extra
  }),
  btn: (variant = "default", extra = {}) => ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 38,
    padding: T.pad.btn,
    borderRadius: T.radius.sm,
    fontFamily: T.font,
    fontSize: T.fs.sm,
    fontWeight: T.fw.med,
    cursor: "pointer",
    transition: T.trans,
    whiteSpace: "nowrap",
    border:
      variant === "primary"
        ? "none"
        : variant === "ghost"
          ? `1.5px dashed ${T.accent}`
          : `1px solid ${T.border}`,
    background:
      variant === "primary"
        ? T.accent
        : variant === "ghost"
          ? T.accentLight
          : T.surface,
    color:
      variant === "primary"
        ? "#fff"
        : variant === "ghost"
          ? T.accent
          : T.text,
    boxShadow: variant === "primary" ? T.shadow.sm : "none",
    ...extra
  }),
  input: (extra = {}) => ({
    border: `1px solid ${T.border}`,
    borderRadius: T.radius.sm,
    height: 38,
    padding: "0 12px",
    fontFamily: T.font,
    fontSize: T.fs.sm,
    color: T.text,
    background: T.surface,
    outline: "none",
    transition: T.trans,
    width: "100%",
    ...extra
  }),
  tag: (variant = "accent", extra = {}) => ({
    display: "inline-flex",
    alignItems: "center",
    borderRadius: T.radius.pill,
    padding: T.pad.tag,
    fontSize: T.fs.xs,
    fontWeight: T.fw.med,
    border:
      variant === "accent"
        ? `1.5px solid ${T.accent}`
        : `1px solid ${T.border}`,
    background: variant === "accent" ? T.accentLight : T.neutralLight,
    color: variant === "accent" ? T.accent : T.textSec,
    ...extra
  }),
  progress: {
    height: 5,
    background: T.neutral,
    borderRadius: T.radius.pill,
    overflow: "hidden"
  },
  progressFill: (pct) => ({
    height: "100%",
    width: `${pct}%`,
    background: T.accent,
    borderRadius: T.radius.pill,
    transition: T.trans
  })
};

export const cssVars = {
  "--bg": T.bg,
  "--surface": T.surface,
  "--border": T.border,
  "--accent": T.accent,
  "--accent-light": T.accentLight,
  "--accent-mid": T.accentMid,
  "--text": T.text,
  "--text-sec": T.textSec,
  "--success": T.success,
  "--success-light": T.successLight,
  "--neutral": T.neutral,
  "--neutral-light": T.neutralLight,
  "--shadow-sm": T.shadow.sm,
  "--shadow-md": T.shadow.md,
  "--trans": T.trans
};
