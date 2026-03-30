"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";

export interface ChatTab {
  convId: string;
  label: string;   // truncated user identifier
  convNum: number; // numeric conversation id
}

interface ChatTabsCtx {
  tabs: ChatTab[];
  openTab: (convId: string, label: string, convNum: number) => void;
  closeTab: (convId: string) => void;
}

const ChatTabsContext = createContext<ChatTabsCtx>({
  tabs: [],
  openTab: () => {},
  closeTab: () => {},
});

const MAX_TABS = 6;
const STORAGE_KEY = "avi_chat_tabs";

export function ChatTabsProvider({ children }: { children: React.ReactNode }) {
  const [tabs, setTabs] = useState<ChatTab[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setTabs(JSON.parse(stored));
    } catch {}
  }, []);

  const openTab = useCallback((convId: string, label: string, convNum: number) => {
    setTabs((prev) => {
      if (prev.some((t) => t.convId === convId)) return prev;
      const next = [...prev, { convId, label, convNum }].slice(-MAX_TABS);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const closeTab = useCallback((convId: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.convId !== convId);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  return (
    <ChatTabsContext.Provider value={{ tabs, openTab, closeTab }}>
      {children}
    </ChatTabsContext.Provider>
  );
}

export function useChatTabs() {
  return useContext(ChatTabsContext);
}
