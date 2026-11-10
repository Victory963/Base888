import axios, { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from "axios";
import { appConfig } from "@/config/appConfig";

// Reconstruction of Base44's axiosClient: Bearer auth, credentialed requests,
// a per-request correlation id, active-workspace / active-app headers, the
// builder-model-selection header, and a single-flight refresh on 401.

const ACCESS_TOKEN_KEY = "base888.access_token";

let activeWorkspaceId: string | null = null;
let activeAppId: string | null = null;
let socketId: string | null = null;
let builderModel: string | null = null;

export const session = {
  getAccessToken: () => {
    try { return localStorage.getItem(ACCESS_TOKEN_KEY); } catch { return null; }
  },
  setAccessToken: (t: string | null) => {
    try { t ? localStorage.setItem(ACCESS_TOKEN_KEY, t) : localStorage.removeItem(ACCESS_TOKEN_KEY); } catch { /* ignore */ }
  },
  setActiveWorkspace: (id: string | null) => { activeWorkspaceId = id; },
  setActiveApp: (id: string | null) => { activeAppId = id; },
  setSocketId: (id: string | null) => { socketId = id; },
  setBuilderModel: (m: string | null) => { builderModel = m; }
};

function requestId(): string {
  try { return crypto.randomUUID(); } catch { return `rid-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
}

export const apiClient = axios.create({
  baseURL: appConfig.BACKEND_URL || "",
  withCredentials: true,
  headers: { "Content-Type": "application/json" }
});

apiClient.interceptors.request.use((cfg: InternalAxiosRequestConfig) => {
  const headers = AxiosHeaders.from(cfg.headers);
  const token = session.getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  headers.set("X-Request-ID", requestId());
  headers.set("X-Origin-URL", typeof location !== "undefined" ? location.href : "");
  if (activeWorkspaceId) headers.set("X-Active-Workspace-Id", activeWorkspaceId);
  else headers.set("X-Skip-Active-Workspace", "true");
  if (activeAppId) headers.set("X-Active-App-Id", activeAppId);
  if (socketId) headers.set("X-Socket-Id", socketId);
  if (builderModel) headers.set("X-Builder-Model-Selection", builderModel);
  cfg.headers = headers;
  return cfg;
});

// Single-flight refresh: queue concurrent 401s behind one /auth/refresh call.
let refreshing: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  try {
    const res = await axios.post(
      `${appConfig.BACKEND_URL || ""}/auth/refresh`,
      {},
      { withCredentials: true }
    );
    const token = (res.data && (res.data.access_token as string)) || null;
    session.setAccessToken(token);
    return token;
  } catch {
    session.setAccessToken(null);
    return null;
  }
}

apiClient.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    const status = error.response?.status;
    if (status === 401 && original && !original._retried && !original.url?.includes("/auth/")) {
      original._retried = true;
      refreshing = refreshing ?? doRefresh();
      const token = await refreshing;
      refreshing = null;
      if (token) {
        const headers = AxiosHeaders.from(original.headers);
        headers.set("Authorization", `Bearer ${token}`);
        original.headers = headers;
        return apiClient.request(original);
      }
    }
    const code = (error.response?.headers?.["x-error-code"] as string) || undefined;
    return Promise.reject(Object.assign(error, { errorCode: code }));
  }
);
