/*
  Warnings:

  - You are about to drop the column `conversationId` on the `Ticket` table. All the data in the column will be lost.
  - Added the required column `createdById` to the `Ticket` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_conversationId_fkey";

-- DropIndex
DROP INDEX "Ticket_conversationId_key";

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "ticketId" TEXT;

-- AlterTable
ALTER TABLE "Ticket" DROP COLUMN "conversationId",
ADD COLUMN     "createdById" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Conversation_ticketId_idx" ON "Conversation"("ticketId");

-- CreateIndex
CREATE INDEX "Ticket_createdById_idx" ON "Ticket"("createdById");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
