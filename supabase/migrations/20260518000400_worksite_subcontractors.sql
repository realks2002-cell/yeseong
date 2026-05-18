-- 현장-협력사 매핑 테이블 (다대다)
CREATE TABLE yeseong_worksite_subcontractors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worksite_id uuid NOT NULL REFERENCES yeseong_worksites(id) ON DELETE CASCADE,
  subcontractor_id uuid NOT NULL REFERENCES yeseong_subcontractors(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (worksite_id, subcontractor_id)
);

ALTER TABLE yeseong_worksite_subcontractors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "worksite_subcontractors_authenticated"
  ON yeseong_worksite_subcontractors
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
