ALTER TABLE `users` ADD `email_verified` tinyint DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `users` ADD `email_verify_token` varchar(64);
--> statement-breakpoint
ALTER TABLE `users` ADD `reset_token` varchar(64);
--> statement-breakpoint
ALTER TABLE `users` ADD `reset_token_expires` timestamp;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `packs` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`visibility` enum('public','private') DEFAULT 'public',
	`memory_count` int DEFAULT 0,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `packs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `pack_memories` (
	`pack_id` varchar(36) NOT NULL,
	`memory_id` varchar(36) NOT NULL,
	`created_at` timestamp DEFAULT (now())
);
--> statement-breakpoint
ALTER TABLE `notifications` ADD `post_id` varchar(36);
--> statement-breakpoint
ALTER TABLE `notifications` MODIFY COLUMN `type` enum('fork','follow','comment','like','mention','reaction','quote') NOT NULL;
