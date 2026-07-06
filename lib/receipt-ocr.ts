import type { SupabaseClient } from '@supabase/supabase-js';
import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';
import { scoreAdultVenue } from './adult-venue';

// 영수증 OCR — Storage의 영수증 이미지를 Gemini 비전으로 분석해
//   상호명/사업자번호/금액/날짜/품목을 추출하고 yeseong_site_photos 행에 저장한다.
//   GOOGLE_GENERATIVE_AI_API_KEY 미설정 시 분석을 건너뛴다 (행은 pending 유지).

const BUCKET = 'site-photos';
const MODEL = 'gemini-2.5-flash';

const PROMPT = `이 사진은 한국의 결제 영수증입니다. 필드를 정확히 읽어 구조화해 주세요.
- store: 가게 상호명만. 보통 맨 위 큰 글씨이거나 "[매장]" 뒤에 옵니다. 주소·대표자명·전화번호·카드사명("하나체크카드" 등)을 상호로 착각하지 마세요.
- business_no: "사업자"/"사업자등록번호" 뒤의 XXX-XX-XXXXX 형식 번호(하이픈 포함). 없으면 null.
- amount: 최종 결제금액(합계/총액/결제대상금액/승인금액). 숫자만.
- date: 결제일([매출일]/거래일시/구매 등). "26/07/03"처럼 두 자리 연도는 20XX로 해석. 결제 연도이므로 미래나 2000년대 초 같은 비현실적 값이 되지 않게 하세요.
- items: 상품명 표의 각 품목(품명·단가·수량·금액). 품목 표가 없으면 빈 배열.
- has_excise_tax: 영수증에 "개별소비세" 항목/글자가 있으면 true, 없으면 false.
- business_category: 업태/업종/종목 표기(예: 유흥주점, 일반음식점, 종합소매업). 없으면 null.
- payment_time: 결제 시각을 "HH:MM"(24시간)으로. 거래일시 등에서 시각만. 없으면 null.
- 확실히 못 읽는 값은 null(items는 빈 배열, has_excise_tax는 false). 영수증이 아니면 모든 값 null.`;

const ReceiptSchema = z.object({
  store: z.string().nullable().describe('가게 상호명. 주소·대표자·카드사명 제외. 못 읽으면 null'),
  business_no: z.string().nullable().describe('사업자등록번호 XXX-XX-XXXXX. 없으면 null'),
  amount: z.number().nullable().describe('최종 결제금액(숫자). 못 읽으면 null'),
  date: z.string().nullable().describe('결제일 YYYY-MM-DD. 두 자리 연도는 20XX. 못 읽으면 null'),
  items: z
    .array(
      z.object({
        name: z.string().describe('품명'),
        unit_price: z.number().nullable().describe('단가'),
        qty: z.number().nullable().describe('수량'),
        amount: z.number().nullable().describe('금액'),
      }),
    )
    .describe('품목 표의 각 항목. 없으면 빈 배열'),
  has_excise_tax: z.boolean().describe('"개별소비세" 항목이 있으면 true'),
  business_category: z.string().nullable().describe('업태/업종/종목. 없으면 null'),
  payment_time: z.string().nullable().describe('결제 시각 HH:MM(24시간). 없으면 null'),
});

type OcrItem = {
  name: string;
  unit_price: number | null;
  qty: number | null;
  amount: number | null;
};

type OcrParsed = {
  store: string | null;
  business_no: string | null;
  amount: number | null;
  date: string | null;
  items: OcrItem[];
};

export type OcrOutcome =
  | { ok: true; parsed: OcrParsed }
  | { ok: false; error: string };

function sanitize(obj: z.infer<typeof ReceiptSchema>): OcrParsed {
  const store = typeof obj.store === 'string' && obj.store.trim() ? obj.store.trim().slice(0, 100) : null;
  const business_no =
    typeof obj.business_no === 'string' && /\d{3}-\d{2}-\d{5}/.test(obj.business_no)
      ? obj.business_no.match(/\d{3}-\d{2}-\d{5}/)![0]
      : null;
  const amount =
    typeof obj.amount === 'number' && Number.isFinite(obj.amount) && obj.amount >= 0
      ? Math.round(obj.amount)
      : null;
  // 연도가 비현실적(2020 미만/내년 초과)이면 오독으로 보고 버림 → '-'로 표시되어 사람이 채움
  let date: string | null = null;
  if (typeof obj.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(obj.date)) {
    const year = Number(obj.date.slice(0, 4));
    if (year >= 2020 && year <= new Date().getFullYear() + 1) date = obj.date;
  }
  const num = (v: number | null): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null;
  const items: OcrItem[] = (obj.items ?? [])
    .map((it) => ({
      name: typeof it.name === 'string' ? it.name.trim().slice(0, 100) : '',
      unit_price: num(it.unit_price),
      qty: num(it.qty),
      amount: num(it.amount),
    }))
    .filter((it) => it.name);
  return { store, business_no, amount, date, items };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function analyzeReceiptPhoto(admin: SupabaseClient<any>, photoId: string): Promise<OcrOutcome> {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return { ok: false, error: 'GOOGLE_GENERATIVE_AI_API_KEY가 설정되지 않았습니다' };
  }

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
    const dataUrl = `data:${row.mime_type};base64,${b64}`;

    const result = await generateObject({
      model: google(MODEL),
      schema: ReceiptSchema,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
            { type: 'image', image: dataUrl },
          ],
        },
      ],
    });

    const parsed = sanitize(result.object);

    // 사업자번호 캐시로 상호 교정: 같은 매장은 확정 상호를 재사용(오독 자동 교정),
    //   처음 보는 사업자번호는 이번 OCR 상호로 신규 등록.
    if (parsed.business_no) {
      const { data: cached } = await admin
        .from('yeseong_receipt_vendors')
        .select('store')
        .eq('business_no', parsed.business_no)
        .maybeSingle();
      if (cached?.store) {
        parsed.store = cached.store;
      } else if (parsed.store) {
        await admin
          .from('yeseong_receipt_vendors')
          .upsert({ business_no: parsed.business_no, store: parsed.store });
      }
    }

    // store/amount/date 전부 null이면 인식 실패로 처리
    if (parsed.store === null && parsed.amount === null && parsed.date === null) {
      return fail('영수증 내용을 인식하지 못했습니다');
    }

    // 유흥업소 의심 스코어링(규칙 기반) — 교정된 상호 기준
    const adult = scoreAdultVenue({
      store: parsed.store,
      businessCategory: result.object.business_category ?? null,
      hasExciseTax: result.object.has_excise_tax === true,
      items: parsed.items,
      paymentTime: result.object.payment_time ?? null,
    });

    const { error: uErr } = await admin
      .from('yeseong_site_photos')
      .update({
        receipt_store: parsed.store,
        receipt_amount: parsed.amount,
        receipt_date: parsed.date,
        receipt_items: parsed.items.length > 0 ? parsed.items : null,
        adult_score: adult.score,
        adult_signals: adult.signals.length > 0 ? adult.signals : null,
        ocr_status: 'done',
        ocr_raw: {
          model: MODEL,
          business_no: parsed.business_no,
          has_excise_tax: result.object.has_excise_tax === true,
          business_category: result.object.business_category ?? null,
          payment_time: result.object.payment_time ?? null,
          parsed: result.object,
        },
      })
      .eq('id', photoId);
    if (uErr) return { ok: false, error: uErr.message };

    return { ok: true, parsed };
  } catch (e) {
    return fail(`분석 오류: ${(e as Error).message}`);
  }
}
