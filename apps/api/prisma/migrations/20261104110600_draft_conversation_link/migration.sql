-- AlterTable
ALTER TABLE "Draft" ADD COLUMN     "sourceConversationId" TEXT;

-- AlterTable
ALTER TABLE "SpaceItem" ADD COLUMN     "sourceId" TEXT;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_sourceConversationId_fkey" FOREIGN KEY ("sourceConversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

