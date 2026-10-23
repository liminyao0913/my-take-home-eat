ALTER TABLE `rooms` ADD `expected_participants` integer CONSTRAINT `room_expected_participants` CHECK (`expected_participants` IS NULL OR `expected_participants` BETWEEN 1 AND 32);
--> statement-breakpoint
ALTER TABLE `rooms` ADD `organizer_participant_id` text REFERENCES `participants`(`id`) ON DELETE set null;
--> statement-breakpoint
UPDATE `rooms` SET `organizer_participant_id` = (
  SELECT CASE WHEN count(*) = 1 THEN min(`participant_id`) END
  FROM `profile_rooms` WHERE `room_id` = `rooms`.`id` AND `role` = 'created'
);
