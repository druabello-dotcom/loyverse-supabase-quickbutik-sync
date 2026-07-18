CREATE TABLE product_images_global (
  image_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_url TEXT NOT NULL,
  alt_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);