-- 팀장 소속 기능: team_leader_id 칼럼 추가
ALTER TABLE yeseong_workers
  ADD COLUMN team_leader_id uuid REFERENCES yeseong_workers(id) ON DELETE SET NULL;
