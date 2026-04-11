import { getOverviewStats } from "@/lib/services/analytics";
import { StatCard } from "@/components/ui/stat-card";
import { formatSeconds, formatNumber } from "@/lib/utils/format";
import { MessageSquare, CheckCircle, AlertTriangle, Clock } from "lucide-react";

export async function OverviewStats() {
  const stats = await getOverviewStats();

  const delta = stats.totalToday - stats.totalYesterday;
  const deltaStr =
    delta === 0
      ? "same as yesterday"
      : delta > 0
      ? `+${delta} vs yesterday`
      : `${delta} vs yesterday`;

  return (
    <div className="grid grid-cols-4 gap-4">
      <StatCard
        label="Chats Today"
        value={formatNumber(stats.totalToday)}
        delta={deltaStr}
        deltaType={delta > 0 ? "up" : delta < 0 ? "down" : "neutral"}
        icon={<MessageSquare className="w-4 h-4" />}
      />
      <StatCard
        label="Open"
        value={stats.openCount}
        icon={<AlertTriangle className="w-4 h-4" />}
      />
      <StatCard
        label="Resolved Today"
        value={stats.resolvedToday}
        icon={<CheckCircle className="w-4 h-4" />}
      />
      <StatCard
        label="Avg Response Today"
        value={stats.avgResponseSeconds > 0 ? formatSeconds(stats.avgResponseSeconds) : "—"}
        delta={stats.avgResponseSeconds > 0 ? undefined : "no agent replies today"}
        icon={<Clock className="w-4 h-4" />}
      />
    </div>
  );
}
