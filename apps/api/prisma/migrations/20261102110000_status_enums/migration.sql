-- String → native enum, nilai baris dipertahankan (USING cast, bukan DROP).
-- Default string lama harus dilepas dulu agar cast kolom tidak gagal.
CREATE TYPE "DraftStatus" AS ENUM ('draft', 'in_review', 'approved', 'rejected');
CREATE TYPE "QuotationStatus" AS ENUM ('draft', 'sent', 'approved', 'rejected', 'expired');

ALTER TABLE "Draft" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Draft" ALTER COLUMN "status" TYPE "DraftStatus" USING "status"::"DraftStatus";
ALTER TABLE "Draft" ALTER COLUMN "status" SET DEFAULT 'draft'::"DraftStatus";

ALTER TABLE "Quotation" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Quotation" ALTER COLUMN "status" TYPE "QuotationStatus" USING "status"::"QuotationStatus";
ALTER TABLE "Quotation" ALTER COLUMN "status" SET DEFAULT 'draft'::"QuotationStatus";
