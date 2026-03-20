import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Avi Support",
  description: "Internal support operations dashboard",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-white text-[#0f0f0f] antialiased">
        {children}
      </body>
    </html>
  );
}
