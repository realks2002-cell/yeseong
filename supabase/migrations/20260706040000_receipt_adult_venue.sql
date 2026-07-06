-- 유흥업소 의심 판정(반자동 알람). AI가 신호만 추출→규칙 스코어링→사람 검토.
--   adult_score: 0~ 합산 점수. adult_signals: 근거 칩 [{label,weight}].
--   접대비 손금불산입·세무조사 리스크 사전 경고용. 확정 아닌 참고 알람.
alter table yeseong_site_photos add column if not exists adult_score int not null default 0;
alter table yeseong_site_photos add column if not exists adult_signals jsonb;

comment on column yeseong_site_photos.adult_score is '유흥업소 의심 점수(업종+70·상호+30·개별소비세+30·품목+20·심야+10). ≥70 높음/40~69 중/20~39 낮음. 개소세는 유류·담배도 과세 → 단독 flag 안 됨.';
comment on column yeseong_site_photos.adult_signals is '판정 근거 칩 배열 [{label,weight}]. 사람 검토용 설명.';
