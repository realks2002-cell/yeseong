import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase/server';

export default async function ManagerGate() {
  const sb = await getServerSupabase();
  const { data: { user } } = await sb.auth.getUser();
  redirect(user ? '/m/manager/home' : '/m/manager/signup');
}
