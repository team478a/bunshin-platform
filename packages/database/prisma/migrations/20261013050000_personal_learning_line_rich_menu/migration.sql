ALTER TABLE group_line_connections
  ADD COLUMN personal_learning_rich_menu_id VARCHAR(128),
  ADD COLUMN personal_learning_rich_menu_linked_at TIMESTAMPTZ(6),
  ADD COLUMN personal_learning_rich_menu_content_hash CHAR(64);
