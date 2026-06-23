CREATE TABLE IF NOT EXISTS favorite_items (
  id TEXT PRIMARY KEY,
  vault_id TEXT NOT NULL,
  url TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_favorite_items_vault_updated
ON favorite_items (vault_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_favorite_items_vault_url
ON favorite_items (vault_id, url);
