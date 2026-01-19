import { boolean, integer, json, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const user = pgTable('user', {
	id: text('id').primaryKey(),
	email: text('email').notNull().unique(),
	username: text('username'),
	avatarUrl: text('avatar_url'),
	githubId: integer('github_id').unique(),
	tokens: integer('tokens').notNull().default(25),
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

export type Session = typeof session.$inferSelect;
export type User = typeof user.$inferSelect;
export type Lora = typeof lora.$inferSelect;
export type Generation = typeof generation.$inferSelect;
