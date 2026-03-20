import { getTopIssues } from "@/lib/services/analytics";
import { BarChart } from "./bar-chart";

export async function TopIssuesChart() {
  const issues = await getTopIssues(7);
  type TopIssueItem = Awaited<ReturnType<typeof getTopIssues>>[number];

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">
        Top Issues (Last 7 days)
      </h3>
      <BarChart
        data={issues.map((i: TopIssueItem) => ({
          label: i.label ?? i.value ?? "",
          value: i.count,
        }))}
        color="#3b82f6"
      />
    </div>
  );
}
