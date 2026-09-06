import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Vercel 用根路徑；GitHub Pages 用 `BASE_PATH=/repo名/ npm run build`
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [react()],
  json: {
    // 大型資料檔用 JSON.parse 字串嵌入，比物件字面量解析快、體積小
    stringify: true,
  },
});
