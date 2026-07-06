// 유흥업소 의심 판정 — 규칙 기반 스코어링(설명 가능). AI는 신호만 추출하고
//   판정은 여기서, 최종 확정은 사람(담당자·세무사)이 한다. 확정 아닌 참고 알람.
//   목적: 접대비 손금불산입·세무조사 리스크 사전 경고.

export type AdultSignal = { label: string; weight: number };
export type AdultLevel = 'normal' | 'low' | 'mid' | 'high';
export type AdultResult = { score: number; level: AdultLevel; signals: AdultSignal[] };

// 상호 키워드 — 유흥 특정어만. 코인노래방·일반 노래연습장·"○○주점"(일반 호프)·
//   골프/헬스클럽 등은 유흥이 아니므로 노래방·노래연습장·주점(bare)·클럽(bare) 제외.
const STORE_KEYWORDS = [
  '룸살롱', '단란주점', '유흥', '가라오케', '노래주점', '텐프로', '호스트바',
  '스탠드바', '칵테일바', '나이트',
];
// 업태/종목 키워드(+70) — 개별소비세 과세 "유흥 업종"만. 일반 주점/노래방 업종은
//   과세 대상이 아니므로 제외해 과잉 경보를 막는다.
const CATEGORY_KEYWORDS = ['유흥주점', '단란주점', '룸살롱', '무도유흥'];
// 유흥 품목 — 일반 식대와 구분되는 항목만. 'TC' bare는 OTC 등 오탐 → 'T.C'만.
const ITEM_KEYWORDS = ['주대', '룸이용료', '룸 이용료', '봉사료', 'T.C', '양주', '접대'];

export function levelFromScore(score: number): AdultLevel {
  if (score >= 70) return 'high';
  if (score >= 40) return 'mid';
  if (score >= 20) return 'low';
  return 'normal';
}

export const LEVEL_LABEL: Record<AdultLevel, string> = {
  high: '높음',
  mid: '중',
  low: '낮음',
  normal: '정상',
};

export function scoreAdultVenue(input: {
  store: string | null;
  businessCategory: string | null;
  hasExciseTax: boolean;
  items: { name: string }[];
  paymentTime: string | null; // "HH:MM"
}): AdultResult {
  const signals: AdultSignal[] = [];

  // 개별소비세 — 유흥주점에 붙지만 유류(경유·LPG)·담배·차량·골프 등에도 과세된다.
  //   단독으로는 flag 임계선(40)을 못 넘게 30으로 두고, 다른 정황과 겹칠 때만 판정.
  if (input.hasExciseTax) signals.push({ label: '개별소비세 항목 검출', weight: 30 });

  // 업종/업태 — 계산서 업태나 카드 업종 표기. 유흥 과세 업종명은 그 자체로 확정적.
  if (input.businessCategory) {
    const hit = CATEGORY_KEYWORDS.find((k) => input.businessCategory!.includes(k));
    if (hit) signals.push({ label: `업종: ${input.businessCategory.slice(0, 40)}`, weight: 70 });
  }

  // 상호 키워드
  if (input.store) {
    const hit = STORE_KEYWORDS.find((k) => input.store!.includes(k));
    if (hit) signals.push({ label: `상호 키워드: ${hit}`, weight: 30 });
  }

  // 유흥 품목
  const itemHit = input.items
    .map((i) => i.name)
    .find((n) => ITEM_KEYWORDS.some((k) => n.includes(k)));
  if (itemHit) signals.push({ label: `유흥 품목: ${itemHit}`, weight: 20 });

  // 심야 결제(22:00~05:00)
  if (input.paymentTime && /^\d{1,2}:\d{2}$/.test(input.paymentTime)) {
    const h = Number(input.paymentTime.split(':')[0]);
    if (h >= 22 || h < 5) signals.push({ label: `심야 결제 ${input.paymentTime}`, weight: 10 });
  }

  const score = signals.reduce((s, x) => s + x.weight, 0);
  return { score, level: levelFromScore(score), signals };
}
