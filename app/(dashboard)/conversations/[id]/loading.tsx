export default function ConversationLoading() {
  return (
    <div className="flex h-full overflow-hidden animate-pulse">
      {/* Left sidebar skeleton */}
      <div className="w-64 shrink-0 border-r border-gray-100 bg-white flex flex-col overflow-hidden">
        <div className="h-14 px-4 flex items-center border-b border-gray-100">
          <div className="h-3 w-24 bg-gray-200 rounded" />
        </div>
        <div className="flex-1 overflow-y-auto">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="px-3 py-3 border-b border-gray-50">
              <div className="flex items-start gap-2">
                <div className="w-8 h-8 rounded-full bg-gray-200 shrink-0" />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="h-3 w-24 bg-gray-200 rounded" />
                  <div className="h-2.5 w-36 bg-gray-100 rounded" />
                  <div className="h-2 w-16 bg-gray-100 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main chat area skeleton */}
      <div className="flex flex-col flex-1 min-w-0 border-r border-gray-100">
        {/* Chat header */}
        <div className="h-14 flex items-center gap-3 px-5 border-b border-gray-100 bg-white shrink-0">
          <div className="w-4 h-4 bg-gray-200 rounded" />
          <div className="w-8 h-8 rounded-full bg-gray-200" />
          <div className="flex-1 flex items-center gap-2">
            <div className="h-3.5 w-28 bg-gray-200 rounded" />
            <div className="h-4 w-10 bg-gray-100 rounded" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-7 w-20 bg-gray-100 rounded-lg" />
            <div className="h-7 w-24 bg-gray-100 rounded-lg" />
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-hidden p-5 space-y-4 bg-gray-50">
          {/* Incoming message */}
          <div className="flex items-end gap-2 justify-start">
            <div className="max-w-[60%] bg-white rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
              <div className="space-y-1.5">
                <div className="h-3 w-48 bg-gray-100 rounded" />
                <div className="h-3 w-32 bg-gray-100 rounded" />
              </div>
            </div>
          </div>
          {/* Outgoing message */}
          <div className="flex items-end gap-2 justify-end">
            <div className="max-w-[60%] bg-gray-200 rounded-2xl rounded-br-sm px-4 py-3">
              <div className="space-y-1.5">
                <div className="h-3 w-56 bg-gray-300/50 rounded" />
                <div className="h-3 w-40 bg-gray-300/50 rounded" />
                <div className="h-3 w-20 bg-gray-300/50 rounded" />
              </div>
            </div>
          </div>
          {/* Incoming message */}
          <div className="flex items-end gap-2 justify-start">
            <div className="max-w-[60%] bg-white rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
              <div className="space-y-1.5">
                <div className="h-3 w-44 bg-gray-100 rounded" />
              </div>
            </div>
          </div>
          {/* Outgoing message */}
          <div className="flex items-end gap-2 justify-end">
            <div className="max-w-[60%] bg-gray-200 rounded-2xl rounded-br-sm px-4 py-3">
              <div className="space-y-1.5">
                <div className="h-3 w-36 bg-gray-300/50 rounded" />
                <div className="h-3 w-52 bg-gray-300/50 rounded" />
              </div>
            </div>
          </div>
        </div>

        {/* Input area */}
        <div className="px-5 py-3 bg-white border-t border-gray-100 shrink-0">
          <div className="flex items-end gap-2 bg-gray-50 rounded-xl border border-gray-200 px-4 py-3">
            <div className="flex-1 h-5 rounded" />
            <div className="w-8 h-8 rounded-full bg-gray-100 shrink-0" />
          </div>
        </div>
      </div>

      {/* Right panel skeleton */}
      <div className="w-72 shrink-0 bg-white flex flex-col overflow-hidden">
        <div className="h-14 px-5 flex items-center border-b border-gray-100">
          <div className="h-3.5 w-20 bg-gray-200 rounded" />
        </div>
        <div className="p-5 space-y-5">
          {/* User info */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-200" />
            <div className="space-y-1.5">
              <div className="h-3.5 w-24 bg-gray-200 rounded" />
              <div className="h-2.5 w-32 bg-gray-100 rounded" />
            </div>
          </div>
          {/* Details */}
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="h-2.5 w-16 bg-gray-100 rounded" />
                <div className="h-2.5 w-20 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <div className="h-3 w-20 bg-gray-200 rounded" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-full bg-gray-100 shrink-0" />
                <div className="space-y-1">
                  <div className="h-2.5 w-28 bg-gray-100 rounded" />
                  <div className="h-2 w-16 bg-gray-50 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
