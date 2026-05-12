'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isLoggedIn } from '@/lib/mock/session';

export default function MobileGate() {
  const router = useRouter();
  useEffect(() => {
    router.replace(isLoggedIn() ? '/m/home' : '/m/signup');
  }, [router]);
  return <div className="min-h-svh bg-white" />;
}
