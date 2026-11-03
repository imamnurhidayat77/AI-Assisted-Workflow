-- CreateTable
CREATE TABLE "DistributorSale" (
    "id" TEXT NOT NULL,
    "distributor" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "product" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "quarter" TEXT NOT NULL,
    "units" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'NZD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DistributorSale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DistributorSale_country_quarter_idx" ON "DistributorSale"("country", "quarter");
