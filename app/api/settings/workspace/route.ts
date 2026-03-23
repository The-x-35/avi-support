import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/db/prisma";

async function getSetting() {
  return prisma.workspaceSetting.upsert({
    where: { id: "default" },
    create: { id: "default", aiEnabled: true },
    update: {},
  });
}

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
  const setting = await getSetting();
  return NextResponse.json(setting);
}

export async function PATCH(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;
const { aiEnabled } = await request.json();
  if (typeof aiEnabled !== "boolean")
    return NextResponse.json({ error: "aiEnabled must be boolean" }, { status: 400 });

  const setting = await prisma.workspaceSetting.upsert({
    where: { id: "default" },
    create: { id: "default", aiEnabled },
    update: { aiEnabled },
  });
  return NextResponse.json(setting);
}
