import { apiClient, session } from "./axiosClient";

// Reconstruction of Base44's AuthAPI. Endpoint names mirror the observed
// surface: /auth/login, /auth/refresh, /auth/{github,apple}/login,
// /auth/oidc/login, /auth/sso/login, /auth/sso/my-tokens.

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: "user" | "admin";
  created_date: string;
}

export type OAuthProvider = "google" | "github" | "apple" | "oidc";

export const authApi = {
  async login(email: string, password: string, turnstileToken?: string): Promise<User> {
    const res = await apiClient.post("/auth/login", { email, password, turnstile_token: turnstileToken });
    session.setAccessToken(res.data.access_token);
    return res.data.user as User;
  },

  async register(email: string, fullName: string, password: string, turnstileToken?: string): Promise<User> {
    const res = await apiClient.post("/auth/register", { email, full_name: fullName, password, turnstile_token: turnstileToken });
    session.setAccessToken(res.data.access_token);
    return res.data.user as User;
  },

  async me(): Promise<User> {
    const res = await apiClient.get("/api/me");
    return res.data as User;
  },

  async refresh(): Promise<string | null> {
    const res = await apiClient.post("/auth/refresh", {});
    const token = (res.data?.access_token as string) ?? null;
    session.setAccessToken(token);
    return token;
  },

  oauthStartUrl(provider: OAuthProvider): string {
    return `/auth/${provider}/login`;
  },

  async ssoTokens(): Promise<{ tokens: Array<{ id: string; name: string; last_used: string }> }> {
    const res = await apiClient.get("/auth/sso/my-tokens");
    return res.data;
  },

  async logout(): Promise<void> {
    try { await apiClient.post("/api/auth/oidc/logout", {}); } finally { session.setAccessToken(null); }
  }
};
