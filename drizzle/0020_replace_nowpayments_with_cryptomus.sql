-- Replace NowPayments columns with Cryptomus
ALTER TABLE "transaction" DROP COLUMN IF EXISTS "nowpayments_payment_id";
ALTER TABLE "transaction" DROP COLUMN IF EXISTS "nowpayments_invoice_id";
ALTER TABLE "transaction" ADD COLUMN "cryptomus_uuid" text UNIQUE;
