'use client';
import { useEffect, useState, useCallback } from 'react';
import workersFixture from './workers.fixture.json';
import type { MockWorker } from './store';

const KEY = 'yeseong:workers';

function loadWorkers(): MockWorker[] {
  if (typeof window === 'undefined') return workersFixture as MockWorker[];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return workersFixture as MockWorker[];
    return JSON.parse(raw) as MockWorker[];
  } catch {
    return workersFixture as MockWorker[];
  }
}

function persist(workers: MockWorker[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, JSON.stringify(workers));
}

function nextId(workers: MockWorker[]): string {
  let n = workers.length + 1;
  while (workers.some(w => w.id === `w_${n}`)) n++;
  return `w_${n}`;
}

export type WorkerInput = Omit<MockWorker, 'id' | 'slot'>;

export function useWorkers() {
  const [workers, setWorkers] = useState<MockWorker[]>(() => workersFixture as MockWorker[]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setWorkers(loadWorkers());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) persist(workers);
  }, [workers, hydrated]);

  const addWorker = useCallback((input: WorkerInput) => {
    setWorkers(prev => {
      const id = nextId(prev);
      const slot = (prev.at(-1)?.slot ?? 0) + 1;
      return [...prev, { ...input, id, slot }];
    });
  }, []);

  const updateWorker = useCallback((id: string, patch: WorkerInput) => {
    setWorkers(prev => prev.map(w => (w.id === id ? { ...w, ...patch } : w)));
  }, []);

  const deleteWorker = useCallback((id: string) => {
    setWorkers(prev => prev.filter(w => w.id !== id));
  }, []);

  const resetWorkers = useCallback(() => {
    setWorkers(workersFixture as MockWorker[]);
    if (typeof window !== 'undefined') localStorage.removeItem(KEY);
  }, []);

  return { workers, hydrated, addWorker, updateWorker, deleteWorker, resetWorkers };
}
