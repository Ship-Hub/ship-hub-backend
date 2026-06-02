ALTER TABLE `users` ADD `banned` tinyint NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `users` ADD `pinned_memory_ids` json;
--> statement-breakpoint
ALTER TABLE `posts` ADD `edited_at` timestamp;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `direct_messages` (
	`id` varchar(36) NOT NULL,
	`sender_id` varchar(36) NOT NULL,
	`receiver_id` varchar(36) NOT NULL,
	`content` text NOT NULL,
	`read` tinyint NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `direct_messages_id` PRIMARY KEY(`id`)
);
