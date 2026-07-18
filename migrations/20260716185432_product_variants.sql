CREATE TABLE product_variants (
  variant_id UUID NOT NULL PRIMARY KEY,
  parent_id UUID REFERENCES products(product_id) ON DELETE CASCADE,
  quickbutik_variant_id VARCHAR(255),
  sku_barcode VARCHAR(13),
  price NUMERIC(10, 2),
  cost NUMERIC(10, 2),
  attributes JSONB DEFAULT '{}',
  date_updated TIMESTAMPTZ(0) DEFAULT NOW()::TIMESTAMPTZ(0)
);