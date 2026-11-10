import { apiClient, session } from "./axiosClient";

export interface AgentEvent {
  type: "status" | "summary" | "question" | "await_answers" | "plan" | "building_entity" | "built" | "done" | "error";
  text?: string;
  app_name?: string;
  description?: string;
  entity_names?: string[];
  name?: string;
  fields?: string[];
  entities?: Array<{ name: string; icon?: string; fields: Array<{ name: string; type: string; options?: string[]; reference_entity?: string }> }>;
  created?: Record<string, number>;
  model?: string;
  count?: number;
  message?: string;
  code?: string;
}

const base = () => apiClient.defaults.baseURL || "";

export const agentApi = {
  async createConversation(appId: string): Promise<string> {
    const res = await apiClient.post(`/apps/${encodeURIComponent(appId)}/conversations`, {});
    return res.data.id as string;
  },

  // Streams agent step events over SSE (fetch + ReadableStream).
  async *streamMessage(appId: string, cid: string, content: string): AsyncGenerator<AgentEvent> {
    const res = await fetch(`${base()}/apps/${encodeURIComponent(appId)}/conversations/${encodeURIComponent(cid)}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${session.getAccessToken() ?? ""}` },
      body: JSON.stringify({ content })
    });
    if (!res.ok || !res.body) { throw new Error(`stream failed: ${res.status}`); }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const frames = buf.split("\n\n");
      buf = frames.pop() ?? "";
      for (const frame of frames) {
        const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
        if (!dataLine) continue;
        try { yield JSON.parse(dataLine.slice(6)) as AgentEvent; } catch { /* skip */ }
      }
    }
  }
};
