UPDATE orders
SET
  customer_name = replace(replace(customer_name, 'DAILY BAKU', 'GÜNDƏLİK BAKI'), 'Daily Baku', 'Gündəlik Bakı'),
  shipping_address = replace(replace(shipping_address::text, 'DAILY BAKU', 'GÜNDƏLİK BAKI'), 'Daily Baku', 'Gündəlik Bakı')::jsonb,
  billing_address = replace(replace(billing_address::text, 'DAILY BAKU', 'GÜNDƏLİK BAKI'), 'Daily Baku', 'Gündəlik Bakı')::jsonb
WHERE
  customer_name LIKE '%Daily Baku%' OR customer_name LIKE '%DAILY BAKU%'
  OR shipping_address::text LIKE '%Daily Baku%' OR shipping_address::text LIKE '%DAILY BAKU%'
  OR billing_address::text LIKE '%Daily Baku%' OR billing_address::text LIKE '%DAILY BAKU%';
