"use client";

/**
 * Persistent WebSocket manager for the user-facing chat.
 * A single WS connection is shared across all conversation pages (/chat/[id]).
 * Components join/leave rooms without ever tearing down the underlying socket.
 */

const WS_URL =
  typeof process !== "undefined"
    ? (process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001")
    : "ws://localhost:3001";

type MessageHandler = (event: MessageEvent) => void;
type ReadyHandler = (ready: boolean) => void;

class UserWsManager {
  private ws: WebSocket | null = null;
  private userId: string | null = null;
  private wsToken: string | null = null;
  private _ready = false;
  private rooms = new Set<string>();
  private msgListeners = new Set<MessageHandler>();
  private readyListeners = new Set<ReadyHandler>();
  private pendingSends: string[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  /** Establish (or reuse) the connection for this userId. */
  init(userId: string, wsToken: string) {
    if (this.userId && this.userId !== userId) {
      this.teardown();
    }
    this.userId = userId;
    this.wsToken = wsToken;
    this.destroyed = false;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.connect();
  }

  private connect() {
    if (this.destroyed || !this.userId) return;
    const ws = new WebSocket(WS_URL);
    this.ws = ws;
    this._ready = false;

    ws.onopen = () => {
      if (this.destroyed) { ws.close(); return; }
      ws.send(JSON.stringify({ type: "auth", token: this.wsToken, role: "user" }));
      // Rejoin any active rooms (e.g. after reconnect)
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

  /** Subscribe to ready-state changes. Returns an unsubscribe function. */
  onReadyChange(cb: ReadyHandler): () => void {
    this.readyListeners.add(cb);
    return () => this.readyListeners.delete(cb);
  }

  get ready() { return this._ready; }

  private teardown() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
    this._ready = false;
    this.rooms.clear();
    this.pendingSends = [];
  }

  destroy() {
    this.destroyed = true;
    this.teardown();
    this.userId = null;
    this.msgListeners.clear();
    this.readyListeners.clear();
  }
}

// Module-level singleton — survives React unmounts/remounts on client-side navigation
export const userWsManager: UserWsManager =
  typeof window !== "undefined"
    ? ((window as unknown as Record<string, unknown>).__userWsManager as UserWsManager) ??
      (() => {
        const m = new UserWsManager();
        (window as unknown as Record<string, unknown>).__userWsManager = m;
        return m;
      })()
    : new UserWsManager();
