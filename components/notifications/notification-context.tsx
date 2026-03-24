"use client";

import { createContext, useContext } from "react";

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  conversationId?: string | null;
  isRead: boolean;
  createdAt: string;
}

interface NotificationContextValue {
  unreadCount: number;
  markAllRead: () => void;
}

export const NotificationContext = createContext<NotificationContextValue>({
  unreadCount: 0,
  markAllRead: () => {},
});

export function useNotifications() {
  return useContext(NotificationContext);
}
