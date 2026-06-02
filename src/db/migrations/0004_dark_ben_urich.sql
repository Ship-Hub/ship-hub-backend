CREATE TABLE `post_comments` (
	`id` varchar(36) NOT NULL,
	`post_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`content` text NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `post_comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `post_likes` (
	`user_id` varchar(36) NOT NULL,
	`post_id` varchar(36) NOT NULL,
	`created_at` timestamp DEFAULT (now())
);
--> statement-breakpoint
CREATE TABLE `posts` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`content` text NOT NULL,
	`visibility` enum('public','private') DEFAULT 'public',
	`like_count` int DEFAULT 0,
	`save_count` int DEFAULT 0,
	`comment_count` int DEFAULT 0,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `posts_id` PRIMARY KEY(`id`)
);
