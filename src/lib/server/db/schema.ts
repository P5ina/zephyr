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
	tokens: integer('tokens').notNull().default(50),
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

export type Session = typeof session.$inferSelect;
export type User = typeof user.$inferSelect;
export type Subscription = typeof subscription.$inferSelect;
export type Transaction = typeof transaction.$inferSelect;

export const vastInstance = pgTable('vast_instance', {
	id: text('id').primaryKey(), // Vast.ai instance ID as string
	status: text('status', {
		enum: ['creating', 'starting', 'ready', 'busy', 'stopping', 'stopped', 'failed'],
	})
		.notNull()
		.default('creating'),

	// Connection info
	httpHost: text('http_host'),
	httpPort: integer('http_port'),

	// Metadata
	gpuName: text('gpu_name'),
	costPerHour: text('cost_per_hour'),

	// Tracking
	currentJobId: text('current_job_id'),
	lastActivityAt: timestamp('last_activity_at', { withTimezone: true, mode: 'date' }),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
	errorMessage: text('error_message'),
});

export type VastInstance = typeof vastInstance.$inferSelect;

export const assetGeneration = pgTable('asset_generation', {
	id: text('id').primaryKey(),
	visibleId: text('visible_id').notNull().unique(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id),

	// Configuration
	assetType: text('asset_type', { enum: ['sprite', 'texture'] }).notNull(),
	prompt: text('prompt').notNull(),
	negativePrompt: text('negative_prompt'),
	width: integer('width').notNull().default(512),
	height: integer('height').notNull().default(512),

	// Status
	status: text('status', {
		enum: ['pending', 'queued', 'processing', 'post_processing', 'completed', 'failed'],
	})
		.notNull()
		.default('pending'),
	progress: integer('progress').notNull().default(0),
	currentStage: text('current_stage'),
	vastInstanceId: text('vast_instance_id').references(() => vastInstance.id),
	comfyuiPromptId: text('comfyui_prompt_id'),
	retryCount: integer('retry_count').notNull().default(0),

	// Results
	resultUrls: json('result_urls').$type<{
		raw?: string;
		processed?: string;
		thumbnail?: string;
	}>(),
	pbrUrls: json('pbr_urls').$type<{
		baseColor?: string;
		normal?: string;
		roughness?: string;
		height?: string;
	}>(),

	// Metadata
	seed: integer('seed'),
	tokenCost: integer('token_cost').notNull(),
	bonusTokenCost: integer('bonus_token_cost').notNull().default(0),
	errorMessage: text('error_message'),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
		.notNull()
		.defaultNow(),
	completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
});

export type AssetGeneration = typeof assetGeneration.$inferSelect;

export const textureGeneration = pgTable('texture_generation', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id),

	// Configuration
	prompt: text('prompt').notNull(),

	// Status
	status: text('status', {
		enum: ['pending', 'processing', 'completed', 'failed'],
	})
		.notNull()
		.default('pending'),
	progress: integer('progress').notNull().default(0),
	currentStage: text('current_stage'),

	// Results - URLs for each PBR map
	basecolorUrl: text('basecolor_url'),
	normalUrl: text('normal_url'),
	roughnessUrl: text('roughness_url'),
	metallicUrl: text('metallic_url'),
	heightUrl: text('height_url'),

	// Metadata
	seed: integer('seed'),
	tokenCost: integer('token_cost').notNull(),
	bonusTokenCost: integer('bonus_token_cost').notNull().default(0),
	errorMessage: text('error_message'),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
		.notNull()
		.defaultNow(),
	completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
});

export type TextureGeneration = typeof textureGeneration.$inferSelect;

export const rotationJob = pgTable('rotation_job', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id),

	// Status
	status: text('status', {
		enum: ['pending', 'processing', 'completed', 'failed'],
	})
		.notNull()
		.default('pending'),
	progress: integer('progress').notNull().default(0),
	currentStage: text('current_stage'),
	startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' }),

	// Input
	prompt: text('prompt'),
	inputImageUrl: text('input_image_url'),
	elevation: integer('elevation').notNull().default(20),

	// Results - 8 directions
	rotationN: text('rotation_n'),
	rotationNE: text('rotation_ne'),
	rotationE: text('rotation_e'),
	rotationSE: text('rotation_se'),
	rotationS: text('rotation_s'),
	rotationSW: text('rotation_sw'),
	rotationW: text('rotation_w'),
	rotationNW: text('rotation_nw'),

	// Metadata
	tokenCost: integer('token_cost').notNull(),
	bonusTokenCost: integer('bonus_token_cost').notNull().default(0),
	errorMessage: text('error_message'),
	createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
		.notNull()
		.defaultNow(),
	completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
});

export type RotationJob = typeof rotationJob.$inferSelect;
