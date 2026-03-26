/**
 * Process-level cache for WorkspaceSetting.
 * WorkspaceSetting almost never changes — fetching it on every request/message
 * burns 500–800ms per call due to network latency to the DB.
 *
 * TTL is 30s. PATCH /api/settings/workspace calls invalidateWorkspaceCache()
 * so the next read always gets the fresh value immediately after a write.
 */
import { prisma } from "./db/prisma";
import type { WorkspaceSetting } from "@prisma/client";

const DEFAULT: WorkspaceSetting = {
  id: "default",
  aiEnabled: true,
  queueMessage: null,
  ticketMessage: null,
  queueTimeoutMinutes: 5,
  agentInactivityEnabled: true,
  agentInactivityHours: 3,
  updatedAt: new Date(0),
};

const TTL_MS = 30_000;

let cached: WorkspaceSetting | null = null;
let expiresAt = 0;

export async function getWorkspaceSetting(): Promise<WorkspaceSetting> {
  if (cached && Date.now() < expiresAt) return cached;
  cached = (await prisma.workspaceSetting.findUnique({ where: { id: "default" } })) ?? DEFAULT;
  expiresAt = Date.now() + TTL_MS;
  return cached;
}

export function invalidateWorkspaceCache(): void {
  cached = null;
  expiresAt = 0;
}
