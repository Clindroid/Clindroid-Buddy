CREATE TABLE `standard_doc_chunk` (
	`id` text PRIMARY KEY,
	`document_id` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`location` text NOT NULL,
	`text` text NOT NULL,
	`embedding` blob NOT NULL,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL,
	CONSTRAINT `fk_standard_doc_chunk_document_id_standard_doc_id_fk` FOREIGN KEY (`document_id`) REFERENCES `standard_doc`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `standard_doc` (
	`id` text PRIMARY KEY,
	`project_id` text NOT NULL,
	`standard` text NOT NULL,
	`source_path` text NOT NULL,
	`content_hash` text NOT NULL,
	`embedding_provider_id` text NOT NULL,
	`embedding_model_id` text NOT NULL,
	`embedding_dim` integer NOT NULL,
	`chunk_count` integer NOT NULL,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL,
	CONSTRAINT `fk_standard_doc_project_id_project_id_fk` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `standard_doc_chunk_document_idx` ON `standard_doc_chunk` (`document_id`,`chunk_index`);--> statement-breakpoint
CREATE INDEX `standard_doc_project_standard_idx` ON `standard_doc` (`project_id`,`standard`);--> statement-breakpoint
CREATE INDEX `standard_doc_project_standard_path_idx` ON `standard_doc` (`project_id`,`standard`,`source_path`);