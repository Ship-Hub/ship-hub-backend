-- Extend posts with type + type-specific fields
ALTER TABLE `posts` ADD `type` enum('general','build_update','code_snippet','collab_request','poll','question') NOT NULL DEFAULT 'general';
--> statement-breakpoint
ALTER TABLE `posts` ADD `language` varchar(50);
--> statement-breakpoint
ALTER TABLE `posts` ADD `project_id` varchar(36);
--> statement-breakpoint
ALTER TABLE `posts` ADD `milestone` varchar(255);
--> statement-breakpoint
ALTER TABLE `posts` ADD `role_needed` varchar(255);
--> statement-breakpoint
ALTER TABLE `posts` ADD `skills` json;
--> statement-breakpoint
ALTER TABLE `posts` ADD `compensation` enum('paid','equity','volunteer','revenue_share');
--> statement-breakpoint
ALTER TABLE `posts` ADD `apply_url` varchar(500);
--> statement-breakpoint
ALTER TABLE `posts` ADD `accepted_answer_id` varchar(36);
--> statement-breakpoint
ALTER TABLE `posts` ADD `poll_is_anonymous` tinyint NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `posts` ADD `poll_allow_multiple` tinyint NOT NULL DEFAULT 0;
--> statement-breakpoint

-- Poll tables
CREATE TABLE IF NOT EXISTS `poll_options` (
  `id` varchar(36) NOT NULL,
  `post_id` varchar(36) NOT NULL,
  `text` varchar(500) NOT NULL,
  `position` int NOT NULL DEFAULT 0,
  `vote_count` int NOT NULL DEFAULT 0,
  CONSTRAINT `poll_options_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `poll_votes` (
  `id` varchar(36) NOT NULL,
  `post_id` varchar(36) NOT NULL,
  `poll_option_id` varchar(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `poll_votes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint

-- Collab applications
CREATE TABLE IF NOT EXISTS `collab_applications` (
  `id` varchar(36) NOT NULL,
  `post_id` varchar(36) NOT NULL,
  `applicant_id` varchar(36) NOT NULL,
  `message` text NOT NULL,
  `status` enum('pending','accepted','rejected') NOT NULL DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `collab_applications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint

-- Community chat
CREATE TABLE IF NOT EXISTS `chat_channels` (
  `id` varchar(36) NOT NULL,
  `name` varchar(100) NOT NULL,
  `slug` varchar(100) NOT NULL,
  `description` varchar(500),
  `is_default` tinyint NOT NULL DEFAULT 0,
  `message_count` int NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `chat_channels_id` PRIMARY KEY(`id`),
  CONSTRAINT `chat_channels_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `chat_messages` (
  `id` varchar(36) NOT NULL,
  `channel_id` varchar(36) NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `content` text NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `chat_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint

-- User presence
ALTER TABLE `users` ADD `last_seen` timestamp;
--> statement-breakpoint

-- Extend notifications type enum
ALTER TABLE `notifications` MODIFY `type` enum('fork','follow','comment','like','mention','reaction','quote','collab_apply','answer_accepted','chat_mention') NOT NULL;
--> statement-breakpoint

-- Seed default chat channels
INSERT IGNORE INTO `chat_channels` (`id`, `name`, `slug`, `description`, `is_default`) VALUES
  (UUID(), 'General', 'general', 'General discussion for all builders', 1),
  (UUID(), 'Build Updates', 'build-updates', 'Share what you shipped today', 1),
  (UUID(), 'Code Review', 'code-review', 'Get feedback on your code', 1),
  (UUID(), 'Collabs', 'collabs', 'Find collaborators and team up', 1),
  (UUID(), 'Showcase', 'showcase', 'Show off your projects', 1);
