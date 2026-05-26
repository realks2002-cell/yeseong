// 매사(masonry) 단가 카테고리·단위 상수
export const MASONRY_CATEGORIES = ['조적', '미장', '방수', '타일', '석공사'] as const;
export type MasonryCategory = (typeof MASONRY_CATEGORIES)[number];

// 단위 선택형 카테고리(단위별로 단가를 따로 등록). 조적만 벽돌종류·규격 방식.
export const UNIT_CATEGORIES = ['미장', '방수', '타일', '석공사'] as const;

// 단위 옵션
export const MASONRY_UNITS = ['㎡', '㎥', 'm', '장', '매', '식', '롤'] as const;
export type MasonryUnit = (typeof MASONRY_UNITS)[number];

// 조적 전용 종류
export const BRICK_TYPES = ['시멘트벽돌쌓기', '블록쌓기', '치장쌓기'] as const;
// 블록쌓기만 규격(인치) 선택
export const BLOCK_SIZES = ['4인치', '6인치', '8인치'] as const;

// 조적 종류가 규격을 가지면 규격 목록, 아니면 null (현재 블록쌓기만)
export function brickSizes(typeName: string): readonly string[] | null {
  return typeName === '블록쌓기' ? BLOCK_SIZES : null;
}

export function isUnitCategory(category: string): boolean {
  return (UNIT_CATEGORIES as readonly string[]).includes(category);
}

// 종류(type_name)를 세분하는 카테고리. (현재 미장만; 향후 다른 카테고리 추가 가능)
export const PLASTER_TYPES = ['벽미장', 'STF', '기포', '방통', '견출', '비드설치'] as const;

const CATEGORY_TYPE_OPTIONS: Record<string, readonly string[]> = {
  미장: PLASTER_TYPES,
};

// 해당 카테고리가 종류를 세분하면 종류 목록, 아니면 null
export function categoryTypes(category: string): readonly string[] | null {
  return CATEGORY_TYPE_OPTIONS[category] ?? null;
}
