import { useMemo } from "react";

// Reconstruction of Base44's useDesignSystem: exposes design tokens and the
// active theme to components (Base44 keyed these off the workspace/app).
export interface DesignTokens {
  radius: number;
  accent: string;
  accent2: string;
  theme: "dark" | "light";
}

export function useDesignSystem(theme: "dark" | "light" = "dark"): DesignTokens {
  return useMemo(
    () => ({
      radius: 10,
      accent: "#5b8cff",
      accent2: "#7affc6",
      theme
    }),
    [theme]
  );
}
