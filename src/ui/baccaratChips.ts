import { CONFIG } from '../config';

export interface ChipDef {
  value: number;
  label: string;
  tone: string; // CSS class，決定籌碼顏色
}

/** 籌碼盤上的面額，MAX 另外處理 */
export const CHIP_DEFS: ChipDef[] = CONFIG.BACCARAT_CHIPS.map((value) => ({
  value,
  label: value >= 1000 ? `${value / 1000}K` : String(value),
  tone: value >= 5000 ? 'chip-5000' : value >= 1000 ? 'chip-1000' : value >= 500 ? 'chip-500' : 'chip-100',
}));

/** 任意金額拆成籌碼（大面額優先），純視覺用；零頭補成一枚 */
export function chipsFor(amount: number): number[] {
  const out: number[] = [];
  let left = Math.max(0, Math.floor(amount));
  for (const v of [...CONFIG.BACCARAT_CHIPS].sort((a, b) => b - a)) {
    while (left >= v && out.length < 40) {
      out.push(v);
      left -= v;
    }
  }
  if (left > 0) out.push(left);
  return out;
}

export function toneOf(value: number): string {
  return CHIP_DEFS.find((c) => c.value === value)?.tone ?? (value > 5000 ? 'chip-5000' : 'chip-100');
}
