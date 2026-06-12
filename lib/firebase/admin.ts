import admin from 'firebase-admin';

// 환경변수 저장 과정(대시보드 붙여넣기·CLI)에서 private_key의 \n이
// 실제 줄바꿈으로 바뀌거나 값 끝에 잔여 문자가 붙는 변형을 복구해서 파싱
function parseServiceAccount(raw: string): Record<string, unknown> {
  const s = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
  try {
    return JSON.parse(s);
  } catch {
    return JSON.parse(
      s.replace(/("private_key"\s*:\s*")([\s\S]*?)("\s*,)/, (_, a: string, k: string, c: string) =>
        a + k.replace(/\r?\n/g, '\\n') + c,
      ),
    );
  }
}

function getApp(): admin.app.App {
  if (admin.apps.length > 0) return admin.apps[0]!;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_JSON 환경변수가 설정되지 않았습니다. ' +
      'Firebase Console → 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성 후 JSON 내용을 환경변수에 넣어주세요.',
    );
  }

  const credential = parseServiceAccount(raw);
  return admin.initializeApp({
    credential: admin.credential.cert(credential),
  });
}

export function getMessaging(): admin.messaging.Messaging {
  return getApp().messaging();
}

/**
 * FCM 멀티캐스트 발송 (최대 500개씩 분할)
 */
export async function sendMulticast(
  tokens: string[],
  title: string,
  body: string,
): Promise<{ successCount: number; failureCount: number }> {
  if (tokens.length === 0) return { successCount: 0, failureCount: 0 };

  const messaging = getMessaging();
  let successCount = 0;
  let failureCount = 0;

  // FCM multicast는 한 번에 최대 500개
  for (let i = 0; i < tokens.length; i += 500) {
    const batch = tokens.slice(i, i + 500);
    const res = await messaging.sendEachForMulticast({
      tokens: batch,
      notification: { title, body },
      android: {
        priority: 'high',
        notification: { channelId: 'default', sound: 'default' },
      },
    });
    successCount += res.successCount;
    failureCount += res.failureCount;
  }

  return { successCount, failureCount };
}
