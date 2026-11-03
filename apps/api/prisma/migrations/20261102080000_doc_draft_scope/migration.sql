-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "domain" TEXT NOT NULL DEFAULT 'general';

-- AlterTable
ALTER TABLE "Draft" ADD COLUMN     "createdBy" TEXT;

-- CreateTable
CREATE TABLE "Space" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "tone" TEXT NOT NULL DEFAULT 'blue',
    "icon" TEXT NOT NULL DEFAULT 'grid',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Space_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpaceItem" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL,
    "preview" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpaceItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SpaceItem_spaceId_idx" ON "SpaceItem"("spaceId");

-- CreateIndex
CREATE INDEX "Draft_createdBy_idx" ON "Draft"("createdBy");

-- AddForeignKey
ALTER TABLE "SpaceItem" ADD CONSTRAINT "SpaceItem_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

