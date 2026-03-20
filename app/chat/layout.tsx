export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center p-4">
      <div className="w-full max-w-md h-[720px] bg-white rounded-3xl shadow-xl overflow-hidden flex flex-col border border-gray-100">
        {children}
      </div>
    </div>
  );
}
