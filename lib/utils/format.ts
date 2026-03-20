import { formatDistanceToNow, format, isToday, isYesterday } from "date-fns";

export function formatRelativeTime(date: string | Date): string {
  const d = new Date(date);
  return formatDistanceToNow(d, { addSuffix: true });
}

export function formatMessageTime(date: string | Date): string {
  const d = new Date(date);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return `Yesterday ${format(d, "HH:mm")}`;
  return format(d, "MMM d, HH:mm");
}

export function formatFullDate(date: string | Date): string {
  return format(new Date(date), "MMM d, yyyy 'at' HH:mm");
}

export function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

export function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  PENDING: "Pending",
  RESOLVED: "Resolved",
  ESCALATED: "Escalated",
  CLOSED: "Closed",
};

const CATEGORY_LABELS: Record<string, string> = {
  CARDS: "Cards",
  ACCOUNT: "Account",
  SPENDS: "Spends",
  KYC: "KYC",
  GENERAL: "General",
  OTHER: "Other",
};

const PRIORITY_LABELS: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

export function statusLabel(s: string) {
  return STATUS_LABELS[s] ?? s;
}
export function categoryLabel(c: string) {
  return CATEGORY_LABELS[c] ?? c;
}
export function priorityLabel(p: string) {
  return PRIORITY_LABELS[p] ?? p;
}
