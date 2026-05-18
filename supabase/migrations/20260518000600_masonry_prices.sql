-- 매사 단가 마스터 테이블
CREATE TABLE yeseong_masonry_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('조적', '미장')),
  type_name text NOT NULL,
  size_spec text,
  unit text NOT NULL CHECK (unit IN ('장', '㎡')),
  unit_price integer NOT NULL CHECK (unit_price >= 0),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX yeseong_masonry_prices_unique
  ON yeseong_masonry_prices (category, type_name, COALESCE(size_spec, ''))
  WHERE is_active = true;

ALTER TABLE yeseong_masonry_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "masonry_prices_authenticated"
  ON yeseong_masonry_prices
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
