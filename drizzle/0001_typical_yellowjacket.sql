CREATE TABLE `room_rounds` (
	`room_id` text NOT NULL,
	`round` integer NOT NULL,
	`meal_date` text NOT NULL,
	`result_json` text NOT NULL,
	PRIMARY KEY(`room_id`, `round`),
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_options` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`room_id` text NOT NULL,
	`author_id` text NOT NULL,
	`place_name` text NOT NULL,
	`location` text NOT NULL,
	`start_at` integer NOT NULL,
	`cuisine` text,
	`price_level` integer,
	`link` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "option_price" CHECK("__new_options"."price_level" BETWEEN 1 AND 3)
);
--> statement-breakpoint
INSERT INTO `__new_options`("id", "room_id", "author_id", "place_name", "location", "start_at", "cuisine", "price_level", "link", "created_at") SELECT "id", "room_id", "author_id", "place_name", "location", "start_at", "cuisine", "price_level", "link", "created_at" FROM `options`;--> statement-breakpoint
INSERT INTO `sqlite_sequence` (`name`, `seq`) SELECT '__new_options', `seq` FROM `sqlite_sequence` WHERE `name` = 'options' AND NOT EXISTS (SELECT 1 FROM `sqlite_sequence` WHERE `name` = '__new_options');--> statement-breakpoint
UPDATE `sqlite_sequence` SET `seq` = MAX(`seq`, COALESCE((SELECT `seq` FROM `sqlite_sequence` WHERE `name` = 'options'), 0)) WHERE `name` = '__new_options';--> statement-breakpoint
DROP TABLE `options`;--> statement-breakpoint
ALTER TABLE `__new_options` RENAME TO `options`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `option_room` ON `options` (`room_id`);--> statement-breakpoint
ALTER TABLE `participants` ADD `ready` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `responses` ADD `reason` text;--> statement-breakpoint
ALTER TABLE `rooms` ADD `round` integer DEFAULT 1 NOT NULL;
