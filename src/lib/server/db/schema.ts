import {
	bigint,
	boolean,
	integer,
	json,
	pgTable,
	text,
	timestamp,
} from 'drizzle-orm/pg-core';

export const user = pgTable('user', {
	id: text('id').primaryKey(),
	email: text('email').notNull().unique(),
	username: text('username'),
	avatarUrl: text('avatar_url'),
	githubId: integer('github_id').unique(),
	tokens: integer('tokens').notNull().default(25),
	bonusTokens: integer('bonus_tokens').notNull().default(0),
	nsfwEnabled: boolean('nsfw_enabled').notNull().default(true),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
		.notNull()
		.defaultNow(),
});

export const session = pgTable('session', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id),
	expiresAt: timestamp('expires_at', {
		withTimezone: true,
		mode: 'date',
	}).notNull(),
});

export const lora = pgTable('lora', {
	id: text('id').primaryKey(),
	visibleId: text('visible_id').notNull().unique(),
	name: text('name').notNull(),
	falUrl: text('fal_url').notNull(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
		.notNull()
		.defaultNow(),
});

export const generation = pgTable('generation', {
	id: text('id').primaryKey(),
	visibleId: text('visible_id').notNull().unique(),
	prompt: text('prompt').notNull(),
	imageUrl: text('image_url').notNull(),
	loraIds: json('lora_ids').$type<string[]>().default([]),
	seed: integer('seed'),
	width: integer('width').notNull(),
	height: integer('height').notNull(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
		.notNull()
		.defaultNow(),
});

export const subscription = pgTable('subscription', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id)
		.unique(),
	tier: text('tier', { enum: ['free', 'pro'] }).notNull().default('free'),
	status: text('status', {
		enum: ['active', 'canceled', 'past_due', 'incomplete'],
	})
		.notNull()
		.default('active'),
	currentPeriodEnd: timestamp('current_period_end', {
		withTimezone: true,
		mode: 'date',
	}),
	monthlyTokenAllocation: integer('monthly_token_allocation')
		.notNull()
		.default(25),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
		.notNull()
		.defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
		.notNull()
		.defaultNow(),
});

export const transaction = pgTable('transaction', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id),
	nowpaymentsPaymentId: bigint('nowpayments_payment_id', { mode: 'number' }).unique(),
	nowpaymentsInvoiceId: bigint('nowpayments_invoice_id', { mode: 'number' }),
	orderId: text('order_id'),
	type: text('type', { enum: ['subscription', 'credit_pack'] }).notNull(),
	amount: integer('amount').notNull(),
	payCurrency: text('pay_currency'),
	payAmount: text('pay_amount'),
	tokensGranted: integer('tokens_granted').notNull(),
	status: text('status', { enum: ['pending', 'confirmed', 'completed', 'failed', 'expired'] })
		.notNull()
		.default('pending'),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
		.notNull()
		.defaultNow(),
});

export const trainingJob = pgTable('training_job', {
	id: text('id').primaryKey(),
	visibleId: text('visible_id').notNull().unique(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id),
	name: text('name').notNull(),
	trainingType: text('training_type', {
		enum: ['content', 'style', 'balanced'],
	})
		.notNull()
		.default('balanced'),
	steps: integer('steps').notNull().default(1000),
	status: text('status', {
		enum: [
			'uploading',
			'captioning',
			'ready',
			'training',
			'completed',
			'failed',
		],
	})
		.notNull()
		.default('uploading'),
	progress: integer('progress').default(0),
	falRequestId: text('fal_request_id'),
	resultLoraId: text('result_lora_id').references(() => lora.id),
	errorMessage: text('error_message'),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
		.notNull()
		.defaultNow(),
	completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
});

export const trainingImage = pgTable('training_image', {
	id: text('id').primaryKey(),
	trainingJobId: text('training_job_id')
		.notNull()
		.references(() => trainingJob.id, { onDelete: 'cascade' }),
	imageUrl: text('image_url').notNull(),
	filename: text('filename').notNull(),
	autoCaption: text('auto_caption'),
	userCaption: text('user_caption'),
	captionStatus: text('caption_status', {
		enum: ['pending', 'processing', 'done', 'failed'],
	})
		.notNull()
		.default('pending'),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
		.notNull()
		.defaultNow(),
});

export type Session = typeof session.$inferSelect;
export type User = typeof user.$inferSelect;
export type Lora = typeof lora.$inferSelect;
export type Generation = typeof generation.$inferSelect;
export type Subscription = typeof subscription.$inferSelect;
export type Transaction = typeof transaction.$inferSelect;
export type TrainingJob = typeof trainingJob.$inferSelect;
export type TrainingImage = typeof trainingImage.$inferSelect;
