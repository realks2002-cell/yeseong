import type { SupabaseClient } from '@supabase/supabase-js';

// 영수증 OCR — Storage의 영수증 이미지를 Claude 비전으로 분석해
//   상점명/금액/날짜를 추출하고 yeseong_site_photos 행에 저장한다.
//   ANTHROPIC_API_KEY 미설정 시 분석을 건너뛴다 (행은 pending 유지).

const BUCKET = 'site-photos';
const MODEL = 'claude-haiku-4-5';
const API_URL = 'https://api.anthropic.com/v1/messages';

const PROMPT = `이 사진은 한국 영수증입니다. 다음 정보를 추출해 JSON으로만 답하세요(설명 금지):
{"store": "상점/가맹점 이름", "amount": 총 결제 금액(숫자만, 콤마 없이), "date": "결제 날짜 YYYY-MM-DD"}
읽을 수 없거나 영수증이 아니면 해당 값은 null로 하세요.`;

type OcrParsed = {
  store: string | null;
  amount: number | null;
  date: string | null;
};

export type OcrOutcome =
  | { ok: true; parsed: OcrParsed }
  | { ok: false; error: string };

function parseModelJson(text: string): OcrParsed | null {
  // 모델이 코드블록 등으로 감쌀 수 있어 첫 { ... } 만 추출
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]) as Record<string, unknown>;
    const store = typeof j.store === 'string' && j.store.trim() ? j.store.trim().slice(0, 100) : null;
    let amount: number | null = null;
    if (typeof j.amount === 'number' && Number.isFinite(j.amount) && j.amount >= 0) {
      amount = Math.round(j.amount);
    } else if (typeof j.amount === 'string') {
      const n = Number(j.amount.replace(/[^\d.]/g, ''));
      if (Number.isFinite(n) && n >= 0) amount = Math.round(n);
    }
    const date =
      typeof j.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(j.date) ? j.date : null;
    return { store, amount, date };
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function analyzeReceiptPhoto(admin: SupabaseClient<any>, photoId: string): Promise<OcrOutcome> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다' };

  const { data: row, error: rErr } = await admin
    .from('yeseong_site_photos')
    .select('id, category, storage_path, mime_type')
    .eq('id', photoId)
    .single();
  if (rErr || !row) return { ok: false, error: '사진을 찾을 수 없습니다' };
  if (row.category !== 'expense') return { ok: false, error: '영수증(expense) 사진이 아닙니다' };

  const fail = async (msg: string): Promise<OcrOutcome> => {
    await admin
      .from('yeseong_site_photos')
      .update({ ocr_status: 'failed', ocr_raw: { error: msg } })
      .eq('id', photoId);
    return { ok: false, error: msg };
  };

  try {
    const { data: blob, error: dErr } = await admin.storage.from(BUCKET).download(row.storage_path);
    if (dErr || !blob) return fail('이미지 다운로드 실패');
    const b64 = Buffer.from(await blob.arrayBuffer()).toString('base64');

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: row.mime_type, data: b64 },
              },
              { type: 'text', text: PROMPT },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return fail(`AI 호출 실패 (${res.status}) ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = (json.content ?? [])
      .filter((c) => c.type === 'text' && c.text)
      .map((c) => c.text)
      .join('\n');

    const parsed = parseModelJson(text);
    if (!parsed) return fail('AI 응답 파싱 실패');

    // store/amount/date 전부 null이면 인식 실패로 처리
    if (parsed.store === null && parsed.amount === null && parsed.date === null) {
      return fail('영수증 내용을 인식하지 못했습니다');
    }

    const { error: uErr } = await admin
      .from('yeseong_site_photos')
      .update({
        receipt_store: parsed.store,
        receipt_amount: parsed.amount,
        receipt_date: parsed.date,
        ocr_status: 'done',
        ocr_raw: { model: MODEL, text },
      })
      .eq('id', photoId);
    if (uErr) return { ok: false, error: uErr.message };

    return { ok: true, parsed };
  } catch (e) {
    return fail(`분석 오류: ${(e as Error).message}`);
  }
}
