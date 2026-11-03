-- CreateEnum
CREATE TYPE "SpaceVisibility" AS ENUM ('PRIVATE', 'ROLE');

-- CreateEnum
CREATE TYPE "SpaceStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SpaceActivityType" AS ENUM ('SPACE_CREATED', 'SPACE_ARCHIVED', 'ITEM_ADDED', 'ITEM_REMOVED', 'DRAFT_CREATED', 'DRAFT_APPROVED', 'DRAFT_REJECTED', 'CONTEXT_USED');

-- AlterTable
ALTER TABLE "ChatAudit" ADD COLUMN     "spaceId" TEXT;

-- AlterTable
ALTER TABLE "Draft" ADD COLUMN     "spaceId" TEXT;

-- AlterTable
ALTER TABLE "Space" ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "ownerRole" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "status" "SpaceStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "visibility" "SpaceVisibility" NOT NULL DEFAULT 'PRIVATE';

-- AlterTable
ALTER TABLE "SpaceItem" ADD COLUMN     "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "addedById" TEXT,
ADD COLUMN     "note" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "SpaceActivity" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "type" "SpaceActivityType" NOT NULL,
    "refId" TEXT,
    "summary" VARCHAR(280) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpaceActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SpaceActivity_spaceId_createdAt_idx" ON "SpaceActivity"("spaceId", "createdAt");

-- CreateIndex
CREATE INDEX "Draft_spaceId_idx" ON "Draft"("spaceId");

-- CreateIndex
CREATE INDEX "Space_ownerId_idx" ON "Space"("ownerId");

-- CreateIndex
CREATE INDEX "Space_status_idx" ON "Space"("status");

-- AddForeignKey
ALTER TABLE "SpaceActivity" ADD CONSTRAINT "SpaceActivity_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE SET NULL ON UPDATE CASCADE;

