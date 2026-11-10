import { apiClient, session } from "@/api/axiosClient";
import { authApi, type User } from "@/api/authApi";

// Base888 SDK — a clean-room reimplementation of the Base44 SDK surface:
//   client.auth.*          authentication
//   client.entities.<Name> CRUD over app data entities
//   client.integrations.*  server-side integrations (LLM, email, files)
//   client.functions.*     user-defined backend functions
//
// Shape mirrors @base44/sdk; code and implementation are original.

export interface EntityRecord { id: string; [k: string]: unknown; }

export interface EntityClient<T extends EntityRecord = EntityRecord> {
  list(sort?: string, limit?: number): Promise<T[]>;
  get(id: string): Promise<T>;
  filter(query: Record<string, unknown>, sort?: string, limit?: number): Promise<T[]>;
  create(data: Partial<T>): Promise<T>;
  update(id: string, data: Partial<T>): Promise<T>;
  delete(id: string): Promise<{ ok: true }>;
}

function entityClient<T extends EntityRecord>(appId: string, name: string): EntityClient<T> {
  const base = `/apps/${encodeURIComponent(appId)}/entities/${encodeURIComponent(name)}`;
  return {
    async list(sort, limit) {
      const res = await apiClient.get(base, { params: { sort, limit } });
      return res.data.items as T[];
    },
    async get(id) {
      const res = await apiClient.get(`${base}/${encodeURIComponent(id)}`);
      return res.data as T;
    },
    async filter(query, sort, limit) {
      const res = await apiClient.post(`${base}/filter`, { query, sort, limit });
      return res.data.items as T[];
    },
    async create(data) {
      const res = await apiClient.post(base, data);
      return res.data as T;
    },
    async update(id, data) {
      const res = await apiClient.put(`${base}/${encodeURIComponent(id)}`, data);
      return res.data as T;
    },
    async delete(id) {
      const res = await apiClient.delete(`${base}/${encodeURIComponent(id)}`);
      return res.data as { ok: true };
    }
  };
}

export interface Base888IntegrationApis {
  InvokeLLM(input: { prompt: string; model?: string; response_json_schema?: unknown }): Promise<{ output: unknown }>;
  SendEmail(input: { to: string; subject: string; body: string }): Promise<{ ok: true }>;
  UploadFile(input: { file: File }): Promise<{ file_url: string }>;
  GenerateImage(input: { prompt: string }): Promise<{ url: string }>;
}

export function createClient(options: { appId: string }) {
  const { appId } = options;
  session.setActiveApp(appId);

  const integrations: Base888IntegrationApis = {
    async InvokeLLM(input) {
      const res = await apiClient.post(`/apps/${encodeURIComponent(appId)}/integrations/core/InvokeLLM`, input);
      return res.data;
    },
    async SendEmail(input) {
      const res = await apiClient.post(`/apps/${encodeURIComponent(appId)}/integrations/core/SendEmail`, input);
      return res.data;
    },
    async UploadFile(input) {
      const fd = new FormData();
      fd.append("file", input.file);
      const res = await apiClient.post(`/apps/${encodeURIComponent(appId)}/integrations/core/UploadFile`, fd, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      return res.data;
    },
    async GenerateImage(input) {
      const res = await apiClient.post(`/apps/${encodeURIComponent(appId)}/integrations/core/GenerateImage`, input);
      return res.data;
    }
  };

  return {
    appId,
    auth: {
      me: (): Promise<User> => authApi.me(),
      login: authApi.login,
      logout: authApi.logout,
      oauthStartUrl: authApi.oauthStartUrl
    },
    entities: new Proxy({} as Record<string, EntityClient>, {
      get: (_t, name: string) => entityClient(appId, name)
    }),
    integrations: { core: integrations },
    functions: new Proxy({} as Record<string, (payload?: unknown) => Promise<unknown>>, {
      get: (_t, fnName: string) => async (payload?: unknown) => {
        const res = await apiClient.post(`/apps/${encodeURIComponent(appId)}/functions/${encodeURIComponent(fnName)}`, payload ?? {});
        return res.data;
      }
    })
  };
}

export type Base888Client = ReturnType<typeof createClient>;
