import { cn } from "@/lib/utils/cn";

interface StatCardProps {
  label: string;
  value: string | number;
  delta?: string;
  deltaType?: "up" | "down" | "neutral";
  icon?: React.ReactNode;
  className?: string;
}

export function StatCard({
  label,
  value,
  delta,
  deltaType = "neutral",
  icon,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "bg-white border border-gray-100 rounded-xl p-5 flex flex-col gap-3",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          {label}
        </span>
        {icon && (
          <span className="text-gray-400">{icon}</span>
        )}
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-semibold text-gray-900 leading-none">
          {value}
        </span>
        {delta && (
          <span
            className={cn(
              "text-xs font-medium mb-0.5",
              deltaType === "up" && "text-emerald-600",
              deltaType === "down" && "text-red-500",
              deltaType === "neutral" && "text-gray-400"
            )}
          >
            {delta}
          </span>
        )}
      </div>
    </div>
  );
}
