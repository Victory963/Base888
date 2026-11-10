import { apiClient } from "./axiosClient";

export interface EntityField { name: string; type: string; options?: string[]; reference_entity?: string }
export interface GeneratedEntity {
  name: string;
  fields: EntityField[];
  sample_records?: Record<string, unknown>[];
}
export interface AppSchema {
  app_name?: string;
  description?: string;
  entities: GeneratedEntity[];
  prompt?: string;
  created_date?: string;
}
export interface GenerateResult {
  app_name?: string;
  description?: string;
  entities: GeneratedEntity[];
  created: Record<string, number>;
  raw_model?: string;
}

export const builderApi = {
  // Local LLM generation can be slow on CPU — allow up to 15 minutes.
  async generate(appId: string, prompt: string): Promise<GenerateResult> {
    const res = await apiClient.post(
      `/apps/${encodeURIComponent(appId)}/builder/generate`,
      { prompt },
      { timeout: 15 * 60 * 1000 }
    );
    return res.data as GenerateResult;
  },
  async getSchema(appId: string): Promise<AppSchema> {
    const res = await apiClient.get(`/apps/${encodeURIComponent(appId)}/schema`);
    return res.data as AppSchema;
  }
};
