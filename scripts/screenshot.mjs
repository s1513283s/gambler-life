/**
 * 用本機 Chrome 的 DevTools Protocol 對 preview 伺服器截圖，不需要 playwright。
 *   node scripts/screenshot.mjs <url> <out.png> [saveJson]
 * saveJson 會在載入前寫進 localStorage 的 gambler-life:save，用來截特定畫面。
 */
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find(existsSync);
if (!CHROME) throw new Error('chrome not found');

const [url, out, saveJson] = process.argv.slice(2);
const port = 9222 + Math.floor(Math.random() * 500);
const profile = join(tmpdir(), `gl-shot-${port}`);
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--window-size=430,900',
  '--hide-scrollbars',
  '--no-first-run',
  'about:blank',
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function targets() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json`);
      return await res.json();
    } catch {
      await sleep(250);
    }
  }
  throw new Error('chrome did not start');
}

const list = await targets();
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
};
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const cur = ++id;
    pending.set(cur, resolve);
    ws.send(JSON.stringify({ id: cur, method, params }));
  });

await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 900, deviceScaleFactor: 2, mobile: true });
await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url });
await sleep(1500);
if (saveJson) {
  await send('Runtime.evaluate', { expression: `localStorage.setItem('gambler-life:save', ${JSON.stringify(saveJson)}); location.reload();` });
  await sleep(1800);
}
await sleep(600);
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
console.log('wrote', out);
ws.close();
chrome.kill();
