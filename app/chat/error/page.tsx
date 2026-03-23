export default function ChatErrorPage() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
      <p className="text-sm font-semibold text-gray-900">Unable to start chat</p>
      <p className="text-xs text-gray-400">A user ID is required. Please open this chat from the app.</p>
    </div>
  );
}
