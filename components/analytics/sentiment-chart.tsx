import { getTagDistribution } from "@/lib/services/analytics";
import { PieChartComponent } from "./pie-chart";

export async function SentimentChart() {
  const tags = await getTagDistribution(7);
  type TagDistributionItem = Awaited<ReturnType<typeof getTagDistribution>>[number];
  const sentimentNames = new Set(["Positive", "Neutral", "Frustrated", "Angry"]);
  const sentimentTags = tags.filter((t: TagDistributionItem) => sentimentNames.has(t.name ?? ""));

  const data = sentimentTags.map((t: TagDistributionItem) => ({
    name: t.name ?? "",
    value: t.count,
    color: t.color ?? "#9ca3af",
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
