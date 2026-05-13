import { getServerSupabase } from '@/lib/supabase/server';

export type CompanySettings = {
  company_name: string;
  business_number: string | null;
  representative: string | null;
  address: string | null;
};

const FALLBACK: CompanySettings = {
  company_name: '예성건설',
  business_number: null,
  representative: null,
  address: null,
};

export async function getCompanySettings(): Promise<CompanySettings> {
  const sb = await getServerSupabase();
  const { data } = await sb
    .from('yeseong_settings')
    .select('company_name, business_number, representative, address')
    .eq('id', 'singleton')
    .maybeSingle();
  return data ?? FALLBACK;
}
