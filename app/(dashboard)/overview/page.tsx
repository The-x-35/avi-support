export const dynamic = "force-dynamic";
import { Suspense } from "react";
import { Header } from "@/components/layout/header";
import { OverviewStats } from "@/components/analytics/overview-stats";
import { RecentConversations } from "@/components/conversations/recent-conversations";
import { TopIssuesChart } from "@/components/analytics/top-issues-chart";
import { DailyVolumeChart } from "@/components/analytics/daily-volume-chart";

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-4 gap-4">
      {[1, 2, 3, 4].map((i: number) => (
        <div key={i} className="bg-white border border-gray-100 rounded-xl p-5 animate-pulse">
          <div className="h-3 w-20 bg-gray-100 rounded mb-3" />
          <div className="h-8 w-14 bg-gray-100 rounded" />
        </div>
      ))}
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5 h-72 animate-pulse">
      <div className="h-3 w-24 bg-gray-100 rounded mb-4" />
      <div className="h-full bg-gray-50 rounded-lg" />
    </div>
  );
}

function ConvSkeleton() {
  return (
    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden animate-pulse">
      {[1, 2, 3, 4, 5].map((i: number) => (
        <div key={i} className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-50">
          <div className="w-8 h-8 rounded-full bg-gray-100 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-32 bg-gray-100 rounded" />
            <div className="h-2.5 w-48 bg-gray-50 rounded" />
          </div>
          <div className="h-5 w-12 bg-gray-100 rounded-md" />
        </div>
      ))}
    </div>
  );
}

export default function OverviewPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header title="Overview" subtitle="Today's support activity" />
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <Suspense fallback={<StatsSkeleton />}>
          <OverviewStats />
        </Suspense>
        <div className="grid grid-cols-2 gap-4">
          <Suspense fallback={<ChartSkeleton />}>
            <DailyVolumeChart />
          </Suspense>
          <TopIssuesChart />
        </div>
        <Suspense fallback={<ConvSkeleton />}>
          <RecentConversations />
        </Suspense>
      </div>
    </div>
  );
}
