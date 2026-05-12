const SEED_USERS: Record<string, { pin: string; name: string }> = {
  '01012345678': { pin: '1111', name: '김명봉' },
};

export function normalizePhone(v: string): string {
  return v.replace(/\D/g, '');
}

export function isRegistered(phone: string): boolean {
  return normalizePhone(phone) in SEED_USERS;
}

export function verifyPin(phone: string, pin: string): boolean {
  const u = SEED_USERS[normalizePhone(phone)];
  return !!u && u.pin === pin;
}
