export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-[#f5f5f7] flex items-center justify-center md:min-h-screen md:p-4" style={{ minHeight: "100dvh" }}>
      <div className="w-full bg-white flex flex-col overflow-hidden md:max-w-md md:rounded-3xl md:shadow-xl md:border md:border-gray-100" style={{ height: "100dvh", maxHeight: "100dvh" }}>
        {children}
      </div>
    </div>
  );
}
