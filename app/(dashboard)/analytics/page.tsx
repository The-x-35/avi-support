export const dynamic = "force-dynamic";
import { Header } from "@/components/layout/header";
import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";

export default function AnalyticsPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Analytics" subtitle="Tag distribution, sentiment trends, and issue volumes" />
      <div className="flex-1 overflow-y-auto p-6">
        <AnalyticsDashboard />
      </div>
    </div>
  );
}
