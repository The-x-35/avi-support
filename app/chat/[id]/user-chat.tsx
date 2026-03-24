"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence, useMotionValue, useTransform, useAnimate } from "framer-motion";
import { cn } from "@/lib/utils/cn";
import { formatRelativeTime } from "@/lib/utils/format";
import { Send, ChevronLeft, Shield, CheckCircle, ArrowUpCircle, Bot, User, Paperclip, X, Play, Clock, ChevronUp, CreditCard, Receipt, ShieldCheck, HelpCircle, MessageSquare } from "lucide-react";
import confetti from "canvas-confetti";
import { Fireworks } from "@fireworks-js/react";
import imageCompression from "browser-image-compression";

// ─── Media upload ────────────────────────────────────────────────────────────
const ALLOWED_MIME = new Set([
  "image/jpeg","image/png","image/gif","image/webp","image/heic","image/heif",
  "video/mp4","video/quicktime","video/webm","video/x-m4v",
]);
const ALLOWED_EXT = new Set(["jpg","jpeg","png","gif","webp","heic","heif","mp4","mov","webm","m4v"]);
const MAX_IMAGE = 10 * 1024 * 1024;
const MAX_VIDEO = 50 * 1024 * 1024;

interface PendingMedia {
  file: File;
  previewUrl: string;
  isVideo: boolean;
}

async function safeJson(res: Response) {
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    const text = await res.text();
    throw new Error(`Server error (${res.status}): ${text.slice(0, 120)}`);
  }
  return res.json();
}

async function uploadMedia(file: File, conversationId: string): Promise<{ url: string; mimeType: string; fileName: string; mediaId: string }> {
  const form = new FormData();
  form.append("file", file);
  form.append("conversationId", conversationId);

  const res = await fetch("/api/upload/file", { method: "POST", body: form });
  if (!res.ok) {
    const body = await safeJson(res).catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Upload failed (${res.status})`);
  }
  const { url, mediaId, mimeType, fileName } = await safeJson(res);
  return { url, mediaId, mimeType, fileName };
}

// ─── iMessage spring ─────────────────────────────────────────────────────────
// iMessage-accurate spring: fast rise, tiny overshoot, snaps clean
const BUBBLE_SPRING = {
  type: "spring" as const,
  stiffness: 520,
  damping: 32,
  mass: 0.4,
};


// --- Screen Effects ---
type ScreenEffect = "confetti" | "fireworks" | "lasers" | "hearts" | null;

function detectEffect(text: string): ScreenEffect {
  const t = text.toLowerCase();
  if (/pew\s*pew/.test(t)) return "lasers";
  if (/finally|you saved me|life\s*saver|yes[!]+|perfect[!]/.test(t)) return "fireworks";
  if (/it worked|that fixed|working now|problem solved|fixed it|all good now/.test(t)) return "confetti";
  if (/you.?re (the )?best|love this|amazing support|you.?re amazing|best support/.test(t)) return "hearts";
  if (/thank you|thanks|appreciate|grateful/.test(t)) return "confetti";
  return null;
}

// Dark saturated confetti — explodes upward like a burst
function fireConfetti() {
  const colors = ["#c0392b", "#8e44ad", "#16a085", "#e67e22", "#2980b9", "#f1c40f", "#27ae60", "#e91e63"];
  confetti({ particleCount: 120, angle: 90, spread: 100, origin: { x: 0.5, y: 0.9 }, startVelocity: 65, colors, ticks: 220, gravity: 0.85 });
  setTimeout(() => confetti({ particleCount: 50, angle: 60,  spread: 55, origin: { x: 0.1, y: 0.9 }, startVelocity: 55, colors, ticks: 200 }), 120);
  setTimeout(() => confetti({ particleCount: 50, angle: 120, spread: 55, origin: { x: 0.9, y: 0.9 }, startVelocity: 55, colors, ticks: 200 }), 120);
}

// Balloons + ribbons spread across full screen using canvas-confetti shapes
// Hearts all over the screen
function fireHearts() {
  const heart   = confetti.shapeFromText({ text: "❤️", scalar: 2 });
  const sparkle = confetti.shapeFromText({ text: "✨", scalar: 1.5 });
  const positions = [0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9];
  positions.forEach((x, i) => {
    setTimeout(() => {
      confetti({ particleCount: 6, spread: 55, origin: { x, y: 1 }, shapes: [heart, sparkle], scalar: 2, gravity: 0.4, startVelocity: 40 + i * 2, ticks: 260, drift: i % 2 === 0 ? -0.3 : 0.3 });
    }, i * 80);
  });
  // Extra burst from mid-screen sides
  setTimeout(() => {
    confetti({ particleCount: 10, spread: 80, origin: { x: 0.1, y: 0.5 }, shapes: [heart], scalar: 2, gravity: 0.5, startVelocity: 30, angle: 45 });
    confetti({ particleCount: 10, spread: 80, origin: { x: 0.9, y: 0.5 }, shapes: [heart], scalar: 2, gravity: 0.5, startVelocity: 30, angle: 135 });
  }, 300);
}

// Launch spring: message fires up from input area
const SEND_SPRING = {
  type: "spring" as const,
  stiffness: 260,
  damping: 22,
  mass: 0.9,
};

interface MediaMeta {
  id: string;
  url: string;
  mimeType: string;
  fileName: string;
}

interface Message {
  id: string;
  senderType: "USER" | "AI" | "AGENT";
  content: string;
  isStreaming: boolean;
  createdAt: string;
  agent: { name: string; avatarUrl: string | null } | null;
  media?: MediaMeta;
}

interface Conversation {
  id: string;
  category: string;
  status: string;
  isAiPaused: boolean;
  assignedAgentId: string | null;
  messages: Message[];
}

interface HistoryConversation {
  id: string;
  category: string;
  status: string;
  lastMessageAt: string | null;
  messages: { content: string; senderType: string }[];
}

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001";

const CATEGORY_LABELS: Record<string, string> = {
  CARDS: "Cards",
  ACCOUNT: "Account",
  SPENDS: "Spends",
  KYC: "KYC",
  GENERAL: "General",
  OTHER: "Support",
};

const CATEGORIES = [
  { value: "CARDS",   label: "Cards",   description: "Activation, limits, declines", icon: CreditCard, color: "text-blue-500" },
  { value: "ACCOUNT", label: "Account", description: "Login, profile, access",       icon: User,        color: "text-violet-500" },
  { value: "SPENDS",  label: "Spends",  description: "Disputes, refunds, charges",   icon: Receipt,     color: "text-emerald-500" },
  { value: "KYC",     label: "KYC",     description: "Verification, documents",      icon: ShieldCheck, color: "text-amber-500" },
  { value: "GENERAL", label: "General", description: "Product questions, feedback",  icon: HelpCircle,  color: "text-gray-500" },
  { value: "OTHER",   label: "Other",   description: "Go straight to chat",          icon: MessageSquare, color: "text-rose-500" },
];


// Returns a time header string in iMessage style
function formatTimeHeader(date: Date): string {
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const isYesterday =
    new Date(now.getTime() - 86_400_000).toDateString() === date.toDateString();
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (isToday) return time;
  if (isYesterday) return `Yesterday ${time}`;
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86_400_000);
  if (diffDays < 7) {
    const day = date.toLocaleDateString([], { weekday: "short" });
    return `${day} ${time}`;
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + time;
}

// Show a header if first message or gap from previous > 60 minutes
function needsHeader(prev: Message | null, curr: Message): boolean {
  if (!prev) return true;
  return new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime() > 60 * 60 * 1000;
}

// --- Sound & Haptics ---

// --- Screen Effects ---
const LASER_COLORS = ["#ff2d55", "#30d158", "#0a84ff", "#bf5af2", "#ffd60a", "#32ade6", "#ff6961"];

function LaserOverlay({ onDone }: { onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 3200); return () => clearTimeout(t); }, [onDone]);
  const beams = Array.from({ length: 14 }, (_, i) => ({
    id: i,
    color: LASER_COLORS[i % LASER_COLORS.length],
    angle: -25 + (i * 7) % 50,
    y: 5 + (i * 13) % 88,
    delay: (i * 0.13) % 1.1,
    duration: 0.28 + (i % 4) * 0.07,
    repeat: 3 + (i % 3),
  }));
  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {beams.map((b) => (
        <motion.div
          key={b.id}
          style={{
            position: "absolute", top: `${b.y}%`,
            width: "130vw", height: "3px",
            background: `linear-gradient(90deg, transparent, ${b.color}, ${b.color}, transparent)`,
            boxShadow: `0 0 8px 3px ${b.color}, 0 0 24px 6px ${b.color}55`,
            rotate: b.angle, transformOrigin: "left center",
          }}
          initial={{ x: "-130vw" }}
          animate={{ x: ["-130vw", "130vw"] }}
          transition={{ duration: b.duration, delay: b.delay, repeat: b.repeat, repeatDelay: 0.08 + (b.id % 5) * 0.06, ease: "linear" }}
        />
      ))}
    </div>
  );
}

function FireworksOverlay({ onDone }: { onDone: () => void }) {
  useEffect(() => { const t = setTimeout(onDone, 2100); return () => clearTimeout(t); }, [onDone]);
  return (
    <Fireworks
      options={{ rocketsPoint: { min: 0, max: 100 }, hue: { min: 0, max: 360 }, delay: { min: 15, max: 35 }, acceleration: 1.05, friction: 0.97, gravity: 1.5, particles: 80, traceLength: 3, traceSpeed: 10, explosion: 5, intensity: 28, flickering: 60, lineWidth: { explosion: { min: 1, max: 3 }, trace: { min: 1, max: 2 } }, opacity: 0.6 }}
      style={{ position: "fixed", inset: 0, zIndex: 50, pointerEvents: "none" }}
    />
  );
}

export function UserChat({
  conversation: initial,
  userId,
  initialMessage,
}: {
  conversation: Conversation;
  userId: string;
  initialMessage?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<Message[]>(initial.messages);
  const [convStatus, setConvStatus] = useState(initial.status);
  const [isAgentActive, setIsAgentActive] = useState(initial.isAiPaused && !!initial.assignedAgentId);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<PendingMedia | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [wsReady, setWsReady] = useState(false);
  const [wsError, setWsError] = useState(false);

  // Typewriter engine
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [displayedLen, setDisplayedLen] = useState(0);
  const receivedRef = useRef("");
  const isDoneRef = useRef(false);
  const typingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const [activeEffect, setActiveEffect] = useState<ScreenEffect>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryConversation[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [convCategory, setConvCategory] = useState(initial.category);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [categoryChanging, setCategoryChanging] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const initialMessageSentRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [inputScope, animateInput] = useAnimate();
  const initialMessageFromUrl = (searchParams.get("initialMessage") ?? initialMessage ?? "").trim();

  function sendInitialMessageDirect(raw: string) {
    const content = raw.trim();
    const ws = wsRef.current;
    if (!content || initialMessageSentRef.current) return;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    initialMessageSentRef.current = true;
    const tempId = `temp_${Date.now()}`;
    setFreshIds((prev) => new Set([...prev, tempId]));
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        senderType: "USER",
        content,
        isStreaming: false,
        createdAt: new Date().toISOString(),
        agent: null,
      },
    ]);

    ws.send(JSON.stringify({ type: "send_message", conversationId: initial.id, content }));
    setTimeout(() => {
      setFreshIds((prev) => {
        const n = new Set(prev);
        n.delete(tempId);
        return n;
      });
    }, 800);
  }

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  // Shrink container to visual viewport height when keyboard opens (iOS + Android)
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      if (containerRef.current) {
        containerRef.current.style.height = `${vv.height}px`;
        containerRef.current.style.transform = `translateY(${vv.offsetTop}px)`;
      }
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "instant" }));
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, streamingId]);

  useEffect(() => {
    return () => { if (typingIntervalRef.current) clearInterval(typingIntervalRef.current); };
  }, []);

  function startTypingInterval(msgId: string) {
    if (typingIntervalRef.current) return;
    typingIntervalRef.current = setInterval(() => {
      setDisplayedLen((prev) => {
        const target = receivedRef.current.length;
        if (prev < target) return prev + 1;
        if (isDoneRef.current) {
          clearInterval(typingIntervalRef.current!);
          typingIntervalRef.current = null;
          const content = receivedRef.current;
          setMessages((msgs) => {
            if (msgs.some((m) => m.id === msgId)) return msgs;
            return [...msgs, {
              id: msgId, senderType: "AI" as const,
              content, isStreaming: false,
              createdAt: new Date().toISOString(), agent: null,
            }];
          });
          receivedRef.current = "";
          isDoneRef.current = false;
          setStreamingId(null);
          setDisplayedLen(0);
        }
        return prev;
      });
    }, 18);
  }

  useEffect(() => {
    let cancelled = false;
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      if (cancelled) { ws.close(); return; }
      ws.send(JSON.stringify({ type: "auth", token: userId, role: "user" }));
      ws.send(JSON.stringify({ type: "join", conversationId: initial.id }));
      // Mark existing messages as read on open
      ws.send(JSON.stringify({ type: "mark_read", conversationId: initial.id }));
      setWsReady(true);
      setWsError(false);
      const firstMessage = initialMessageFromUrl;
      if (firstMessage && !initialMessageSentRef.current) {
        // Wait a beat so auth/join is processed before first send.
        setTimeout(() => sendInitialMessageDirect(firstMessage), 200);
      }
    };

    ws.onmessage = (event) => {
      const evt = JSON.parse(event.data);
      switch (evt.type) {
        case "message": {
          const p = evt.payload;
          if (p.conversationId !== initial.id || p.senderType === "USER" || p.isPrivate) return;
          setMessages((prev) => {
            if (prev.some((m) => m.id === p.id)) return prev;
            return [...prev, {
              id: p.id, senderType: p.senderType, content: p.content,
              isStreaming: false, createdAt: p.createdAt,
              agent: p.senderName ? { name: p.senderName, avatarUrl: null } : null,
              media: p.media ?? undefined,
            }];
          });
          // Mark as read since it's visible
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "mark_read", conversationId: initial.id }));
          }
          break;
        }
        case "ai_chunk": {
          const p = evt.payload;
          if (p.conversationId !== initial.id) return;
          receivedRef.current += p.chunk;
          setStreamingId((prev) => {
            if (!prev) { startTypingInterval(p.messageId); return p.messageId; }
            return prev;
          });
          break;
        }
        case "ai_done": {
          if (evt.payload.conversationId !== initial.id) return;
          isDoneRef.current = true;
          break;
        }
        case "control": {
          const p = evt.payload;
          if (p.conversationId !== initial.id) return;
          if (p.action === "takeover") setIsAgentActive(true);
          if (p.action === "resume_ai" || p.action === "release") setIsAgentActive(false);
          if (p.action === "resolve") setConvStatus("RESOLVED");
          if (p.action === "escalate") setConvStatus("ESCALATED");
          break;
        }
        case "category_update": {
          const p = evt.payload;
          if (p.conversationId !== initial.id) return;
          setConvCategory(p.category);
          break;
        }
      }
    };

    ws.onclose = () => setWsReady(false);
    ws.onerror = () => { setWsReady(false); setWsError(true); };

    return () => {
      cancelled = true;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "leave", conversationId: initial.id }));
        ws.close();
      } else if (ws.readyState === WebSocket.CONNECTING) {
        ws.addEventListener("open", () => ws.close(), { once: true });
      }
    };
  }, [initial.id, userId, initialMessageFromUrl]);

  async function handleFilePick(file: File) {
    setUploadError(null);

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ALLOWED_EXT.has(ext) || !ALLOWED_MIME.has(file.type)) {
      setUploadError("Only images (jpg, png, gif, webp) and videos (mp4, mov, webm) are allowed.");
      return;
    }

    const isVideo = file.type.startsWith("video/");
    const maxBytes = isVideo ? MAX_VIDEO : MAX_IMAGE;

    if (file.size > maxBytes) {
      setUploadError(`${isVideo ? "Video" : "Image"} too large. Max ${maxBytes / 1024 / 1024}MB.`);
      return;
    }

    let finalFile = file;
    if (!isVideo) {
      try {
        const compressed = await imageCompression(file, {
          maxSizeMB: 2,
          maxWidthOrHeight: 1920,
          useWebWorker: true,
          fileType: file.type as "image/jpeg" | "image/png" | "image/webp",
        });
        // Restore original filename — compression can rename to "blob"
        finalFile = new File([compressed], file.name, { type: compressed.type || file.type });
      } catch {
        // compression failed — use original
      }
    }

    const previewUrl = URL.createObjectURL(finalFile);
    setPendingMedia({ file: finalFile, previewUrl, isVideo });
  }

  function clearMedia() {
    if (pendingMedia) URL.revokeObjectURL(pendingMedia.previewUrl);
    setPendingMedia(null);
    setUploadError(null);
  }

  async function sendMessageWithContent(content: string) {
    if ((!content.trim() && !pendingMedia) || sending || !wsReady) return;
    const finalContent = content.trim();
    const tempId = `temp_${Date.now()}`;
    setSending(true);
    setUploadError(null);

    // Upload media first if attached
    let media: MediaMeta | undefined;
    if (pendingMedia) {
      try {
        const uploaded = await uploadMedia(pendingMedia.file, initial.id);
        media = { id: uploaded.mediaId, url: uploaded.url, mimeType: uploaded.mimeType, fileName: uploaded.fileName };
        clearMedia();
      } catch (err: unknown) {
        setUploadError(err instanceof Error ? err.message : "Upload failed");
        setSending(false);
        return;
      }
    }

    if (finalContent) {
      const effect = detectEffect(finalContent);
      if (effect === "confetti") fireConfetti();
      else if (effect === "hearts") fireHearts();
      else if (effect === "fireworks" || effect === "lasers") setActiveEffect(effect);
    }

    animateInput(inputScope.current, { scaleY: 0.82, opacity: 0.5 }, { duration: 0.08 }).then(() => {
      setText("");
      animateInput(inputScope.current, { scaleY: 1, opacity: 1 }, { duration: 0.18, ease: [0.34, 1.56, 0.64, 1] });
    });
    // Clear typing preview for agents
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "typing_preview", conversationId: initial.id, text: "" }));
    }

    setFreshIds((prev) => new Set([...prev, tempId]));
    setMessages((prev) => [...prev, {
      id: tempId, senderType: "USER",
      content: finalContent || (media ? media.fileName : ""),
      isStreaming: false,
      createdAt: new Date().toISOString(), agent: null,
      media,
    }]);
    wsRef.current!.send(
      JSON.stringify({
        type: "send_message",
        conversationId: initial.id,
        content: finalContent,
        mediaId: media?.id,
      })
    );
    setSending(false);
    inputRef.current?.focus();
    setTimeout(() => setFreshIds((prev) => { const n = new Set(prev); n.delete(tempId); return n; }), 800);
  }

  async function sendMessage() {
    await sendMessageWithContent(text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  async function openHistory() {
    setHistoryOpen(true);
    if (history !== null) return;
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/chat/history?userId=${encodeURIComponent(userId)}`);
      const data = await res.json();
      setHistory(data.conversations ?? []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function changeCategory(category: string) {
    if (category === convCategory || categoryChanging) return;
    setCategoryChanging(true);
    setCategoryPickerOpen(false);
    try {
      await fetch("/api/chat/category", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: initial.id, category }),
      });
      setConvCategory(category);
    } finally {
      setCategoryChanging(false);
    }
  }

  const categoryLabel = CATEGORY_LABELS[convCategory] ?? "Support";

  return (
    <div
      ref={containerRef}
      className="flex flex-col bg-white w-full h-full"
      style={{ WebkitTapHighlightColor: "transparent", transformOrigin: "top left" }}
    >
      {activeEffect === "lasers" && <LaserOverlay onDone={() => setActiveEffect(null)} />}
      {activeEffect === "fireworks" && <FireworksOverlay onDone={() => setActiveEffect(null)} />}

      {/* Header */}
      <div
        className="shrink-0 border-b border-gray-100/80"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          backgroundColor: "rgba(255,255,255,0.92)",
          position: "sticky", top: 0, zIndex: 10,
        }}
      >
        <div className="flex items-center justify-between px-2 py-2">
          <button
            onClick={() => router.push(`/chat?userId=${encodeURIComponent(userId)}`)}
            className="flex items-center justify-center w-10 h-10 rounded-full text-gray-400 active:bg-gray-100 transition-colors"
            style={{ touchAction: "manipulation" }}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={openHistory}
            className="flex items-center justify-center w-10 h-10 rounded-full text-gray-400 active:bg-gray-100 transition-colors"
            style={{ touchAction: "manipulation" }}
          >
            <Clock className="w-[18px] h-[18px]" />
          </button>
        </div>
      </div>

      {/* History panel */}
      <AnimatePresence>
        {historyOpen && (
          <>
            <motion.div
              key="backdrop"
              className="fixed inset-0 bg-black/20 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setHistoryOpen(false)}
            />
            <motion.div
              key="panel"
              className="fixed right-0 top-0 bottom-0 w-[88%] max-w-sm bg-white z-50 flex flex-col shadow-2xl"
              style={{ paddingTop: "env(safe-area-inset-top)" }}
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 400, damping: 38, mass: 0.8 }}
            >
              {/* Panel header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <p className="text-[15px] font-semibold text-gray-900">Past conversations</p>
                <button
                  onClick={() => setHistoryOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 active:bg-gray-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Panel content */}
              <div className="flex-1 overflow-y-auto">
                {historyLoading ? (
                  <div className="flex flex-col gap-3 p-4">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="rounded-2xl bg-gray-50 p-4 space-y-2 animate-pulse">
                        <div className="flex items-center justify-between">
                          <div className="h-3.5 w-16 bg-gray-200 rounded-full" />
                          <div className="h-3 w-10 bg-gray-100 rounded-full" />
                        </div>
                        <div className="h-3 w-3/4 bg-gray-100 rounded-full" />
                      </div>
                    ))}
                  </div>
                ) : !history || history.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-2 px-6 text-center">
                    <Clock className="w-8 h-8 text-gray-200" />
                    <p className="text-sm text-gray-400">No past conversations</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1 p-3">
                    {history.map((c) => {
                      const isActive = c.id === initial.id;
                      const lastMsg = c.messages[0];
                      const cat = CATEGORY_LABELS[c.category] ?? c.category;
                      const ago = c.lastMessageAt ? formatRelativeTime(c.lastMessageAt) : "";
                      return (
                        <button
                          key={c.id}
                          onClick={() => {
                            setHistoryOpen(false);
                            if (!isActive) router.push(`/chat/${c.id}?userId=${encodeURIComponent(userId)}`);
                          }}
                          className={cn(
                            "w-full text-left rounded-2xl px-4 py-3.5 transition-colors active:scale-[0.98]",
                            isActive ? "bg-gray-900" : "bg-gray-50 active:bg-gray-100"
                          )}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className={cn(
                              "text-[11px] font-semibold uppercase tracking-wide",
                              isActive ? "text-gray-400" : "text-gray-400"
                            )}>
                              {cat}
                            </span>
                            <span className={cn("text-[11px]", isActive ? "text-gray-500" : "text-gray-300")}>
                              {ago}
                            </span>
                          </div>
                          <p className={cn(
                            "text-[13px] leading-snug truncate",
                            isActive ? "text-white" : "text-gray-600"
                          )}>
                            {lastMsg ? lastMsg.content : "No messages yet"}
                          </p>
                          {c.status !== "OPEN" && (
                            <span className={cn(
                              "inline-block mt-2 text-[10px] font-medium px-2 py-0.5 rounded-full",
                              c.status === "RESOLVED"
                                ? isActive ? "bg-emerald-900 text-emerald-300" : "bg-emerald-50 text-emerald-600"
                                : c.status === "ESCALATED"
                                ? isActive ? "bg-amber-900 text-amber-300" : "bg-amber-50 text-amber-600"
                                : isActive ? "bg-gray-700 text-gray-300" : "bg-gray-100 text-gray-500"
                            )}>
                              {c.status.charAt(0) + c.status.slice(1).toLowerCase()}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Status banners */}
      {isAgentActive && convStatus === "OPEN" && (
        <div className="mx-3 mt-2 flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-2.5 shrink-0">
          <Shield className="w-4 h-4 text-blue-500 shrink-0" />
          <p className="text-xs text-blue-700 font-medium">A support agent has joined and will assist you directly.</p>
        </div>
      )}
      {convStatus === "RESOLVED" && (
        <div className="mx-3 mt-2 flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-2.5 shrink-0">
          <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
          <p className="text-xs text-emerald-700 font-medium">This conversation has been resolved. We hope we could help!</p>
        </div>
      )}
      {convStatus === "ESCALATED" && (
        <div className="mx-3 mt-2 flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-2.5 shrink-0">
          <ArrowUpCircle className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="text-xs text-amber-700 font-medium">Your issue has been escalated to our team. Someone will follow up shortly.</p>
        </div>
      )}

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto px-3 py-3"
        style={{ overscrollBehaviorY: "contain", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
      >
        {messages.length === 0 && !streamingId && (
          <motion.div
            className="flex justify-start mb-2"
            initial={{ opacity: 0, y: 40, scale: 0.72 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={BUBBLE_SPRING}
            style={{ originX: 0, originY: 1 }}
          >
            <div className="max-w-[82%]">
              <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                <p className="text-[15px] text-gray-800 leading-relaxed">Hi! I&apos;m Avi, your support assistant. How can I help you today?</p>
              </div>
            </div>
          </motion.div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg, i) => {
            const prev = i > 0 ? messages[i - 1] : null;
            const showHeader = needsHeader(prev, msg);
            const sameAsPrev = prev && prev.senderType === msg.senderType;
            return (
              <div key={msg.id}>
                {showHeader && (
                  <p className="text-center text-[11px] text-gray-400 my-4 select-none font-medium">
                    {formatTimeHeader(new Date(msg.createdAt))}
                  </p>
                )}
                <div className={sameAsPrev && !showHeader ? "mb-0.5" : "mb-1.5"}>
                  <ChatBubble message={msg} isFresh={freshIds.has(msg.id)} />
                </div>
              </div>
            );
          })}
        </AnimatePresence>

        {/* Typewriter streaming bubble */}
        <AnimatePresence>
          {streamingId && (
            <motion.div
              key="streaming"
              className="flex justify-start mb-1.5"
              initial={{ opacity: 0, y: 40, scale: 0.72 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.9, transition: { duration: 0.12 } }}
              transition={BUBBLE_SPRING}
              style={{ originX: 0, originY: 1 }}
            >
              <div className="max-w-[82%]">
                <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
                  {displayedLen === 0 ? (
                    <span className="text-[15px] text-gray-400 italic">Avi is thinking…</span>
                  ) : (
                    <p className="text-[15px] text-gray-800 leading-relaxed whitespace-pre-wrap">
                      {receivedRef.current.slice(0, displayedLen)}
                      <span className="inline-block w-0.5 h-3.5 bg-gray-400 ml-0.5 animate-[blink_1s_step-end_infinite] align-middle" />
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={bottomRef} className="h-1" />
      </div>

      {/* Input — stays above home indicator */}
      <div
        className="shrink-0 bg-white/95 border-t border-gray-100"
        style={{
          paddingBottom: "max(env(safe-area-inset-bottom), 12px)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        {!wsReady && (
          <div className={cn(
            "flex items-center justify-center gap-1.5 text-xs mx-3 mt-2 mb-1 py-2 rounded-xl",
            wsError ? "bg-red-50 text-red-500" : "bg-gray-50 text-gray-400"
          )}>
            {wsError ? (
              <><span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />Connection failed</>
            ) : (
              <><span className="w-3 h-3 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin shrink-0" />Connecting…</>
            )}
          </div>
        )}

        <div className="px-3 pt-2">
          {/* Category picker */}
          <div className="relative mb-2">
            <button
              onClick={() => setCategoryPickerOpen((o) => !o)}
              disabled={categoryChanging}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors text-xs font-medium text-gray-600 disabled:opacity-50"
              style={{ touchAction: "manipulation" }}
            >
              {categoryChanging ? (
                <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin shrink-0" />
              ) : (
                (() => {
                  const cat = CATEGORIES.find((c) => c.value === convCategory);
                  const Icon = cat?.icon ?? HelpCircle;
                  return <Icon className={cn("w-3 h-3 shrink-0", cat?.color ?? "text-gray-500")} />;
                })()
              )}
              {categoryLabel}
              <ChevronUp className={cn("w-3 h-3 text-gray-400 transition-transform", !categoryPickerOpen && "rotate-180")} />
            </button>

            <AnimatePresence>
              {categoryPickerOpen && (
                <>
                  <motion.div
                    className="fixed inset-0 z-30"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setCategoryPickerOpen(false)}
                  />
                  <motion.div
                    className="absolute bottom-full left-0 mb-2 w-64 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden z-40"
                    initial={{ opacity: 0, y: 8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.96 }}
                    transition={{ type: "spring", stiffness: 500, damping: 36, mass: 0.6 }}
                  >
                    <div className="px-3 py-2 border-b border-gray-50">
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Change topic</p>
                    </div>
                    {CATEGORIES.map(({ value, label, description, icon: Icon, color }) => {
                      const isActive = value === convCategory;
                      return (
                        <button
                          key={value}
                          onClick={() => changeCategory(value)}
                          className={cn(
                            "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors",
                            isActive ? "bg-gray-50" : "hover:bg-gray-50"
                          )}
                        >
                          <div className={cn("w-7 h-7 rounded-xl flex items-center justify-center shrink-0 bg-gray-100")}>
                            <Icon className={cn("w-3.5 h-3.5", color)} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium text-gray-900">{label}</p>
                            <p className="text-[11px] text-gray-400 truncate">{description}</p>
                          </div>
                          {isActive && (
                            <div className="w-1.5 h-1.5 rounded-full bg-gray-900 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* Upload error */}
          {uploadError && (
            <div className="flex items-center gap-2 bg-red-50 text-red-500 text-xs rounded-2xl px-3 py-2 mb-2">
              <span className="flex-1">{uploadError}</span>
              <button onClick={() => setUploadError(null)} className="shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Media preview */}
          {pendingMedia && (
            <div className="relative inline-block mb-2 ml-1">
              {pendingMedia.isVideo ? (
                <div className="w-20 h-20 rounded-2xl bg-gray-900 flex items-center justify-center overflow-hidden">
                  <video src={pendingMedia.previewUrl} className="w-full h-full object-cover" muted playsInline />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-7 h-7 rounded-full bg-black/50 flex items-center justify-center">
                      <Play className="w-3.5 h-3.5 text-white ml-0.5" />
                    </div>
                  </div>
                </div>
              ) : (
                <img
                  src={pendingMedia.previewUrl}
                  alt="attachment"
                  className="w-20 h-20 rounded-2xl object-cover"
                />
              )}
              <button
                onClick={clearMedia}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center shadow"
              >
                <X className="w-3 h-3 text-white" />
              </button>
            </div>
          )}

          <motion.div
            ref={inputScope}
            className={cn(
              "flex items-center gap-2 rounded-3xl border px-3 py-2.5",
              wsReady ? "border-gray-200" : "border-gray-100 opacity-60"
            )}
            style={{ backgroundColor: "#f2f2f7", transformOrigin: "bottom center" }}
          >
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm,video/x-m4v"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFilePick(f); e.target.value = ""; }}
            />

            {/* Attach button */}
            <motion.button
              onClick={() => fileInputRef.current?.click()}
              disabled={!wsReady || sending}
              whileTap={wsReady ? { scale: 0.84 } : {}}
              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-gray-400 hover:text-gray-600 disabled:opacity-40 transition-colors"
              style={{ touchAction: "manipulation" }}
            >
              <Paperclip className="w-4 h-4" />
            </motion.button>

            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                  wsRef.current.send(JSON.stringify({ type: "typing_preview", conversationId: initial.id, text: e.target.value }));
                }
              }}
              onKeyDown={handleKeyDown}
              placeholder={wsReady ? "Talk to Avi…" : "Connecting…"}
              disabled={!wsReady}
              rows={1}
              className="flex-1 min-w-0 bg-transparent text-gray-900 placeholder:text-gray-400 outline-none ring-0 resize-none leading-relaxed disabled:cursor-not-allowed focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
              style={{ minHeight: "1.5rem", maxHeight: "7rem", outline: "none", boxShadow: "none", fontSize: "16px" }}
            />
            <motion.button
              onClick={sendMessage}
              disabled={(!text.trim() && !pendingMedia) || sending || !wsReady}
              whileTap={(text.trim() || pendingMedia) && wsReady ? { scale: 0.84 } : {}}
              className={cn(
                "w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all duration-150",
                (text.trim() || pendingMedia) && wsReady && !sending
                  ? "bg-[#0f0f0f] text-white shadow-sm"
                  : "bg-gray-200 text-gray-400 cursor-not-allowed"
              )}
              style={{ touchAction: "manipulation" }}
            >
              {sending ? (
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </motion.button>
          </motion.div>
          <p className="text-[10px] text-center text-gray-300 mt-2 mb-0.5 select-none">Secured by Avici · Your data is protected</p>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({ message: msg, isFresh = false }: { message: Message; isFresh?: boolean }) {
  const isUser = msg.senderType === "USER";
  const isAgent = msg.senderType === "AGENT";

  const dragX = useMotionValue(0);
  // Timestamp fades in as user drags left (from -15px to -65px)
  const timestampOpacity = useTransform(dragX, [-65, -15], [1, 0]);

  const time = new Date(msg.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  const isLaunch = isFresh && isUser;

  return (
    <motion.div
      layout
      className={cn("relative flex", isUser ? "justify-end" : "justify-start")}
      initial={isLaunch
        ? { opacity: 0.7, y: 110, scale: 0.5, x: 8 }
        : { opacity: 0, y: 40, scale: 0.72 }}
      animate={{ opacity: 1, y: 0, scale: 1, x: 0 }}
      transition={isLaunch ? SEND_SPRING : BUBBLE_SPRING}
      style={{ originX: isUser ? 1 : 0, originY: 1 }}
    >
      {/* Timestamp — hidden at rest, revealed on swipe left (user only) */}
      {isUser && (
        <motion.span
          className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none select-none whitespace-nowrap"
          style={{ opacity: timestampOpacity }}
        >
          {time}
        </motion.span>
      )}

      {/* Draggable row — only user messages */}
      <motion.div
        drag={isUser ? "x" : false}
        dragConstraints={{ left: -75, right: 0 }}
        dragElastic={0.12}
        style={isUser ? { x: dragX } : undefined}
        className={cn("flex items-end gap-2 max-w-[82%]", isUser && "flex-row-reverse")}
      >

        <div
          className={cn(
            "rounded-2xl overflow-hidden",
            msg.media && !msg.content ? "p-0" : "px-4 py-[11px]",
            isUser
              ? "bg-[#0f0f0f] text-white rounded-br-sm"
              : isAgent
              ? "bg-blue-50 border border-blue-100 text-gray-900 rounded-bl-sm shadow-sm"
              : "bg-white border border-gray-100 text-gray-900 rounded-bl-sm shadow-sm"
          )}
        >
          {isAgent && msg.agent?.name && (
            <p className="text-[11px] font-semibold text-blue-500 mb-1">{msg.agent.name}</p>
          )}

          {/* Media (image or video) */}
          {msg.media && (
            msg.media.mimeType.startsWith("video/") ? (
              <div className={cn("relative", msg.content && "mb-2")}>
                <video
                  src={msg.media.url}
                  controls
                  playsInline
                  className="rounded-xl max-w-[220px] max-h-[300px] object-cover"
                  style={{ display: "block" }}
                />
              </div>
            ) : (
              <div className={cn("relative", msg.content && "mb-2")}>
                <img
                  src={msg.media.url}
                  alt={msg.media.fileName}
                  className="rounded-xl max-w-[220px] max-h-[300px] object-cover"
                  style={{ display: "block" }}
                  loading="lazy"
                />
              </div>
            )
          )}

          {msg.content ? (
            <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
          ) : !msg.media ? (
            <p className="text-[15px] italic opacity-50">📎 Attachment</p>
          ) : null}
        </div>
      </motion.div>
    </motion.div>
  );
}
