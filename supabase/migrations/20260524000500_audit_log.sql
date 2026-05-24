-- 변경 이력(Audit Log) 시스템
--   모든 마스터/주요 테이블의 INSERT/UPDATE/DELETE를 자동 기록
--   actor_user_id = auth.uid() (서비스 롤 직접 SQL은 NULL → 시스템 액션)
--
-- 노이즈 컬럼 자동 제외:
--   - rrn_encrypted (bytea — jsonb로 의미 없는 base64 문자열)
--   - created_at, updated_at (자동 갱신 — UPDATE 시 changed_fields 노이즈)
--
-- 적용 대상: yeseong_workers, yeseong_site_managers, yeseong_subcontractors,
--           yeseong_worksites, yeseong_masonry_prices, yeseong_masonry_volumes,
--           yeseong_payroll_workers, yeseong_attendance

create table yeseong_audit_log (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  actor_user_id uuid references auth.users(id) on delete set null,
  before_data jsonb,
  after_data jsonb,
  changed_fields text[],
  created_at timestamptz default now()
);

create index on yeseong_audit_log (table_name, record_id, created_at desc);
create index on yeseong_audit_log (actor_user_id, created_at desc);
create index on yeseong_audit_log (created_at desc);
create index on yeseong_audit_log (action, created_at desc);

alter table yeseong_audit_log enable row level security;

-- 조회·삽입 권한: authenticated 전체 허용 (API 레이어에서 관리자 가드).
-- 트리거는 SECURITY DEFINER로 동작하므로 RLS 우회 가능.
create policy "audit_log_read"
  on yeseong_audit_log for select
  to authenticated
  using (true);

-- 트리거 함수: 모든 대상 테이블 공통
create or replace function yeseong_audit_trigger()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_before jsonb;
  v_after jsonb;
  v_changed text[];
  v_record_id uuid;
  v_excluded text[] := array['rrn_encrypted', 'created_at', 'updated_at'];
begin
  v_actor := auth.uid();

  if tg_op = 'DELETE' then
    v_before := to_jsonb(old);
    v_record_id := (v_before ->> 'id')::uuid;
    -- 노이즈 컬럼 제거
    v_before := v_before - v_excluded;
    insert into yeseong_audit_log (table_name, record_id, action, actor_user_id, before_data)
    values (tg_table_name, v_record_id, 'DELETE', v_actor, v_before);
    return old;

  elsif tg_op = 'INSERT' then
    v_after := to_jsonb(new);
    v_record_id := (v_after ->> 'id')::uuid;
    v_after := v_after - v_excluded;
    insert into yeseong_audit_log (table_name, record_id, action, actor_user_id, after_data)
    values (tg_table_name, v_record_id, 'INSERT', v_actor, v_after);
    return new;

  else  -- UPDATE
    v_before := to_jsonb(old) - v_excluded;
    v_after := to_jsonb(new) - v_excluded;
    v_record_id := (v_after ->> 'id')::uuid;

    -- 실제 변경된 키 집계
    select array_agg(key) into v_changed
    from jsonb_each(v_after)
    where v_after -> key is distinct from v_before -> key;

    -- 변경 사실 없음 (예: updated_at만 갱신된 경우) → 로그 스킵
    if v_changed is null or array_length(v_changed, 1) is null then
      return new;
    end if;

    insert into yeseong_audit_log
      (table_name, record_id, action, actor_user_id, before_data, after_data, changed_fields)
    values
      (tg_table_name, v_record_id, 'UPDATE', v_actor, v_before, v_after, v_changed);
    return new;
  end if;
end $$;

-- 8개 테이블에 일괄 트리거 적용
do $$
declare
  t text;
  tables text[] := array[
    'yeseong_workers',
    'yeseong_site_managers',
    'yeseong_subcontractors',
    'yeseong_worksites',
    'yeseong_masonry_prices',
    'yeseong_masonry_volumes',
    'yeseong_payroll_workers',
    'yeseong_attendance'
  ];
begin
  foreach t in array tables loop
    execute format(
      'drop trigger if exists %I_audit on %I',
      t || '_audit', t
    );
    execute format(
      'create trigger %I_audit
       after insert or update or delete on %I
       for each row execute function yeseong_audit_trigger()',
      t, t
    );
  end loop;
end $$;
