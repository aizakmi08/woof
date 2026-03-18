-- Analysis cache table (shared across all users)
CREATE TABLE IF NOT EXISTS analysis_cache (
  cache_key TEXT PRIMARY KEY,
  lookup_type TEXT NOT NULL DEFAULT 'name',  -- 'barcode' or 'name'
  analysis JSONB NOT NULL,
  data_source TEXT DEFAULT 'ai',             -- 'ai', 'verified', 'enriched'
  opff_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  hit_count INTEGER DEFAULT 0,
  last_hit_at TIMESTAMPTZ
);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_cache_expires ON analysis_cache (expires_at);

-- Index for hit tracking (find popular products)
CREATE INDEX IF NOT EXISTS idx_cache_hits ON analysis_cache (hit_count DESC);

-- Enable RLS
ALTER TABLE analysis_cache ENABLE ROW LEVEL SECURITY;

-- Authenticated users can READ cache (it's shared data)
CREATE POLICY "Authenticated users can read cache"
  ON analysis_cache FOR SELECT
  TO authenticated
  USING (true);

-- Service role bypasses RLS entirely, so these policies are for documentation.
-- They won't be evaluated when using the service_role key, but they block
-- any authenticated/anon client from writing directly.

CREATE POLICY "Service role can insert cache"
  ON analysis_cache FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can update cache"
  ON analysis_cache FOR UPDATE
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role can delete cache"
  ON analysis_cache FOR DELETE
  USING (auth.role() = 'service_role');

-- Function to increment hit count atomically
CREATE OR REPLACE FUNCTION increment_cache_hit(p_key TEXT)
RETURNS void AS $$
  UPDATE analysis_cache
  SET hit_count = hit_count + 1, last_hit_at = NOW()
  WHERE cache_key = p_key;
$$ LANGUAGE SQL;
