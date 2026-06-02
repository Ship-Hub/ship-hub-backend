CREATE TABLE `notifications` (
	`id` varchar(36) NOT NULL,
	`user_id` varchar(36) NOT NULL,
	`actor_id` varchar(36) NOT NULL,
	`type` enum('fork','follow','comment','like') NOT NULL,
	`memory_id` varchar(36),
	`project_id` varchar(36),
	`comment_id` varchar(36),
	`read` tinyint DEFAULT 0,
	`created_at` timestamp DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
