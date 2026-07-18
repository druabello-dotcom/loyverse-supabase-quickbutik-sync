CREATE TABLE suppliers (
  supplier_id UUID NOT NULL PRIMARY KEY,
  supplier_number VARCHAR(5) NOT NULL UNIQUE,
  items_registered INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  contact TEXT,
  email TEXT,
  phone_number TEXT,
  website TEXT,
  address_1 TEXT,
  address_2 TEXT,
  city TEXT,
  country_code VARCHAR(2),
  state_or_province TEXT,
  postal_code TEXT,

  date_registered TIMESTAMPTZ(0) DEFAULT NOW()::TIMESTAMPTZ(0),
  date_updated TIMESTAMPTZ(0)
);