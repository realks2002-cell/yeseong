// 사용자 제공 15개 현장 시드 (중복 1개 제거)
// 실행: pnpm tsx scripts/seed-worksites.ts
import 'dotenv/config';
import { getServiceSupabase } from '../lib/supabase/server';

type Worksite = { name: string; address: string | null };

const WORKSITES: Worksite[] = [
  { name: '고촌초등학교', address: '경기도 의왕시 고천동 491-9번지' },
  { name: '단샘초', address: '하남시 감일동 195길 단샘초등학교' },
  { name: '서남병원', address: '서울 양천구 신정이펜1로 20' },
  { name: '익산 나노솔루션 신축공사현장', address: '전북특별자치도 익산시 삼기면 오룡리 1269' },
  { name: '오창 전고체전지', address: '충청북도 청주시 청원구 오창읍 송대리 321-6번지' },
  { name: '논현동 화양2고 신축공사중 습식공사', address: '경기도 평택시 현덕면 운정리 267-1' },
  { name: '녹십자 송도', address: '인천광역시 연수구 송도동 벤처로100번길 34' },
  { name: '증산도(은민)', address: '충남 논산시 상월면 석종리 산 23-26' },
  { name: '경북대 캠퍼스 혁신파크 HUB동 건설공사 중 방수공사', address: '대구광역시 북구 대현동 25(경북대학교 야구장)' },
  // TODO: 주소 추후 보완 — 사용자 원본 데이터에 주소 누락
  { name: '용산구 용문동 38-69 다세대 신축공사중 습식공사', address: null },
  { name: '티에스 엔지니어링㈜ 아산공장 신축공사', address: null },
  // 홍천블루컬리넌 — 시공사 "민지건설"은 yeseong_subcontractors로 별도 등록 예정
  { name: '홍천블루컬리넌', address: '강원도 홍천군 홍천읍 갈마곡리 380-6' },
  { name: '삼성바이오에피스 어린이집 증축공사', address: '인천 연수구 송도교육로 76' },
  { name: '한화오션 MCS4 구축공사 중 습식공사', address: '충북 보은군 회인내북로 857' },
  { name: '서이천 복합물류센터', address: '경기도 이천시 마장면 장암리 521' },
];

async function main() {
  const sb = getServiceSupabase();

  const { data, error } = await sb
    .from('yeseong_worksites')
    .upsert(WORKSITES, { onConflict: 'name', ignoreDuplicates: false })
    .select('id, name, address');

  if (error) {
    console.error('upsert failed:', error);
    process.exit(1);
  }

  console.log(`✓ ${data?.length ?? 0}개 현장 upsert 완료`);
  data?.forEach((w) => {
    const addr = w.address ?? '(주소 미정)';
    console.log(`  • ${w.name} — ${addr}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
