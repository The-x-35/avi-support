import { ChevronLeft, Clock } from "lucide-react";

export default function ChatLoading() {
  return (
    <div className="flex flex-col bg-white w-full h-full">
      {/* Header */}
      <div
        className="shrink-0 border-b border-gray-100/80"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          backgroundColor: "rgba(255,255,255,0.92)",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div className="flex items-center justify-between px-2 py-2">
          <div className="flex items-center justify-center w-10 h-10 rounded-full text-gray-400">
            <ChevronLeft className="w-5 h-5" />
          </div>
          <div className="flex items-center justify-center w-10 h-10 rounded-full text-gray-300">
            <Clock className="w-[18px] h-[18px]" />
          </div>
        </div>
      </div>

      {/* Welcome message — shown immediately */}
      <div className="flex-1 overflow-hidden px-3 py-3">
        <div className="flex justify-start mb-1.5">
          <div className="max-w-[82%]">
            <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
              <p className="text-[15px] text-gray-800 leading-relaxed">
                Hi! I&apos;m Avi, your support assistant. How can I help you today?
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Input — shows connecting state */}
      <div
        className="shrink-0 bg-white/95 border-t border-gray-100"
        style={{
          paddingBottom: "max(env(safe-area-inset-bottom), 12px)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        <div className="flex items-center justify-center gap-1.5 text-xs mx-3 mt-2 mb-1 py-2 rounded-xl bg-gray-50 text-gray-400">
          <span className="w-3 h-3 border-2 border-gray-300 border-t-gray-500 rounded-full animate-spin shrink-0" />
          Connecting…
        </div>
        <div className="px-3 pt-2">
          <div className="flex items-end gap-2 bg-gray-50 rounded-2xl border border-gray-200 px-4 py-3">
            <div className="flex-1 h-5 rounded" />
            <div className="w-8 h-8 rounded-full bg-gray-100 shrink-0" />
          </div>
        </div>
      </div>
    </div>
  );
}
