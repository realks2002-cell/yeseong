import type { MockWorker } from '../mock/store';

export type MatchInput = {
  name: string;
  hoursByDay: Record<string, number>;
  confidence: 'high' | 'medium' | 'low';
};

export type MatchResult = {
  input: MatchInput;
  candidates: MockWorker[];      // 0개 = 매칭 실패, 1개 = 단일 매칭, 2+ = 동명이인
  topCandidateId: string | null; // 1개일 때 자동 선택
  decision: 'auto' | 'review' | 'none';  // 자동 / 사용자 검토 / 매칭 실패
};

function normalize(s: string): string {
  return s.replace(/\s+/g, '').replace(/[^\p{Letter}\p{Number}]/gu, '');
}

const KOREAN_SOUND_VARIANTS: Record<string, string[]> = {
  창: ['챵', '챤', '찬'],
  챵: ['창'],
  // 필요 시 확장
};

function fuzzyMatchName(input: string, candidate: string): boolean {
  if (input === candidate) return true;
  if (normalize(input) === normalize(candidate)) return true;
  if (input.length !== candidate.length) return false;
  // 한 글자만 음 차이
  let diff = 0;
  for (let i = 0; i < input.length; i++) {
    if (input[i] !== candidate[i]) {
      const variants = KOREAN_SOUND_VARIANTS[input[i]] ?? [];
      if (!variants.includes(candidate[i])) return false;
      diff++;
    }
  }
  return diff <= 1;
}

export function matchWorkers(inputs: MatchInput[], all: MockWorker[]): MatchResult[] {
  return inputs.map(input => {
    // 1단계: 정확 일치
    let candidates = all.filter(w => w.name === input.name);
    // 2단계: 정규화 일치
    if (candidates.length === 0) {
      candidates = all.filter(w => normalize(w.name) === normalize(input.name));
    }
    // 3단계: 퍼지 매칭 (한 글자 차이 + 음 변형)
    if (candidates.length === 0) {
      candidates = all.filter(w => fuzzyMatchName(input.name, w.name));
    }

    let decision: MatchResult['decision'];
    let topCandidateId: string | null = null;
    if (candidates.length === 0) decision = 'none';
    else if (candidates.length === 1) {
      decision = input.confidence === 'high' ? 'auto' : 'review';
      topCandidateId = candidates[0].id;
    } else {
      decision = 'review';
      topCandidateId = candidates[0].id;
    }

    return { input, candidates, topCandidateId, decision };
  });
}
