import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { redirect } from "next/navigation";
import { NotificationsClient } from "./notifications-client";

export default async function NotificationsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const notifications = await prisma.notification.findMany({
    where: { agentId: session.agentId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return <NotificationsClient initialNotifications={JSON.parse(JSON.stringify(notifications))} />;
}
