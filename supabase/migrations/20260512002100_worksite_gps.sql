-- 현장 GPS 좌표 — 추후 작업자 출역 GPS 검증용
--
-- 결정 사항 (2026-05-12):
--   1) 소장 앱 "현장 위치 등록" 화면에서 소장 현 위치 좌표를 등록
--   2) 작업자 출역 시 등록 좌표와 거리 비교 (Haversine, _reference/gps/geofence.ts 참고)
--   3) geofence_radius 기본 300m (참고 코드 임계값과 동일)
--   4) 모든 컬럼 nullable — 기존 현장은 미등록 상태 (등록 전까지 GPS 검증 X)

alter table yeseong_worksites
  add column latitude numeric(10,7),
  add column longitude numeric(10,7),
  add column geofence_radius integer not null default 300,
  add column gps_registered_at timestamptz,
  add column gps_registered_by uuid references auth.users(id) on delete set null;

create index yeseong_worksites_gps_idx
  on yeseong_worksites (latitude, longitude)
  where latitude is not null and longitude is not null;
