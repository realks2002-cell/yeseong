// 주소 → 좌표 지오코딩 (서버 전용)
// 정책: 자동 지오코딩은 gps_registered_at을 찍지 않는다.
//   사람(팀장 앱·관리자 지도)이 등록한 좌표는 gps_registered_at이 있고, 자동 갱신으로 덮지 않는다.

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!KEY || !address.trim()) return null;
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&language=ko&region=kr&key=${KEY}`;
    const res = await fetch(url);
    const json = await res.json();
    const loc = json?.results?.[0]?.geometry?.location;
    if (typeof loc?.lat === 'number' && typeof loc?.lng === 'number') {
      return { lat: loc.lat, lng: loc.lng };
    }
    return null;
  } catch {
    return null;
  }
}
