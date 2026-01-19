ALTER TABLE "subscription" DROP CONSTRAINT "subscription_stripe_customer_id_unique";--> statement-breakpoint
ALTER TABLE "subscription" DROP CONSTRAINT "subscription_stripe_subscription_id_unique";--> statement-breakpoint
ALTER TABLE "transaction" DROP CONSTRAINT "transaction_stripe_payment_intent_id_unique";--> statement-breakpoint
ALTER TABLE "transaction" DROP CONSTRAINT "transaction_stripe_session_id_unique";--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "nowpayments_payment_id" integer;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "nowpayments_invoice_id" integer;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "order_id" text;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "pay_currency" text;--> statement-breakpoint
ALTER TABLE "transaction" ADD COLUMN "pay_amount" text;--> statement-breakpoint
ALTER TABLE "subscription" DROP COLUMN "stripe_customer_id";--> statement-breakpoint
ALTER TABLE "subscription" DROP COLUMN "stripe_subscription_id";--> statement-breakpoint
ALTER TABLE "transaction" DROP COLUMN "stripe_payment_intent_id";--> statement-breakpoint
ALTER TABLE "transaction" DROP COLUMN "stripe_session_id";--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_nowpayments_payment_id_unique" UNIQUE("nowpayments_payment_id");