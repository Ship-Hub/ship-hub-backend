CREATE TABLE `post_saves` (
	`user_id` varchar(36) NOT NULL,
	`post_id` varchar(36) NOT NULL,
	`created_at` timestamp DEFAULT (now())
);
--> statement-breakpoint
ALTER TABLE `posts` ADD `media_url` varchar(500);--> statement-breakpoint
ALTER TABLE `posts` ADD `media_type` enum('image','video');