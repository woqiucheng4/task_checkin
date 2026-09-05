export const DESIGN_TOKENS = {
  color: {
    danger: "#B9362C",
    familyBlue: "#256A92",
    focus: "#235F36",
    forest: "#174E2A",
    ink: "#20231E",
    inkMuted: "#6F7068",
    leaf: "#6E923C",
    line: "#DED8C9",
    paper: "#FAF7EE",
    paperRaised: "#FFFDF7",
    sproutTint: "#EEF3DE",
    sun: "#F2A326",
    tomato: "#D93A22",
  },
  elevation: {
    flat: "none",
    overlay: "0 18px 52px rgba(41, 52, 34, 0.18)",
    raised: "0 8px 28px rgba(41, 52, 34, 0.09)",
  },
  motion: {
    celebration: 900,
    fast: 150,
    normal: 240,
    reduced: 0,
  },
  radius: {
    control: 12,
    panel: 16,
    round: 999,
    sheet: 24,
  },
  spacing: {
    x1: 4,
    x2: 8,
    x3: 12,
    x4: 16,
    x5: 20,
    x6: 24,
    x8: 32,
    x10: 40,
    x12: 48,
  },
  type: {
    body: 16,
    caption: 13,
    display: 44,
    label: 14,
    metric: 38,
    title: 28,
  },
} as const;

export const AGE_DENSITY = {
  LOWER_PRIMARY: {
    bodyRpx: 30,
    heroHeightRpx: 620,
    label: "低年级",
    taskGapRpx: 28,
    taskTargetRpx: 104,
    titleRpx: 58,
  },
  UPPER_PRIMARY: {
    bodyRpx: 28,
    heroHeightRpx: 500,
    label: "高年级",
    taskGapRpx: 18,
    taskTargetRpx: 88,
    titleRpx: 48,
  },
} as const;

export type AgeDensityMode = keyof typeof AGE_DENSITY;
