CREATE TABLE categories (
  category_id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  category_name TEXT NOT NULL,
  created_at TIMESTAMPTZ(0) DEFAULT NOW()::TIMESTAMPTZ(0)
);