-- CreateTable
CREATE TABLE "Draft" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'general',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "assistantId" TEXT,
    "skillsUsed" JSONB NOT NULL DEFAULT '[]',
    "sources" JSONB NOT NULL DEFAULT '[]',
    "tenderIds" JSONB NOT NULL DEFAULT '[]',
    "sourceDocumentId" TEXT,
    "sourceDocumentName" TEXT,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "history" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

