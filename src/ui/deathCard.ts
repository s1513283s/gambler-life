/**
 * 死亡卡片 PNG：直接用 Canvas 2D 畫固定版面，不用 html2canvas。
 * 純文字排版，任何字型都能畫，iOS Safari 沒有相容問題。
 */
import { CONFIG } from '../config';
import { buildDeathCard } from '../engine/death';
import type { GameState } from '../types';

const FONT = '-apple-system, "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif';

export function renderDeathCard(state: GameState): HTMLCanvasElement {
  const w = CONFIG.DEATH_CARD_WIDTH;
  const h = CONFIG.DEATH_CARD_HEIGHT;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx === null) return canvas;

  const card = buildDeathCard(state);
  const retired = state.phase === 'RETIRED';

  // 背景
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#111318');
  bg.addColorStop(1, '#1c1f27');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // 頂部色帶
  ctx.fillStyle = retired ? '#4ade80' : '#f5c542';
  ctx.fillRect(0, 0, w, 18);

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#9aa0ad';
  ctx.font = `600 40px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.fillText('賭徒人生', 80, 130);

  ctx.fillStyle = '#f2f3f5';
  ctx.font = `800 128px ${FONT}`;
  ctx.fillText(card.title, 80, 290);

  // 分隔線
  ctx.strokeStyle = '#2c3140';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(80, 340);
  ctx.lineTo(w - 80, 340);
  ctx.stroke();

  // 各行：左標籤右數值
  let y = 430;
  const rowH = Math.min(78, Math.floor((h - 430 - 160) / Math.max(card.lines.length, 1)));
  for (const [i, line] of card.lines.entries()) {
    const first = i === 0;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#9aa0ad';
    ctx.font = `500 ${first ? 40 : 34}px ${FONT}`;
    ctx.fillText(line.label, 80, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = first ? (retired ? '#4ade80' : '#f87171') : '#f2f3f5';
    ctx.font = `700 ${first ? 44 : 38}px ${FONT}`;
    ctx.fillText(line.value, w - 80, y);
    y += rowH;
  }

  // 頁尾
  ctx.textAlign = 'left';
  ctx.fillStyle = '#6b7280';
  ctx.font = `500 30px ${FONT}`;
  ctx.fillText('每天要付開銷，可以打工也可以賭。看你能活幾天。', 80, h - 90);

  return canvas;
}

export function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob === null ? reject(new Error('toBlob failed')) : resolve(blob)), 'image/png');
  });
}

export function canShareFile(file: File): boolean {
  return typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
}
