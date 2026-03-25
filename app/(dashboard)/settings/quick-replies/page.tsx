import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { CannedResponsesSettings } from "../canned-responses";

export default function QuickRepliesPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="h-14 flex items-center gap-3 px-6 border-b border-gray-100 bg-white shrink-0">
        <Link
          href="/settings"
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Settings
        </Link>
        <span className="text-gray-200">/</span>
        <h1 className="text-[15px] font-semibold text-gray-900">Quick Replies</h1>
      </div>
      <div className="flex-1 overflow-y-auto p-6 max-w-2xl">
        <CannedResponsesSettings />
      </div>
    </div>
  );
}
