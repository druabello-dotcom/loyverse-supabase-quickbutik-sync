CREATE TABLE products (
  product_id UUID NOT NULL PRIMARY KEY,
  quickbutik_product_id VARCHAR(255),
  supplier_id UUID REFERENCES suppliers(supplier_id) ON DELETE RESTRICT,
  displayed_name TEXT NOT NULL,
  description TEXT,

  date_registered TIMESTAMPTZ(0) DEFAULT NOW()::TIMESTAMPTZ(0),
  date_updated TIMESTAMPTZ(0) DEFAULT NOW()::TIMESTAMPTZ(0)
);