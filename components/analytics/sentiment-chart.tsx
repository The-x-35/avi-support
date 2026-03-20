import { getTagDistribution } from "@/lib/services/analytics";
import { PieChartComponent } from "./pie-chart";

export async function SentimentChart() {
  const tags = await getTagDistribution(7);
  type TagDistributionItem = Awaited<ReturnType<typeof getTagDistribution>>[number];
  const sentimentTags = tags.filter(
    (t: TagDistributionItem) => t.type === "sentiment"
  );

  const COLORS: Record<string, string> = {
    positive: "#10b981",
    neutral: "#6b7280",
    frustrated: "#f59e0b",
    angry: "#ef4444",
  };

  const data = sentimentTags.map((t: TagDistributionItem) => ({
    name: t.label ?? t.value ?? "",
    value: t.count,
    color: COLORS[t.value ?? ""] ?? "#9ca3af",
  }));

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">
        Sentiment (Last 7 days)
      </h3>
      <PieChartComponent data={data} />
    </div>
  );
}
