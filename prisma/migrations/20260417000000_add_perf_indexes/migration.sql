-- Performance indexes for high-latency remote database

-- Note: composite index for ordered fetching (WHERE conversationId = ? ORDER BY createdAt)
CREATE INDEX IF NOT EXISTS "Note_conversationId_createdAt_idx" ON "Note" ("conversationId", "createdAt");

-- Message: composite index for suggestions query (WHERE conversationId = ? AND isPrivate = false ORDER BY createdAt)
CREATE INDEX IF NOT EXISTS "Message_conversationId_isPrivate_createdAt_idx" ON "Message" ("conversationId", "isPrivate", "createdAt");

-- Message: index for stale streaming cleanup (WHERE conversationId = ? AND isStreaming = true)
CREATE INDEX IF NOT EXISTS "Message_conversationId_isStreaming_idx" ON "Message" ("conversationId", "isStreaming");

-- Conversation: priority + lastMessageAt for priority-filtered list views
CREATE INDEX IF NOT EXISTS "Conversation_priority_lastMessageAt_idx" ON "Conversation" ("priority", "lastMessageAt" DESC);

-- Escalation: sort by createdAt DESC (default sort on escalations table page)
CREATE INDEX IF NOT EXISTS "Escalation_createdAt_idx" ON "Escalation" ("createdAt" DESC);

-- Escalation: filter by status + sort by createdAt (most common filter combo)
CREATE INDEX IF NOT EXISTS "Escalation_status_createdAt_idx" ON "Escalation" ("status", "createdAt" DESC);
