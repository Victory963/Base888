/// <reference types="vite/client" />

interface Base888AppConfig {
  BACKEND_URL: string;
  SDK_BACKEND_URL: string;
  WS_BACKEND_URL: string;
  PLATFORM_URL: string;
  APPS_BASE_DOMAIN: string;
  TURNSTILE_SITE_KEY: string;
  TURNSTILE_ENABLED: string;
  GOOGLE_CLIENT_ID: string;
  APP_FLAVOR: string;
  GIT_SHA: string;
  PRE_AUTH_FLAGS: Record<string, boolean>;
  PRE_AUTH_EXPERIMENTS: {
    visitor_id: string;
    assignments: Record<string, { variant: string; version: number }>;
    overrides: Record<string, unknown>;
  };
}

interface Window {
  __APP_CONFIG__?: Base888AppConfig;
}
