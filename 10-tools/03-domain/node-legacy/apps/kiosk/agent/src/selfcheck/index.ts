export * from './obd.js';
export type SelfCheckOrigin = 'manual' | 'scheduled' | 'automatic';
export class SelfCheckLogger { log(_entry: any) {}; append(entry: any) { this.log(entry); } }

