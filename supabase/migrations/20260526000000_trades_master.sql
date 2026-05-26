-- 직종(공종) 마스터 테이블
-- yeseong_workers.default_trade 는 text 그대로 유지 (FK 미적용, soft reference)
-- 마스터는 드롭다운 옵션의 단일 출처로만 사용한다
CREATE TABLE yeseong_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sort_order int DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX yeseong_trades_name_unique
  ON yeseong_trades (name) WHERE is_active = true;

ALTER TABLE yeseong_trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trades_authenticated" ON yeseong_trades
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 현재 lib/constants/trades.ts 의 TRADES 10개를 순서 그대로 시드
INSERT INTO yeseong_trades (name, sort_order) VALUES
  ('조적', 1),
  ('미장공', 2),
  ('바닥미장', 3),
  ('방수공', 4),
  ('도장공', 5),
  ('줄눈공', 6),
  ('보통인부', 7),
  ('용접공', 8),
  ('철근공', 9),
  ('목수', 10);
