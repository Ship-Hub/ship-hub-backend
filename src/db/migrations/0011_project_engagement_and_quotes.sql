ALTER TABLE `projects` ADD COLUMN `like_count` int DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `projects` ADD COLUMN `comment_count` int DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `posts` ADD COLUMN `quote_project_id` varchar(36);
--> statement-breakpoint
CREATE TABLE `project_likes` (
  `user_id` varchar(36) NOT NULL,
  `project_id` varchar(36) NOT NULL,
  `created_at` timestamp DEFAULT (now())
);
--> statement-breakpoint
CREATE TABLE `project_comments` (
  `id` varchar(36) NOT NULL,
  `project_id` varchar(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `content` text NOT NULL,
  `created_at` timestamp DEFAULT (now()),
  CONSTRAINT `project_comments_id` PRIMARY KEY(`id`)
);
