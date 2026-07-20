-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "exchangeRate" DECIMAL(12,6) NOT NULL DEFAULT 1,
ADD COLUMN     "paidCurrencyAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "paymentCurrency" TEXT NOT NULL DEFAULT 'ILS';

-- AlterTable
ALTER TABLE "Tenant" ALTER COLUMN "timezone" SET DEFAULT 'Asia/Hebron',
ALTER COLUMN "currency" SET DEFAULT 'ILS';

-- AlterTable
ALTER TABLE "TenantSetting" ADD COLUMN     "exchangeRates" JSONB NOT NULL DEFAULT '{"USD": 3.7, "JOD": 5.2}',
ALTER COLUMN "taxRate" SET DEFAULT 16;

