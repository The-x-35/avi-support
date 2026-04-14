import { getVolumeByDay } from "@/lib/services/analytics";
import { BarChart } from "./bar-chart";

export async function DailyVolumeChart() {
  const volume = await getVolumeByDay(30);

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-5">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-900">Daily Conversations</h3>
        <p className="text-xs text-gray-400 mt-0.5">Conversations started per day (last 30 days)</p>
      </div>
      <BarChart
        data={volume.map((v) => ({ label: typeof v.date === "string" ? v.date : new Date(v.date).toISOString().split("T")[0], value: v.count }))}
        color="#8b5cf6"
      />
    </div>
  );
}
