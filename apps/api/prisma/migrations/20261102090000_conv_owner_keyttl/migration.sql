-- AlterTable
ALTER TABLE "AppUser" ADD COLUMN     "apiKeyExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "assistantId" TEXT,
ADD COLUMN     "createdBy" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "Conversation_createdBy_updatedAt_idx" ON "Conversation"("createdBy", "updatedAt");

