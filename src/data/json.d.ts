// 資料 JSON 很大，不讓 TS 去推它們的型別；內容一律經 schema.ts 驗證後才使用。
declare module '*.json' {
  const value: unknown;
  export default value;
}
