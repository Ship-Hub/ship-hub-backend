CREATE TABLE `comments` (
	`id` varchar(36) NOT NULL,
	`memory_id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`content` text NOT NULL,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `project_follows` (
	`user_id` varchar(36) NOT NULL,
	`project_id` varchar(36) NOT NULL,
	`created_at` timestamp DEFAULT (now())
);
--> statement-breakpoint
CREATE TABLE `project_memories` (
	`project_id` varchar(36) NOT NULL,
	`memory_id` varchar(36) NOT NULL,
	`added_at` timestamp DEFAULT (now())
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`name` varchar(255) NOT NULL,
	`slug` varchar(255) NOT NULL,
	`description` text,
	`status` enum('building','launched','archived') DEFAULT 'building',
	`tags` json DEFAULT ('[]'),
	`website_url` varchar(500),
	`github_url` varchar(500),
	`cover_image` varchar(500),
	`follower_count` int DEFAULT 0,
	`memory_count` int DEFAULT 0,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `event_rsvps` (
	`user_id` varchar(36) NOT NULL,
	`event_id` varchar(36) NOT NULL,
	`created_at` timestamp DEFAULT (now())
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`type` enum('demo_day','build_session','hackathon') NOT NULL,
	`starts_at` timestamp NOT NULL,
	`ends_at` timestamp,
	`location` varchar(255),
	`cover_image` varchar(500),
	`rsvp_count` int DEFAULT 0,
	`created_at` timestamp DEFAULT (now()),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `memories` ADD `original_memory_id` varchar(36);--> statement-breakpoint
ALTER TABLE `memories` ADD `original_user_id` varchar(36);