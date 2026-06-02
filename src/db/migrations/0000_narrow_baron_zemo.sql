CREATE TABLE `follows` (
	`follower_id` varchar(36) NOT NULL,
	`following_id` varchar(36) NOT NULL,
	`created_at` timestamp DEFAULT (now())
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(36) NOT NULL,
	`email` varchar(255) NOT NULL,
	`password_hash` varchar(255),
	`username` varchar(50) NOT NULL,
	`display_name` varchar(100),
	`bio` text,
	`avatar` varchar(500),
	`website` varchar(255),
	`github_username` varchar(100),
	`oauth_provider` varchar(50),
	`oauth_id` varchar(255),
	`is_admin` tinyint DEFAULT 0,
	`follower_count` int DEFAULT 0,
	`following_count` int DEFAULT 0,
	`memory_count` int DEFAULT 0,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`),
	CONSTRAINT `users_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
CREATE TABLE `memories` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`title` varchar(255) NOT NULL,
	`content` text NOT NULL,
	`category` enum('prompt','workflow','architecture','template','tutorial','agent_setup','mcp','deployment','productivity') NOT NULL,
	`tags` json DEFAULT ('[]'),
	`visibility` enum('public','private') DEFAULT 'public',
	`forked_from_id` varchar(36),
	`forked_from_user_id` varchar(36),
	`fork_count` int DEFAULT 0,
	`like_count` int DEFAULT 0,
	`save_count` int DEFAULT 0,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `memories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `memory_likes` (
	`user_id` varchar(36) NOT NULL,
	`memory_id` varchar(36) NOT NULL,
	`created_at` timestamp DEFAULT (now())
);
--> statement-breakpoint
CREATE TABLE `memory_saves` (
	`user_id` varchar(36) NOT NULL,
	`memory_id` varchar(36) NOT NULL,
	`created_at` timestamp DEFAULT (now())
);
