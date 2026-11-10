"use strict";
// Real authenticated WebSocket server. Mirrors Base44's ws.base44.com role:
// clients connect with an access token, receive a socket id, and get
// per-workspace broadcasts.
const crypto = require("crypto");
const { WebSocketServer } = require("ws");
const { verifyAccess } = require("./auth");
const { q } = require("./db");

function startWs(port) {
  const wss = new WebSocketServer({ port });
  const clients = new Map(); // ws -> { userId, socketId, workspaces:Set }

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url || "/", "http://localhost");
    const token = url.searchParams.get("token") || "";
    const claims = verifyAccess(token);
    if (!claims) { ws.close(4401, "unauthenticated"); return; }

    const socketId = `sock_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const wsRows = q.all("SELECT workspace_id FROM workspace_members WHERE user_id = ?", claims.sub);
    clients.set(ws, { userId: claims.sub, socketId, workspaces: new Set(wsRows.map((r) => r.workspace_id)) });
    ws.send(JSON.stringify({ type: "welcome", socket_id: socketId, user_id: claims.sub }));

    ws.on("message", (raw) => {
      let msg;
      try { msg = JSON.parse(String(raw)); } catch { msg = { type: "echo", data: String(raw) }; }
      const me = clients.get(ws);
      if (msg.type === "broadcast" && msg.workspace_id && me.workspaces.has(msg.workspace_id)) {
        for (const [peer, info] of clients) {
          if (peer.readyState === peer.OPEN && info.workspaces.has(msg.workspace_id)) {
            peer.send(JSON.stringify({ type: "message", workspace_id: msg.workspace_id, from: me.userId, data: msg.data }));
          }
        }
      } else {
        ws.send(JSON.stringify({ type: "echo", socket_id: me.socketId, data: msg.data ?? msg }));
      }
    });
    ws.on("close", () => clients.delete(ws));
  });

  return wss;
}

module.exports = { startWs };
