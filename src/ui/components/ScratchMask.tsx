import { useEffect, useRef } from 'react';
import { CONFIG } from '../../config';

interface Props {
  /** 刮開比例達到門檻時呼叫一次 */
  onCleared: () => void;
}

const BRUSH_RADIUS = 22;
const CHECK_EVERY = 6; // 每幾次移動抽樣一次刮開比例

/**
 * 蓋在獎金上的銀漆。手指或滑鼠拖曳用 destination-out 擦除，
 * 抽樣像素 alpha 算刮開比例，超過門檻就整片清掉並通知父層。
 */
export function ScratchMask({ onCleared }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clearedRef = useRef(false);
  const movesRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    if (ctx === null) return;
    ctx.scale(dpr, dpr);

    const gradient = ctx.createLinearGradient(0, 0, w, h);
    gradient.addColorStop(0, '#b8bcc6');
    gradient.addColorStop(0.5, '#e5e7eb');
    gradient.addColorStop(1, '#9ca3af');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#6b7280';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('用手指刮開', w / 2, h / 2 + 6);
    ctx.globalCompositeOperation = 'destination-out';
  }, []);

  const clearedRatio = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement): number => {
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let cleared = 0;
    let samples = 0;
    for (let i = 3; i < data.length; i += 64) {
      samples += 1;
      if (data[i] === 0) cleared += 1;
    }
    return samples === 0 ? 0 : cleared / samples;
  };

  const scratchAt = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (canvas === null || clearedRef.current) return;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return;
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.arc(clientX - rect.left, clientY - rect.top, BRUSH_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    movesRef.current += 1;
    if (movesRef.current % CHECK_EVERY !== 0) return;
    if (clearedRatio(ctx, canvas) >= CONFIG.SCRATCH_REVEAL_RATIO) {
      clearedRef.current = true;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      onCleared();
    }
  };

  return (
    <canvas
      ref={canvasRef}
      className="scratch-mask"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        scratchAt(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (e.buttons === 0) return;
        scratchAt(e.clientX, e.clientY);
      }}
    />
  );
}
