// 출역 추적 시간대 (기기 로컬시간 = KST 기준)
// 이 시간대를 벗어나면 백그라운드 위치 추적과 상시 알림("출역 추적 중")을 중단한다.
// 현장 근무 시간에 맞춰 조정 가능.
export const TRACK_START_HOUR = 8; // 08:00 (포함)
export const TRACK_END_HOUR = 17; // 17:00 (미포함) 이후 추적 중단

export function isWithinTrackWindow(now: Date = new Date()): boolean {
  const h = now.getHours();
  return h >= TRACK_START_HOUR && h < TRACK_END_HOUR;
}
