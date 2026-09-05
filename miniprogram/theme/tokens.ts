import { DESIGN_TOKENS } from "../../src/presentation/design-tokens.js";

export const COLOR_ROLES = [
  "page",
  "surface",
  "surfaceRaised",
  "textPrimary",
  "textSecondary",
  "accent",
  "success",
  "warning",
  "danger",
  "focusRing",
] as const;

export type ColorRole = (typeof COLOR_ROLES)[number];

export interface ThemeTokens {
  readonly colors: Readonly<Record<ColorRole, string>>;
  readonly spacing: Readonly<Record<"xs" | "sm" | "md" | "lg" | "xl", number>>;
  readonly typeScale: Readonly<Record<"caption" | "body" | "title" | "display", number>>;
  readonly radius: Readonly<Record<"sm" | "md" | "lg" | "round", number>>;
  readonly elevation: Readonly<Record<"flat" | "raised" | "overlay", number>>;
  readonly motionMs: Readonly<Record<"instant" | "fast" | "normal" | "celebration", number>>;
}

export type ThemeTokenResolver = (role: ColorRole) => string;

export const ORCHARD_THEME: ThemeTokens = {
  colors: {
    accent: DESIGN_TOKENS.color.tomato,
    danger: DESIGN_TOKENS.color.danger,
    focusRing: DESIGN_TOKENS.color.focus,
    page: DESIGN_TOKENS.color.paper,
    success: DESIGN_TOKENS.color.forest,
    surface: DESIGN_TOKENS.color.paperRaised,
    surfaceRaised: DESIGN_TOKENS.color.sproutTint,
    textPrimary: DESIGN_TOKENS.color.ink,
    textSecondary: DESIGN_TOKENS.color.inkMuted,
    warning: DESIGN_TOKENS.color.sun,
  },
  elevation: { flat: 0, overlay: 2, raised: 1 },
  motionMs: {
    celebration: DESIGN_TOKENS.motion.celebration,
    fast: DESIGN_TOKENS.motion.fast,
    instant: DESIGN_TOKENS.motion.reduced,
    normal: DESIGN_TOKENS.motion.normal,
  },
  radius: {
    lg: DESIGN_TOKENS.radius.sheet,
    md: DESIGN_TOKENS.radius.panel,
    round: DESIGN_TOKENS.radius.round,
    sm: DESIGN_TOKENS.radius.control,
  },
  spacing: {
    lg: DESIGN_TOKENS.spacing.x6,
    md: DESIGN_TOKENS.spacing.x4,
    sm: DESIGN_TOKENS.spacing.x2,
    xl: DESIGN_TOKENS.spacing.x10,
    xs: DESIGN_TOKENS.spacing.x1,
  },
  typeScale: {
    body: DESIGN_TOKENS.type.body,
    caption: DESIGN_TOKENS.type.caption,
    display: DESIGN_TOKENS.type.display,
    title: DESIGN_TOKENS.type.title,
  },
};
