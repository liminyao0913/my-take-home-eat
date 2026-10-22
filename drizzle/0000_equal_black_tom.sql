CREATE TABLE `options` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_id` text NOT NULL,
	`author_id` text NOT NULL,
	`place_name` text NOT NULL,
	`location` text NOT NULL,
	`start_at` integer NOT NULL,
	`cuisine` text NOT NULL,
	`price_level` integer NOT NULL,
	`link` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "option_price" CHECK("options"."price_level" BETWEEN 1 AND 3)
);
--> statement-breakpoint
CREATE INDEX `option_room` ON `options` (`room_id`);--> statement-breakpoint
CREATE TABLE `participants` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`display_name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`cuisines_json` text DEFAULT '[]' NOT NULL,
	`max_price_level` integer,
	`preferred_start_minute` integer,
	`preferred_end_minute` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "participant_price" CHECK("participants"."max_price_level" IS NULL OR "participants"."max_price_level" BETWEEN 1 AND 3),
	CONSTRAINT "participant_window" CHECK(("participants"."preferred_start_minute" IS NULL AND "participants"."preferred_end_minute" IS NULL) OR ("participants"."preferred_start_minute" IS NOT NULL AND "participants"."preferred_end_minute" IS NOT NULL AND "participants"."preferred_start_minute" >= 0 AND "participants"."preferred_end_minute" <= 1439 AND "participants"."preferred_start_minute" <= "participants"."preferred_end_minute"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `participant_identity` ON `participants` (`room_id`,`token_hash`);--> statement-breakpoint
CREATE TABLE `responses` (
	`participant_id` text NOT NULL,
	`option_id` integer NOT NULL,
	`choice` text NOT NULL,
	PRIMARY KEY(`participant_id`, `option_id`),
	FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`option_id`) REFERENCES `options`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "response_choice" CHECK("responses"."choice" IN ('approve', 'block'))
);
--> statement-breakpoint
CREATE INDEX `response_option` ON `responses` (`option_id`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`meal_date` text NOT NULL,
	`area` text NOT NULL,
	`time_zone` text NOT NULL,
	`created_at` integer NOT NULL,
	`deadline_at` integer NOT NULL,
	`result_json` text,
	`resolved_at` integer
);
