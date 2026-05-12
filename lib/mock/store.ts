// Mock 데이터 스토어 (Supabase 미연결 단계에서 UI 시연용)
// 서버/클라이언트 양쪽에서 import 가능 (json 파일은 빌드타임 fixture)
import workersFixture from './workers.fixture.json';

export type MockWorker = {
  id: string;
  slot: number;
  name: string;
  rrn: string;
  address: string | null;
  bankName: string | null;
  accountNumber: string | null;
  accountHolder: string | null;
  phone: string | null;
  defaultWage: number;
  defaultTrade: string | null;
};

export type MockWorksite = {
  id: string;
  name: string;
};

export type MockCompany = {
  id: string;
  name: string;
};

export const MOCK_COMPANY: MockCompany = {
  id: 'co_iru',
  name: '㈜이루건설',
};

export const MOCK_WORKSITES: MockWorksite[] = [
  { id: 'ws_boun', name: '보은현장' },
];

export function getMockWorkers(): MockWorker[] {
  return workersFixture as MockWorker[];
}

export function getMockWorker(id: string): MockWorker | undefined {
  return getMockWorkers().find(w => w.id === id);
}

export function getMockWorksite(id: string): MockWorksite | undefined {
  return MOCK_WORKSITES.find(w => w.id === id);
}

// 출역 영구 저장은 클라이언트 localStorage에 위임
// 서버 라우트는 클라이언트가 POST로 보낸 attendance 상태를 그대로 사용
export type AttendanceCell = {
  workerId: string;
  day: number;
  hours: number;
};

export type PayrollState = {
  companyId: string;
  worksiteId: string;
  yearMonth: string;            // 'YYYY-MM'
  // worker_id → slot 1~26 (사용자가 노임대장에 추가한 작업자만 슬롯 부여)
  enrolledWorkerIds: string[];  // 순서대로 slot 1, 2, ...
  attendance: AttendanceCell[];
};

export function emptyPayrollState(worksiteId: string, yearMonth: string): PayrollState {
  return {
    companyId: MOCK_COMPANY.id,
    worksiteId,
    yearMonth,
    enrolledWorkerIds: [],
    attendance: [],
  };
}
