DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS sale_item_taxes;
DROP TABLE IF EXISTS transaction_taxes;
DROP TABLE IF EXISTS sale_item_discounts;
DROP TABLE IF EXISTS transaction_discounts;
DROP TABLE IF EXISTS sale_items;
DROP TABLE IF EXISTS sale_transactions;


-- ==========================
-- Sale transactions
-- ==========================

CREATE TABLE sale_transactions (
    transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    receipt_number TEXT NOT NULL,

    store_id UUID,
    customer_id UUID,
    employee_id UUID,

    transaction_date TIMESTAMPTZ(0) NOT NULL,

    subtotal NUMERIC(10,2) NOT NULL,
    discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    tax_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    total NUMERIC(10,2) NOT NULL,

    created_at TIMESTAMPTZ(0) NOT NULL DEFAULT NOW()
);

ALTER TABLE sale_transactions
ADD CONSTRAINT unique_store_receipt_number
UNIQUE (store_id, receipt_number);


-- ==========================
-- Sale items
-- ==========================

CREATE TABLE sale_items (
    sale_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    transaction_id UUID NOT NULL
        REFERENCES sale_transactions(transaction_id)
        ON DELETE CASCADE,

    loyverse_line_item_id UUID,

    variant_id UUID,

    item_name TEXT NOT NULL,
    sku_barcode TEXT,

    quantity NUMERIC(10,3) NOT NULL DEFAULT 1,

    unit_price NUMERIC(10,2) NOT NULL,

    gross_total NUMERIC(10,2) NOT NULL,
    discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    net_total NUMERIC(10,2) NOT NULL
);


CREATE INDEX idx_sale_items_transaction
ON sale_items(transaction_id);


CREATE INDEX idx_sale_items_variant
ON sale_items(variant_id);



-- ==========================
-- Discounts applied to receipt
-- ==========================

CREATE TABLE transaction_discounts (
    discount_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    transaction_id UUID NOT NULL
        REFERENCES sale_transactions(transaction_id)
        ON DELETE CASCADE,

    loyverse_discount_id UUID,

    type TEXT NOT NULL,
    name TEXT,

    percentage NUMERIC(10,2),

    amount NUMERIC(10,2) NOT NULL
);



-- ==========================
-- Discount allocation per item
-- ==========================

CREATE TABLE sale_item_discounts (
    sale_item_id UUID NOT NULL
        REFERENCES sale_items(sale_item_id)
        ON DELETE CASCADE,

    discount_id UUID NOT NULL
        REFERENCES transaction_discounts(discount_id)
        ON DELETE CASCADE,

    amount NUMERIC(10,2) NOT NULL,

    PRIMARY KEY (sale_item_id, discount_id)
);



-- ==========================
-- Taxes applied to receipt
-- ==========================

CREATE TABLE transaction_taxes (
    tax_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    transaction_id UUID NOT NULL
        REFERENCES sale_transactions(transaction_id)
        ON DELETE CASCADE,

    loyverse_tax_id UUID,

    type TEXT NOT NULL,
    name TEXT,

    rate NUMERIC(10,3),

    amount NUMERIC(10,2) NOT NULL
);



-- ==========================
-- Tax allocation per item
-- ==========================

CREATE TABLE sale_item_taxes (
    sale_item_id UUID NOT NULL
        REFERENCES sale_items(sale_item_id)
        ON DELETE CASCADE,

    tax_id UUID NOT NULL
        REFERENCES transaction_taxes(tax_id)
        ON DELETE CASCADE,

    amount NUMERIC(10,2) NOT NULL,

    PRIMARY KEY (sale_item_id, tax_id)
);  