import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { Sidebar } from "@/components/layout/sidebar";
import { NotificationProvider } from "@/components/notifications/notification-provider";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/cookies";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  const [agent, unreadCount, cookieStore] = await Promise.all([
    prisma.agent.findUnique({
      where: { id: session.agentId },
      select: { id: true, name: true, email: true, avatarUrl: true, role: true },
    }),
    prisma.notification.count({ where: { agentId: session.agentId, isRead: false } }),
    cookies(),
  ]);

  if (!agent) {
    redirect("/login");
  }

  const agentToken = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value ?? "";

  return (
    <NotificationProvider agentId={agent.id} agentToken={agentToken} initialUnread={unreadCount}>
      <div className="flex h-screen overflow-hidden bg-gray-50">
        <Sidebar agent={agent} />
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {children}
        </main>
      </div>
    </NotificationProvider>
  );
}
