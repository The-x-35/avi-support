"use client";

import { createContext, useContext } from "react";

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  conversationId?: string | number | null;
  isRead: boolean;
  createdAt: string;
}

interface NotificationContextValue {
  unreadCount: number;
  markOneRead: (id: string) => void;
  markAllRead: () => void;
}

export const NotificationContext = createContext<NotificationContextValue>({
  unreadCount: 0,
  markOneRead: () => {},
  markAllRead: () => {},
});

export function useNotifications() {
  return useContext(NotificationContext);
}
