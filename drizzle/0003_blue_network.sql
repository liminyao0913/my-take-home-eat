DROP INDEX `personal_round_recency`;--> statement-breakpoint
CREATE INDEX `personal_round_recency` ON `profile_rounds` (`profile_id`,"closed_at" desc,`room_id`,"round" desc);--> statement-breakpoint
CREATE INDEX `room_open_deadline` ON `rooms` ("deadline_at" desc,`id`) WHERE "rooms"."result_json" IS NULL;