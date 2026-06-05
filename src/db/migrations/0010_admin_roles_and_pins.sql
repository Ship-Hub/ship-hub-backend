ALTER TABLE `users` ADD COLUMN `platform_admin` tinyint NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `community_admin` tinyint NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE `users` SET `platform_admin` = 1, `community_admin` = 1 WHERE `is_admin` = 1;
--> statement-breakpoint
UPDATE `users` SET `is_admin` = 1, `platform_admin` = 1, `community_admin` = 1 WHERE `email` = 'jeffwonda@gmail.com';
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `community_muted_until` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN `community_muted_by_id` varchar(36);
--> statement-breakpoint
ALTER TABLE `posts` ADD COLUMN `pinned_at` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `posts` ADD COLUMN `pinned_by_id` varchar(36);
--> statement-breakpoint
ALTER TABLE `chat_messages` ADD COLUMN `pinned_at` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `chat_messages` ADD COLUMN `pinned_by_id` varchar(36);
