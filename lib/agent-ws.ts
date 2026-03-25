"use client";

/**
 * Persistent WebSocket manager for the agent-facing conversation view.
 * One connection is shared across all conversation switches so agents
 * never see a "Connecting…" flash when navigating between conversations.
 */

const WS_URL =
  typeof process !== "undefined"
    ? (process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001")
    : "ws://localhost:3001";

type MessageHandler = (event: MessageEvent) => void;
type ReadyHandler = (ready: boolean) => void;

class AgentWsManager {
  private ws: WebSocket | null = null;
  private _ready = false;
  private rooms = new Set<string>();
  private msgListeners = new Set<MessageHandler>();
  private readyListeners = new Set<ReadyHandler>();
  private pendingSends: string[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  // Stored so we can re-auth on reconnect
  private fetchToken: (() => Promise<string>) | null = null;

  /** Call once to establish (or reuse) the connection. */
  async init(fetchToken: () => Promise<string>) {
    this.fetchToken = fetchToken;
    this.destroyed = false;
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }
    await this.connect();
  }

  private async connect() {
    if (this.destroyed) return;
    let token: string;
    try {
      token = await this.fetchToken!();
    } catch {
      // Retry after a delay if token fetch fails
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
      return;
    }

    const ws = new WebSocket(WS_URL);
    this.ws = ws;
    this._ready = false;

    ws.onopen = () => {
      if (this.destroyed) { ws.close(); return; }
      ws.send(JSON.stringify({ type: "auth", token, role: "agent" }));
      // Rejoin active rooms after reconnect
      for (const convId of this.rooms) {
        ws.send(JSON.stringify({ type: "join", conversationId: convId }));
      }
      // Flush queued messages
      for (const msg of this.pendingSends) ws.send(msg);
      this.pendingSends = [];
      this._ready = true;
      for (const cb of this.readyListeners) cb(true);
    };

    ws.onmessage = (event) => {
      for (const handler of this.msgListeners) {
        try { handler(event); } catch {}
      }
    };

    ws.onclose = () => {
      this._ready = false;
      for (const cb of this.readyListeners) cb(false);
      if (!this.destroyed) {
        this.reconnectTimer = setTimeout(() => this.connect(), 3000);
      }
    };

    ws.onerror = () => { ws.close(); };
  }

  send(data: object) {
    const raw = JSON.stringify(data);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(raw);
    } else {
      this.pendingSends.push(raw);
    }
  }

  joinRoom(convId: string) {
    this.rooms.add(convId);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "join", conversationId: convId }));
    }
  }

  leaveRoom(convId: string) {
    this.rooms.delete(convId);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "leave", conversationId: convId }));
    }
  }

  addListener(handler: MessageHandler) { this.msgListeners.add(handler); }
  removeListener(handler: MessageHandler) { this.msgListeners.delete(handler); }

  onReadyChange(cb: ReadyHandler): () => void {
    this.readyListeners.add(cb);
    return () => this.readyListeners.delete(cb);
  }

  get ready() { return this._ready; }
}

// Module-level singleton — survives React unmounts on client-side navigation
export const agentWsManager: AgentWsManager =
  typeof window !== "undefined"
    ? ((window as unknown as Record<string, unknown>).__agentWsManager as AgentWsManager) ??
      (() => {
        const m = new AgentWsManager();
        (window as unknown as Record<string, unknown>).__agentWsManager = m;
        return m;
      })()
    : new AgentWsManager();
