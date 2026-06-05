-- 팀장앱 "현장 위치 등록" — 팀장이 현장에서 현 위치를 현장 좌표로 등록
--   (20260512002100_worksite_gps 설계의 2번 항목 구현)
--   정책: 본인 담당 현장(site_manager_assignments)만 등록/갱신 가능

-- ============================================================
-- yeseong_manager_list_site_gps — 담당 현장의 GPS 등록 상태 조회
-- ============================================================
create or replace function yeseong_manager_list_site_gps()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_manager_id uuid;
  result jsonb;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;

  select id into v_manager_id
    from yeseong_site_managers
   where auth_user_id = v_user_id;
  if v_manager_id is null then
    raise exception 'manager not found';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', w.id,
    'name', w.name,
    'address', w.address,
    'latitude', w.latitude,
    'longitude', w.longitude,
    'geofence_radius', w.geofence_radius,
    'gps_registered_at', w.gps_registered_at
  ) order by w.name), '[]'::jsonb)
  into result
  from yeseong_site_manager_assignments a
  join yeseong_worksites w on w.id = a.worksite_id
  where a.site_manager_id = v_manager_id;

  return result;
end $$;

grant execute on function yeseong_manager_list_site_gps() to authenticated;

-- ============================================================
-- yeseong_manager_register_site_gps — 현 위치를 현장 좌표로 등록
--   본인 담당 현장만 가능. 기존 좌표는 덮어쓴다.
-- ============================================================
create or replace function yeseong_manager_register_site_gps(
  p_worksite_id uuid,
  p_latitude numeric,
  p_longitude numeric
) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_manager_id uuid;
begin
  if v_user_id is null then
    raise exception 'unauthenticated';
  end if;
  if p_latitude is null or p_longitude is null then
    raise exception 'latitude/longitude required';
  end if;
  if p_latitude < -90 or p_latitude > 90 or p_longitude < -180 or p_longitude > 180 then
    raise exception 'invalid coordinates';
  end if;

  select id into v_manager_id
    from yeseong_site_managers
   where auth_user_id = v_user_id;
  if v_manager_id is null then
    raise exception 'manager not found';
  end if;

  -- 담당 현장 검증
  perform 1 from yeseong_site_manager_assignments
   where site_manager_id = v_manager_id and worksite_id = p_worksite_id;
  if not found then
    raise exception 'not your assigned worksite';
  end if;

  update yeseong_worksites
     set latitude = p_latitude,
         longitude = p_longitude,
         gps_registered_at = now(),
         gps_registered_by = v_user_id
   where id = p_worksite_id;
end $$;

grant execute on function yeseong_manager_register_site_gps(uuid, numeric, numeric) to authenticated;
