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
