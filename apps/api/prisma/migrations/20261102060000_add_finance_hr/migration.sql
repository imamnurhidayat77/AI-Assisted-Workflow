-- CreateEnum
CREATE TYPE "InvoiceDirection" AS ENUM ('AR', 'AP');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID', 'OVERDUE');

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "direction" "InvoiceDirection" NOT NULL,
    "partner" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NZD',
    "status" "InvoiceStatus" NOT NULL DEFAULT 'UNPAID',
    "dueLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CloseCheckItem" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "owner" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CloseCheckItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrPolicy" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HrPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRow" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "weekLabel" TEXT NOT NULL,
    "headcount" INTEGER NOT NULL,
    "onLeave" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveRow_pkey" PRIMARY KEY ("id")
);

