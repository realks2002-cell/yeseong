// 발주서 텍스트 생성 — 카카오톡 붙여넣기용
// 한 발주서에 여러 거래처 품목이 섞일 수 있어 거래처 단위로 그룹핑해 생성한다.

export type OrderLineForText = {
  item_name: string;
  spec: string | null;
  unit: string;
  quantity: number;
  note: string | null;
  vendor_id: string | null;
  vendor_name: string | null;
  vendor_phone: string | null;
};

export type OrderForText = {
  order_no: string;
  worksite_name: string;
  worksite_address: string | null;
  delivery_date: string | null;
  note: string | null;
};

export type VendorGroup = {
  vendorId: string | null;
  vendorName: string;
  vendorPhone: string | null;
  lines: OrderLineForText[];
};

/** 품목을 거래처별로 그룹핑 (거래처 미지정 품목은 "거래처 미지정" 그룹) */
export function groupByVendor(lines: OrderLineForText[]): VendorGroup[] {
  const map = new Map<string, VendorGroup>();
  for (const line of lines) {
    const key = line.vendor_id ?? '__none__';
    if (!map.has(key)) {
      map.set(key, {
        vendorId: line.vendor_id,
        vendorName: line.vendor_name ?? '거래처 미지정',
        vendorPhone: line.vendor_phone,
        lines: [],
      });
    }
    map.get(key)!.lines.push(line);
  }
  return Array.from(map.values());
}

function fmtDeliveryDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  const dow = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()}(${dow})`;
}

/** 거래처 1곳에 보낼 발주서 텍스트 생성 */
export function buildOrderText(order: OrderForText, group: VendorGroup): string {
  const lines: string[] = [];
  lines.push(`[예성건축 발주서] ${order.order_no}`);
  lines.push(`■ 현장: ${order.worksite_name}${order.worksite_address ? ` (${order.worksite_address})` : ''}`);
  if (order.delivery_date) {
    lines.push(`■ 납기: ${fmtDeliveryDate(order.delivery_date)}`);
  }
  lines.push('■ 품목');
  group.lines.forEach((l, i) => {
    const spec = l.spec ? ` ${l.spec}` : '';
    const note = l.note ? ` (${l.note})` : '';
    lines.push(` ${i + 1}. ${l.item_name}${spec} × ${l.quantity}${l.unit}${note}`);
  });
  if (order.note) {
    lines.push(`■ 요청: ${order.note}`);
  }
  return lines.join('\n');
}
