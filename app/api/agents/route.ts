import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest, requireRole } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/db/prisma";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  const agents = await prisma.agent.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      email: true,
      avatarUrl: true,
      role: true,
      createdAt: true,
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(agents);
}

export async function PATCH(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  const roleError = requireRole(auth.payload, "ADMIN");
  if (roleError) return roleError;

  const { id, role, isActive } = await request.json();

  const agent = await prisma.agent.update({
    where: { id },
    data: {
      ...(role ? { role } : {}),
      ...(typeof isActive === "boolean" ? { isActive } : {}),
    },
  });

  return NextResponse.json(agent);
}
