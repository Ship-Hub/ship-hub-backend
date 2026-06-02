ALTER TABLE `posts` ADD `quote_post_id` varchar(36);
--> statement-breakpoint
ALTER TABLE `posts` ADD `quote_memory_id` varchar(36);
--> statement-breakpoint
CREATE TABLE `post_reactions` (
  `id` varchar(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `post_id` varchar(36) NOT NULL,
  `emoji` varchar(10) NOT NULL,
  `created_at` timestamp DEFAULT (now()),
  CONSTRAINT `post_reactions_id` PRIMARY KEY(`id`)
);
