CREATE TABLE `browser_credentials` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`profile_id` text,
	`expires_at` integer NOT NULL,
	`legacy_available` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `credential_profile` ON `browser_credentials` (`profile_id`);--> statement-breakpoint
CREATE INDEX `credential_expiry` ON `browser_credentials` (`expires_at`);--> statement-breakpoint
CREATE TABLE `profile_rooms` (
	`profile_id` text NOT NULL,
	`room_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`role` text NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`profile_id`, `room_id`),
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `profile_room_lookup` ON `profile_rooms` (`room_id`);--> statement-breakpoint
CREATE TABLE `profile_rounds` (
	`profile_id` text NOT NULL,
	`room_id` text NOT NULL,
	`round` integer NOT NULL,
	`closed_at` integer NOT NULL,
	`area` text NOT NULL,
	`signals_json` text NOT NULL,
	PRIMARY KEY(`profile_id`, `room_id`, `round`),
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `personal_round_recency` ON `profile_rounds` (`profile_id`,`closed_at`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`cuisines_json` text DEFAULT '[]' NOT NULL,
	`max_price_level` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT "profile_price" CHECK("profiles"."max_price_level" IS NULL OR "profiles"."max_price_level" BETWEEN 1 AND 3)
);
--> statement-breakpoint
INSERT INTO browser_credentials (token_hash, expires_at, legacy_available)
SELECT DISTINCT token_hash, CAST(strftime('%s', 'now') AS INTEGER) * 1000 + 2592000000, 1 FROM participants;
