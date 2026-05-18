-- 거래처 테이블
CREATE TABLE yeseong_vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  business_number text,
  contact_phone text,
  contact_name text,
  address text,
  note text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX yeseong_vendors_name_unique
  ON yeseong_vendors (name) WHERE is_active = true;

ALTER TABLE yeseong_vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vendors_authenticated" ON yeseong_vendors
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 품목마스터 테이블
CREATE TABLE yeseong_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_code text,
  name text NOT NULL,
  spec text,
  unit text NOT NULL,
  vendor_id uuid REFERENCES yeseong_vendors(id) ON DELETE SET NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX yeseong_items_code_unique
  ON yeseong_items (item_code) WHERE item_code IS NOT NULL AND is_active = true;

ALTER TABLE yeseong_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "items_authenticated" ON yeseong_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
