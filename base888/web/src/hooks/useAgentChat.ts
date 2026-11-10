import { useCallback, useEffect, useState } from "react";
import { agentApi, type AgentEvent } from "@/api/agentApi";

export interface AgentRender {
  status?: string;
  summary?: string;
  questions: string[];
  plan?: { app_name?: string; entity_names?: string[] };
  building: Array<{ name?: string; fields?: string[] }>;
  built?: { app_name?: string; entities?: AgentEvent["entities"]; created?: Record<string, number>; model?: string };
  error?: string;
}
export type Turn = { role: "user"; text: string; ts: number } | { role: "agent"; render: AgentRender; ts: number };

// Shared streaming agent conversation used by the Editor and Superagent views.
export function useAgentChat(appId: string, onBuilt?: () => void) {
  const [cid, setCid] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [live, setLive] = useState<AgentRender | null>(null);
  const [busy, setBusy] = useState(false);
  const [awaiting, setAwaiting] = useState(false);

  useEffect(() => {
    if (!appId) return;
    setTurns([]); setLive(null); setCid(null);
    void agentApi.createConversation(appId).then(setCid).catch(() => {});
  }, [appId]);

  const send = useCallback(async (content: string) => {
    if (!cid || !content.trim() || busy) return;
    setTurns((t) => [...t, { role: "user", text: content, ts: Date.now() }]);
    setBusy(true);
    const r: AgentRender = { questions: [], building: [] };
    setLive({ ...r });
    try {
      for await (const e of agentApi.streamMessage(appId, cid, content)) {
        if (e.type === "status") r.status = e.text;
        else if (e.type === "summary") r.summary = e.text;
        else if (e.type === "question") r.questions = [...r.questions, e.text || ""];
        else if (e.type === "await_answers") setAwaiting(true);
        else if (e.type === "plan") { r.plan = { app_name: e.app_name, entity_names: e.entity_names }; r.status = "構築中…"; setAwaiting(false); }
        else if (e.type === "building_entity") r.building = [...r.building, { name: e.name, fields: e.fields }];
        else if (e.type === "built") { r.built = { app_name: e.app_name, entities: e.entities, created: e.created, model: e.model }; r.status = undefined; onBuilt?.(); }
        else if (e.type === "error") r.error = e.message;
        setLive({ ...r });
      }
    } catch (err) {
      r.error = (err as Error).message;
    } finally {
      setTurns((t) => [...t, { role: "agent", render: { ...r }, ts: Date.now() }]);
      setLive(null);
      setBusy(false);
    }
  }, [appId, cid, busy, onBuilt]);

  return { cid, turns, live, busy, awaiting, send };
}
