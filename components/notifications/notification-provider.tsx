"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { NotificationContext, type NotificationItem } from "./notification-context";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001";

interface Props {
  agentId: string;
  agentToken: string;
  initialUnread: number;
  children: React.ReactNode;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr;
}

export function NotificationProvider({ agentId, agentToken, initialUnread, children }: Props) {
  const [unreadCount, setUnreadCount] = useState(initialUnread);
  const wsRef = useRef<WebSocket | null>(null);
  const pushRegistered = useRef(false);

  const markOneRead = useCallback(async (id: string) => {
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setUnreadCount((c) => Math.max(0, c - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    setUnreadCount(0);
    window.dispatchEvent(new CustomEvent("notifications:markAllRead"));
  }, []);

  // Persistent WS connection for agent notifications
  useEffect(() => {
    if (!agentToken) return;

    let ws: WebSocket;
    let destroyed = false;

    function connect() {
      if (destroyed) return;
      ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "auth", token: agentToken, role: "agent" }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "notification") {
            const n = msg.payload as NotificationItem & { isRead?: boolean };
            setUnreadCount((c) => c + 1);
            window.dispatchEvent(new CustomEvent<NotificationItem>("ws:notification", { detail: { ...n, isRead: false } }));
            // Play sound for new messages
            if (n.type === "NEW_MESSAGE") {
              try {
                const audio = new Audio("/notification.mp3");
                audio.volume = 0.6;
                audio.play().catch(() => {});
              } catch { /* ignore */ }
            }
          }
        } catch {}
      };

      ws.onclose = () => {
        if (!destroyed) {
          // Reconnect after 3s
          setTimeout(connect, 3000);
        }
      };
    }

    connect();

    return () => {
      destroyed = true;
      ws?.close();
    };
  }, [agentToken]);

  // Register service worker + request push permission
  useEffect(() => {
    if (pushRegistered.current || typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    pushRegistered.current = true;

    (async () => {
      try {
        // Register SW, then wait until it's active
        navigator.serviceWorker.register("/sw.js");
        const reg = await navigator.serviceWorker.ready;

        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        const vapidRes = await fetch("/api/push/vapid-key");
        if (!vapidRes.ok) return;
        const { publicKey } = await vapidRes.json();
        if (!publicKey) return;

        // Always unsubscribe stale subscription and create a fresh one.
        // This handles VAPID key rotation and expired subscriptions silently.
        const existing = await reg.pushManager.getSubscription();
        if (existing) await existing.unsubscribe();

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        });

        const res = await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(sub.toJSON()),
        });
        if (!res.ok) throw new Error(`subscribe failed ${res.status}`);
        console.log("[push] subscribed", sub.endpoint);
      } catch (e) {
        console.warn("[push] setup failed:", e);
      }
    })();
  }, [agentId]);

  return (
    <NotificationContext.Provider value={{ unreadCount, markOneRead, markAllRead }}>
      {children}
    </NotificationContext.Provider>
  );
}

