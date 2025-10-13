// Minimal Node shims to satisfy TypeScript in this skeleton (no runtime polyfills)
/* eslint-disable @typescript-eslint/no-explicit-any */
declare const require: any
declare const module: any
declare const process: any

declare module 'http' {
  export function createServer(handler?: (req: any, res: any) => void): any
}

// In this prototype, TypeScript with NodeNext may not resolve @types for some CJS libs reliably.
// Provide a minimal ambient module to unblock builds; runtime uses real nodemailer.
declare module 'nodemailer' {
  const nodemailer: any
  export default nodemailer
}
