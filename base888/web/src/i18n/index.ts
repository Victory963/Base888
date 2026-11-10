import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// Mirrors Base44's i18n module: an i18next instance with lazy namespace-style
// resources. Base888 ships English + a small Chinese set to show the shape.

export const resources = {
  en: {
    translation: {
      "app.tagline": "Build useful apps, fast with Base888.",
      "auth.signIn": "Sign in",
      "auth.email": "Email",
      "auth.password": "Password",
      "auth.continueWith": "Continue with {{provider}}",
      "nav.dashboard": "Dashboard",
      "nav.signOut": "Sign out",
      "dash.yourApps": "Your apps",
      "dash.newApp": "New app",
      "editor.title": "App editor",
      "editor.preview": "Preview"
    }
  },
  zh: {
    translation: {
      "app.tagline": "用 Base888 快速搭建实用应用。",
      "auth.signIn": "登录",
      "auth.email": "邮箱",
      "auth.password": "密码",
      "auth.continueWith": "使用 {{provider}} 继续",
      "nav.dashboard": "工作台",
      "nav.signOut": "退出登录",
      "dash.yourApps": "你的应用",
      "dash.newApp": "新建应用",
      "editor.title": "应用编辑器",
      "editor.preview": "预览"
    }
  }
} as const;

export function initI18n(lang = "en") {
  if (!i18n.isInitialized) {
    void i18n.use(initReactI18next).init({
      resources,
      lng: lang,
      fallbackLng: "en",
      interpolation: { escapeValue: false }
    });
  }
  return i18n;
}

export default i18n;
