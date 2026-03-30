import { getTopIssues } from "@/lib/services/analytics";
import { BubbleChart } from "./bubble-chart";

export async function TopIssuesChart() {
  const issues = await getTopIssues(7);

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-900">Issues</h3>
        <p className="text-xs text-gray-400 mt-0.5">AI-detected topics · last 7 days</p>
      </div>
      <BubbleChart data={issues} />
    </div>
  );
}
