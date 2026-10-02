-- The platform currently uses one central store warehouse for every seller.
-- Older seeds assigned that warehouse to the demo vendor, which incorrectly
-- prevented other sellers' products from receiving initial stock.
UPDATE warehouses
SET vendor_id = NULL
WHERE code = 'DEMO-BAKU-01';
