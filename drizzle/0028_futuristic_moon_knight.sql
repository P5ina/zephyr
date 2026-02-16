ALTER TABLE "transaction" DROP CONSTRAINT IF EXISTS "transaction_cryptomus_uuid_unique";--> statement-breakpoint
ALTER TABLE "transaction" DROP COLUMN IF EXISTS "cryptomus_uuid";
