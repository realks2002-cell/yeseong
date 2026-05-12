'use client';
import { useState } from 'react';
import { AdminShell } from '@/components/admin-shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useWorkers, type WorkerInput } from '@/lib/mock/use-workers';
import { maskRrn } from '@/lib/crypto/rrn';
import { WorkerForm } from '@/components/worker-form';
import type { MockWorker } from '@/lib/mock/store';
import { UserPlus, Pencil, Trash2, RotateCcw } from 'lucide-react';

export default function WorkersPage() {
  const { workers, hydrated, addWorker, updateWorker, deleteWorker, resetWorkers } = useWorkers();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<MockWorker | null>(null);

  function handleAdd(input: WorkerInput) {
    addWorker(input);
    setShowAdd(false);
  }
  function handleSave(input: WorkerInput) {
    if (editing) updateWorker(editing.id, input);
    setEditing(null);
  }
  function handleDelete(w: MockWorker) {
    if (!confirm(`${w.name} 작업자를 삭제할까요? (현재 진행 중인 노임대장에서는 자동 제거되지 않을 수 있음)`)) return;
    deleteWorker(w.id);
  }
  function handleReset() {
    if (!confirm('초기 14명으로 되돌릴까요? 추가/수정/삭제한 내용이 모두 사라집니다.')) return;
    resetWorkers();
  }

  return (
    <AdminShell>
      <div className="mx-auto max-w-7xl p-6">
        <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">작업자 마스터</h1>
            <p className="text-sm text-zinc-500 mt-1">
              총 {hydrated ? workers.length : '...'}명. 주민번호는 표시용으로 마스킹됩니다.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleReset} title="초기 데이터로 되돌리기">
              <RotateCcw className="h-4 w-4" />
              초기화
            </Button>
            <Button onClick={() => setShowAdd(true)}>
              <UserPlus className="h-4 w-4" />
              작업자 추가
            </Button>
          </div>
        </div>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-zinc-50 text-zinc-600">
                <tr className="text-left text-[11px]">
                  <th className="px-3 py-2 font-medium w-10">#</th>
                  <th className="px-3 py-2 font-medium">성명</th>
                  <th className="px-3 py-2 font-medium">공종</th>
                  <th className="px-3 py-2 font-medium">주민번호</th>
                  <th className="px-3 py-2 font-medium">은행</th>
                  <th className="px-3 py-2 font-medium">계좌</th>
                  <th className="px-3 py-2 font-medium">연락처</th>
                  <th className="px-3 py-2 font-medium text-right">기본일당</th>
                  <th className="px-3 py-2 font-medium w-20"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {workers.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-zinc-400">
                      등록된 작업자가 없습니다.
                    </td>
                  </tr>
                ) : (
                  workers.map((w, i) => (
                    <tr key={w.id} className="hover:bg-zinc-50">
                      <td className="px-3 py-2 text-zinc-500 tabular-nums">{i + 1}</td>
                      <td className="px-3 py-2 font-medium">{w.name}</td>
                      <td className="px-3 py-2">
                        {w.defaultTrade && (
                          <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px]">{w.defaultTrade}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-zinc-600">{maskRrn(w.rrn)}</td>
                      <td className="px-3 py-2">{w.bankName ?? '-'}</td>
                      <td className="px-3 py-2 font-mono text-[11px] text-zinc-600">{w.accountNumber ?? '-'}</td>
                      <td className="px-3 py-2 font-mono text-[11px]">{w.phone ?? '-'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{w.defaultWage.toLocaleString()}원</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-0.5">
                          <button
                            className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                            onClick={() => setEditing(w)}
                            aria-label="수정"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            className="rounded p-1 text-zinc-500 hover:bg-red-50 hover:text-red-600"
                            onClick={() => handleDelete(w)}
                            aria-label="삭제"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <p className="mt-4 text-xs text-zinc-500">
          현재 Mock 모드입니다. 데이터는 브라우저 localStorage에 저장되며, 다른 기기로는 동기화되지 않습니다.
        </p>
      </div>

      {showAdd && (
        <WorkerForm
          title="작업자 추가"
          onSubmit={handleAdd}
          onCancel={() => setShowAdd(false)}
        />
      )}
      {editing && (
        <WorkerForm
          title={`${editing.name} 수정`}
          initial={editing}
          onSubmit={handleSave}
          onCancel={() => setEditing(null)}
        />
      )}
    </AdminShell>
  );
}
