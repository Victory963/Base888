// Mirrors Base44's `window.__APP_CONFIG__` (served by /api/frontend-config.js).
// Base888 uses its own domains/tokens — these are local-mock placeholders,
// not Base44's values.

const FALLBACK: Base888AppConfig = {
  BACKEND_URL: "",
  SDK_BACKEND_URL: "",
  WS_BACKEND_URL: "ws://localhost:4489",
  PLATFORM_URL: "http://localhost:5888",
  APPS_BASE_DOMAIN: "base888.local",
  TURNSTILE_SITE_KEY: "0xB888_DEV_SITE_KEY",
  TURNSTILE_ENABLED: "false",
  GOOGLE_CLIENT_ID: "base888-dev.apps.example.com",
  APP_FLAVOR: "platform",
  GIT_SHA: "dev",
  PRE_AUTH_FLAGS: { "launchpad-multi-contests": true },
  PRE_AUTH_EXPERIMENTS: { visitor_id: "dev", assignments: {}, overrides: {} }
};

export const appConfig: Base888AppConfig = {
  ...FALLBACK,
  ...(typeof window !== "undefined" && window.__APP_CONFIG__ ? window.__APP_CONFIG__ : {})
};

export const isTurnstileEnabled = appConfig.TURNSTILE_ENABLED === "true";
