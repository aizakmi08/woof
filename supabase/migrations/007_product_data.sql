-- Product data cache for verified ingredient lookups
-- Stores scraped/fetched ingredient data so we never scrape the same product twice

CREATE TABLE IF NOT EXISTS product_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key TEXT UNIQUE NOT NULL,
  product_name TEXT NOT NULL,
  brand TEXT,
  ingredients TEXT[] NOT NULL DEFAULT '{}',
  ingredient_text TEXT,
  ingredient_count INTEGER DEFAULT 0,
  nutritional_info JSONB,
  source TEXT NOT NULL,  -- 'chewy', 'opff', 'brand', 'manual'
  source_url TEXT,
  scraped_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_product_data_cache_key ON product_data(cache_key);
CREATE INDEX IF NOT EXISTS idx_product_data_expires ON product_data(expires_at);

-- RLS: product data is not user-specific
ALTER TABLE product_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read product data"
  ON product_data FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage product data"
  ON product_data FOR ALL
  USING (auth.role() = 'service_role');
