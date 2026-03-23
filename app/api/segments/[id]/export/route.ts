import { type NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { exportSegmentCsv } from "@/lib/services/segments";
import { prisma } from "@/lib/db/prisma";
import { createRateLimiter, tooManyRequests } from "@/lib/rate-limit";

// CSV exports are heavy — 5 per agent per minute
const limiter = createRateLimiter({ limit: 5, windowMs: 60_000 });

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if ("error" in auth) return auth.error;

  if (!limiter.check(auth.payload.agentId)) return tooManyRequests();

  const { id } = await params;
  const segment = await prisma.segment.findUnique({ where: { id } });

  if (!segment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const csv = await exportSegmentCsv(id);
  const filename = `${segment.name.replace(/[^a-z0-9]/gi, "_")}_${new Date().toISOString().split("T")[0]}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
