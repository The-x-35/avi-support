import { cn } from "@/lib/utils/cn";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "error" | "info" | "muted";
  size?: "sm" | "md";
  className?: string;
}

const variants = {
  default: "bg-gray-100 text-gray-700",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  error: "bg-red-50 text-red-700",
  info: "bg-blue-50 text-blue-700",
  muted: "bg-gray-50 text-gray-500",
};

const sizes = {
  sm: "text-xs px-1.5 py-0.5",
  md: "text-xs px-2 py-1",
};

export function Badge({
  children,
  variant = "default",
  size = "sm",
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center font-medium rounded-md",
        variants[variant],
        sizes[size],
        className
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
    OPEN: { label: "Open", variant: "info" },
    PENDING: { label: "Pending", variant: "warning" },
    RESOLVED: { label: "Resolved", variant: "success" },
    ESCALATED: { label: "Escalated", variant: "error" },
    CLOSED: { label: "Closed", variant: "muted" },
  };
  const config = map[status] ?? { label: status, variant: "default" };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
    LOW: { label: "Low", variant: "muted" },
    MEDIUM: { label: "Medium", variant: "default" },
    HIGH: { label: "High", variant: "warning" },
    CRITICAL: { label: "Critical", variant: "error" },
  };
  const config = map[priority] ?? { label: priority, variant: "default" };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function SentimentBadge({ sentiment }: { sentiment: string }) {
  const map: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
    positive: { label: "Positive", variant: "success" },
    neutral: { label: "Neutral", variant: "default" },
    frustrated: { label: "Frustrated", variant: "warning" },
    angry: { label: "Angry", variant: "error" },
  };
  const config = map[sentiment] ?? { label: sentiment, variant: "default" };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
