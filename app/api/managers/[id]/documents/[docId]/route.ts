import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// 증빙 보존 정책: 팀장(=작업자) 문서(신분증·통장·이수증)는 삭제할 수 없습니다.
// 법정 증빙 무결성 보호 — 작업자·관리자 모두 삭제 불가. (Storage는 일일 백업 대상도 아님)
export function DELETE() {
  return NextResponse.json(
    { error: '문서는 삭제할 수 없습니다. (증빙 보존 정책)' },
    { status: 403 },
  );
}
