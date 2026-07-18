CREATE TABLE product_images_designated (
  product_id UUID REFERENCES products(product_id) ON DELETE CASCADE,
  image_id UUID REFERENCES product_images_global(image_id) ON DELETE CASCADE,
  display_order INT DEFAULT 0,
  is_primary BOOLEAN DEFAULT false,
  PRIMARY KEY (product_id, image_id)
);