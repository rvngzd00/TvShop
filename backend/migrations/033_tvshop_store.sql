DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM stores WHERE code='daily-baku') THEN
    UPDATE stores
    SET name='TVShop',primary_domain='tvshop.az',status='active',updated_at=now()
    WHERE code='daily-baku';
  ELSIF EXISTS (SELECT 1 FROM stores WHERE code='tvshop') THEN
    UPDATE stores
    SET code='daily-baku',name='TVShop',primary_domain='tvshop.az',status='active',updated_at=now()
    WHERE code='tvshop';
  ELSE
    INSERT INTO stores(code,name,primary_domain,locale,currency,timezone,status,settings)
    VALUES('daily-baku','TVShop','tvshop.az','az-AZ','AZN','Asia/Baku','active','{}'::jsonb);
  END IF;
END
$$;
