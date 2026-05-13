-- 협력사 초기 시드 (이름만)
-- ON CONFLICT (name) DO NOTHING — 재실행 안전

insert into yeseong_subcontractors (name) values
  ('이루건설'),
  ('민지건설'),
  ('매코이건축')
on conflict (name) do nothing;
