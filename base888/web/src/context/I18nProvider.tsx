import { type ReactNode, useMemo } from "react";
import { I18nextProvider } from "react-i18next";
import { initI18n } from "@/i18n";

// Reconstruction of Base44's I18nProvider wrapper.
export function I18nProvider({ children, lang = "en" }: { children: ReactNode; lang?: string }) {
  const i18n = useMemo(() => initI18n(lang), [lang]);
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
