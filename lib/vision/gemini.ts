// Gemini 2.0 Flash로 출역부 이미지에서 작업자 + 출근일 추출
// 환경변수(GOOGLE_GENERATIVE_AI_API_KEY) 없으면 mock 응답 반환
import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';

export const VisionResultSchema = z.object({
  workers: z.array(
    z.object({
      name: z.string().describe('한국 이름. 손글씨면 추정 결과'),
      hours_by_day: z
        .record(z.string(), z.number())
        .describe('출근일자별 공수. 키는 1..31의 문자열 day, 값은 0.5/1/1.5/2 등'),
      confidence: z.enum(['high', 'medium', 'low']),
      notes: z.string().nullable(),
    })
  ),
  detected_year_month: z.string().nullable().describe('YYYY-MM (감지된 경우)'),
});

export type VisionResult = z.infer<typeof VisionResultSchema>;

export async function extractAttendanceFromImage(args: {
  imageBase64DataUrl: string;
  hintYearMonth: string;
}): Promise<VisionResult> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    return mockResult(args.hintYearMonth);
  }

  const result = await generateObject({
    model: google('gemini-2.0-flash'),
    schema: VisionResultSchema,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              `대한민국 건설현장 종이 출역부 사진. ${args.hintYearMonth} 월의 출역 명단을 읽어 ` +
              '작업자별 이름과 출근일자(1~31) 및 공수(보통 1, 반공수=0.5, 잔업포함 1.5/2 가능)를 JSON으로 추출. ' +
              '손글씨라 자신 없으면 confidence: "low" 표시. 이름은 한국식 2~4자.',
          },
          { type: 'image', image: args.imageBase64DataUrl },
        ],
      },
    ],
  });
  return result.object;
}

function mockResult(yyyymm: string): VisionResult {
  // 실제 Gemini 미설정 시: 템플릿 4월에서 추출한 패턴 흉내
  return {
    detected_year_month: yyyymm,
    workers: [
      {
        name: '오철학',
        hours_by_day: {
          '2': 1, '3': 1, '4': 1, '5': 1, '6': 1, '9': 1, '10': 1,
          '11': 1, '12': 1, '13': 1, '16': 1, '17': 1, '18': 1, '19': 1,
        },
        confidence: 'high',
        notes: null,
      },
      {
        name: '장진우',
        hours_by_day: {
          '1': 1, '2': 1, '3': 1, '8': 1, '15': 1, '22': 1, '29': 1,
        },
        confidence: 'medium',
        notes: null,
      },
      {
        name: '이상천',
        hours_by_day: {
          '5': 1, '6': 1, '12': 1, '13': 1, '19': 1, '20': 0.5, '26': 1, '27': 1,
        },
        confidence: 'high',
        notes: null,
      },
      {
        name: '한챵용',  // OCR 오인식 케이스 ('한창용' → '한챵용')
        hours_by_day: { '1': 1, '8': 1, '15': 1 },
        confidence: 'low',
        notes: '글씨가 흐림',
      },
    ],
  };
}
