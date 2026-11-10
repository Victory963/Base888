import { apiClient } from "./axiosClient";

export const accountApi = {
  credits: () => apiClient.get<{ credits: number }>("/api/credits").then((r) => r.data.credits),
  models: () => apiClient.get<{ models: string[]; current: string; provider: string }>("/api/models").then((r) => r.data),
  mfaStatus: () => apiClient.get<{ enabled: boolean }>("/auth/mfa/status").then((r) => r.data.enabled),
  mfaSetup: () => apiClient.post<{ secret: string; otpauth_url: string }>("/auth/mfa/setup", {}).then((r) => r.data),
  mfaEnable: (code: string) => apiClient.post<{ enabled: boolean }>("/auth/mfa/enable", { code }).then((r) => r.data),
  mfaDisable: (code: string) => apiClient.post<{ enabled: boolean }>("/auth/mfa/disable", { code }).then((r) => r.data)
};
