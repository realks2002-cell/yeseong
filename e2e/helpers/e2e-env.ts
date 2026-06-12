import fs from 'fs';
import path from 'path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// 기존(프로덕션) DB를 공유하므로 모든 테스트 데이터는 E2E 접두사 + 가상 전화번호로 격리한다
export const E2E = {
  SUBCONTRACTOR: 'E2E전문건설사',
  WORKSITE: 'E2E테스트현장',
  MANAGER_NAME: 'E2E팀장',
  MANAGER_PHONE: '01099990001',
  WORKER_NAME: 'E2E작업자',
  WORKER_PHONE: '01099990002',
  PIN: '1234',
  PIN_PASSWORD: '123400', // pinToPassword('1234')
  ADMIN_ID: 'e2e-admin',
  ADMIN_EMAIL: 'e2e-admin@yeseong.local',
  PRICE_NAME: 'E2E벽돌',
  ITEM_NAME: 'E2E시멘트',
};

export const STATE_FILE = path.join(__dirname, '..', '.e2e-state.json');

export type E2EState = {
  adminPassword: string;
  subcontractorId: string;
  worksiteId: string;
  managerId: string;
  managerWorkerId: string;
  workerId: string;
  authUserIds: string[];
};

export function readState(): E2EState {
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
}

export function writeState(s: E2EState) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

export function getServiceClient(): SupabaseClient {
  const envFile = fs.readFileSync(path.join(__dirname, '..', '..', '.env.local'), 'utf8');
  const get = (key: string) => {
    const line = envFile.split('\n').find((l) => l.startsWith(key + '='));
    if (!line) throw new Error(`${key} not found in .env.local`);
    let v = line.slice(key.length + 1).trim();
    if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) v = v.slice(1, -1);
    return v;
  };
  return createClient(get('NEXT_PUBLIC_SUPABASE_URL'), get('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
