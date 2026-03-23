"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence, useMotionValue, useTransform, useAnimate } from "framer-motion";
import { cn } from "@/lib/utils/cn";
import { Send, ChevronLeft, Shield, CheckCircle, ArrowUpCircle } from "lucide-react";
import confetti from "canvas-confetti";
import { Fireworks } from "@fireworks-js/react";

// iMessage-accurate spring: fast rise, tiny overshoot, snaps clean
const BUBBLE_SPRING = {
  type: "spring" as const,
  stiffness: 520,
  damping: 32,
  mass: 0.4,
};

const BOT_GIFS = [
  "/bots/robot.gif", "/bots/robot-2.gif", "/bots/robot-3.gif", "/bots/robot-4.gif",
  "/bots/robot-5.gif", "/bots/robot-6.gif", "/bots/robot-7.gif", "/bots/brain.gif",
  "/bots/robot-arm.gif", "/bots/robot-cycle.gif", "/bots/robot-talking.gif",
  "/bots/robot-3.gif", "/bots/robotics.gif", "/bots/settings.gif",
  "/bots/turing-test.gif", "/bots/chatbot-2.gif", "/bots/robotic-arm.gif",
];

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

interface Message {
  id: string;
  senderType: "USER" | "AI" | "AGENT";
  content: string;
  isStreaming: boolean;
  createdAt: string;
  agent: { name: string; avatarUrl: string | null } | null;
}

interface Conversation {
  id: string;
  category: string;
  status: string;
  isAiPaused: boolean;
  assignedAgentId: string | null;
  messages: Message[];
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

function getUserId(): string {
  let id = localStorage.getItem("avi_user_id");
  if (!id) {
    id = `user_${Math.random().toString(36).slice(2, 11)}`;
    localStorage.setItem("avi_user_id", id);
  }
  return id;
}

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
function playMessageSound() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.18, ctx.currentTime);
    master.connect(ctx.destination);

    // Primary sweep: 900 → 1700 Hz — the iMessage "whoosh"
    const osc1 = ctx.createOscillator();
    const g1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(900, ctx.currentTime);
    osc1.frequency.exponentialRampToValueAtTime(1700, ctx.currentTime + 0.13);
    g1.gain.setValueAtTime(0, ctx.currentTime);
    g1.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.018);
    g1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
    osc1.connect(g1); g1.connect(master);
    osc1.start(ctx.currentTime); osc1.stop(ctx.currentTime + 0.22);

    // Second harmonic — adds the bright, airy quality
    const osc2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(1800, ctx.currentTime);
    osc2.frequency.exponentialRampToValueAtTime(3400, ctx.currentTime + 0.11);
    g2.gain.setValueAtTime(0, ctx.currentTime);
    g2.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 0.015);
    g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc2.connect(g2); g2.connect(master);
    osc2.start(ctx.currentTime); osc2.stop(ctx.currentTime + 0.18);

    // Soft body — triangle wave for warmth
    const osc3 = ctx.createOscillator();
    const g3 = ctx.createGain();
    osc3.type = "triangle";
    osc3.frequency.setValueAtTime(1100, ctx.currentTime);
    osc3.frequency.exponentialRampToValueAtTime(2000, ctx.currentTime + 0.1);
    g3.gain.setValueAtTime(0, ctx.currentTime);
    g3.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.012);
    g3.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc3.connect(g3); g3.connect(master);
    osc3.start(ctx.currentTime); osc3.stop(ctx.currentTime + 0.15);

    setTimeout(() => ctx.close(), 600);
  } catch { /* audio unavailable */ }
}

function triggerHaptic(pattern: number | number[] = 10) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate(pattern);
  }
}

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

export function UserChat({ conversation: initial }: { conversation: Conversation }) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(initial.messages);
  const [convStatus, setConvStatus] = useState(initial.status);
  const [isAgentActive, setIsAgentActive] = useState(initial.isAiPaused && !!initial.assignedAgentId);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
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
  const gifMapRef = useRef<Map<string, string>>(new Map());
  const gifQueueRef = useRef<string[]>([]);
  const lastGifRef = useRef<string | null>(null);

  function nextGif(): string {
    if (gifQueueRef.current.length === 0) {
      const shuffled = [...BOT_GIFS];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      // Ensure the first item popped (last in array) doesn't match the previous gif
      if (lastGifRef.current && shuffled[shuffled.length - 1] === lastGifRef.current) {
        const swapIdx = Math.floor(Math.random() * (shuffled.length - 1));
        [shuffled[shuffled.length - 1], shuffled[swapIdx]] = [shuffled[swapIdx], shuffled[shuffled.length - 1]];
      }
      gifQueueRef.current = shuffled;
    }
    const gif = gifQueueRef.current.pop()!;
    lastGifRef.current = gif;
    return gif;
  }

  function getGifForMsg(id: string): string {
    if (!gifMapRef.current.has(id)) {
      gifMapRef.current.set(id, nextGif());
    }
    return gifMapRef.current.get(id)!;
  }

  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [inputScope, animateInput] = useAnimate();

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
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
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "auth", token: getUserId(), role: "user" }));
      ws.send(JSON.stringify({ type: "join", conversationId: initial.id }));
      setWsReady(true);
      setWsError(false);
    };

    ws.onmessage = (event) => {
      const evt = JSON.parse(event.data);
      switch (evt.type) {
        case "message": {
          const p = evt.payload;
          if (p.conversationId !== initial.id || p.senderType === "USER") return;
          setMessages((prev) => {
            if (prev.some((m) => m.id === p.id)) return prev;
            return [...prev, {
              id: p.id, senderType: p.senderType, content: p.content,
              isStreaming: false, createdAt: p.createdAt,
              agent: p.senderName ? { name: p.senderName, avatarUrl: null } : null,
            }];
          });
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
      }
    };

    ws.onclose = () => setWsReady(false);
    ws.onerror = () => { setWsReady(false); setWsError(true); };

    return () => {
      if (ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: "leave", conversationId: initial.id }));
      ws.close();
    };
  }, [initial.id]);

  async function sendMessage() {
    if (!text.trim() || sending || !wsReady) return;
    const content = text.trim();
    const tempId = `temp_${Date.now()}`;

    // Sound + haptic feedback
    playMessageSound();
    triggerHaptic(12);

    // Trigger screen effect if message matches
    const effect = detectEffect(content);
    if (effect === "confetti") fireConfetti();
    else if (effect === "hearts") fireHearts();
    else if (effect === "fireworks" || effect === "lasers") setActiveEffect(effect);

    // Input launch animation: squeeze down then snap back
    animateInput(inputScope.current, { scaleY: 0.82, opacity: 0.5 }, { duration: 0.08 }).then(() => {
      setText("");
      animateInput(inputScope.current, { scaleY: 1, opacity: 1 }, { duration: 0.18, ease: [0.34, 1.56, 0.64, 1] });
    });

    setSending(true);
    setFreshIds((prev) => new Set([...prev, tempId]));
    setMessages((prev) => [...prev, {
      id: tempId, senderType: "USER",
      content, isStreaming: false,
      createdAt: new Date().toISOString(), agent: null,
    }]);
    wsRef.current!.send(JSON.stringify({ type: "send_message", conversationId: initial.id, content }));
    setSending(false);
    inputRef.current?.focus();
    // Retire freshId after animation completes
    setTimeout(() => setFreshIds((prev) => { const n = new Set(prev); n.delete(tempId); return n; }), 800);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  const categoryLabel = CATEGORY_LABELS[initial.category] ?? "Support";

  return (
    <div
      className="flex flex-col bg-white w-full h-full"
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      {activeEffect === "lasers" && <LaserOverlay onDone={() => setActiveEffect(null)} />}
      {activeEffect === "fireworks" && <FireworksOverlay onDone={() => setActiveEffect(null)} />}

      {/* Header — frosted glass, safe area top */}
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
        <div className="flex items-center gap-2 px-2 py-2">
          <button
            onClick={() => router.push("/chat")}
            className="flex items-center justify-center w-10 h-10 rounded-full text-gray-400 active:bg-gray-100 transition-colors"
            style={{ touchAction: "manipulation" }}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <img
            key={isAgentActive ? "human" : "chatbot"}
            src={isAgentActive ? "/human.gif" : "/chatbot.gif"}
            alt={isAgentActive ? "Support Agent" : "Avi"}
            className="w-10 h-10 shrink-0 object-contain"
            unselectable="on"
          />
          <div className="flex-1 min-w-0 ml-0.5">
            <p className="text-[15px] font-semibold text-gray-900 leading-tight">{isAgentActive ? "Support Agent" : "Avi"}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <p className="text-xs text-gray-400">{categoryLabel} support</p>
            </div>
          </div>
        </div>
      </div>

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
            <div className="flex items-end gap-2 max-w-[82%]">
              <img src="/chatbot.gif" alt="Avi" className="w-8 h-8 rounded-full shrink-0 object-cover" />
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
                  <ChatBubble message={msg} isFresh={freshIds.has(msg.id)} gif={msg.senderType !== "USER" ? getGifForMsg(msg.id) : undefined} />
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
              <div className="flex items-end gap-2 max-w-[82%]">
                <img src={getGifForMsg(streamingId)} alt="Avi" className="w-8 h-8 rounded-full shrink-0 object-cover" />
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
          <motion.div
            ref={inputScope}
            className={cn(
              "flex items-end gap-2 rounded-3xl border px-4 py-2.5",
              wsReady ? "border-gray-200" : "border-gray-100 opacity-60"
            )}
            style={{ backgroundColor: "#f2f2f7", transformOrigin: "bottom center" }}
          >
            <textarea
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={wsReady ? "Talk to Avi…" : "Connecting…"}
              disabled={!wsReady}
              rows={1}
              className="flex-1 min-w-0 bg-transparent text-gray-900 placeholder:text-gray-400 outline-none ring-0 resize-none leading-relaxed disabled:cursor-not-allowed focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
              style={{ minHeight: "1.5rem", maxHeight: "7rem", outline: "none", boxShadow: "none", fontSize: "16px" }}
            />
            <motion.button
              onClick={sendMessage}
              disabled={!text.trim() || sending || !wsReady}
              whileTap={text.trim() && wsReady ? { scale: 0.84 } : {}}
              className={cn(
                "w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all duration-150",
                text.trim() && wsReady && !sending
                  ? "bg-[#0f0f0f] text-white shadow-sm"
                  : "bg-gray-200 text-gray-400 cursor-not-allowed"
              )}
              style={{ touchAction: "manipulation" }}
            >
              <Send className="w-4 h-4" />
            </motion.button>
          </motion.div>
          <p className="text-[10px] text-center text-gray-300 mt-2 mb-0.5 select-none">Secured by Avici · Your data is protected</p>
        </div>
      </div>
    </div>
  );
}

function ChatBubble({ message: msg, isFresh = false, gif }: { message: Message; isFresh?: boolean; gif?: string }) {
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
        {!isUser && (
          <img
            src={gif}
            alt={isAgent ? "Agent" : "Avi"}
            className="w-8 h-8 rounded-full shrink-0 object-cover"
          />
        )}

        <div
          className={cn(
            "px-4 py-[11px] rounded-2xl",
            isUser
              ? "text-white rounded-br-sm"
              : isAgent
              ? "bg-blue-50 border border-blue-100 text-gray-900 rounded-bl-sm shadow-sm"
              : "bg-white border border-gray-100 text-gray-900 rounded-bl-sm shadow-sm"
          )}
          style={isUser ? { backgroundColor: "lab(75 -39.57 -11.86)" } : undefined}
        >
          {isAgent && msg.agent?.name && (
            <p className="text-[11px] font-semibold text-blue-500 mb-1">{msg.agent.name}</p>
          )}
          <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
        </div>
      </motion.div>
    </motion.div>
  );
}
