/**
 * Entry point for rewritten OBD protocol layer.
 * На данном этапе содержит только заглушки для дальнейшей реализации.
 */

export interface ElmCommand {
  name: string;
  payload?: string;
}

export interface ObdTransport {
  write(command: ElmCommand): Promise<void>;
  read(timeoutMs: number): Promise<string>;
}

export class ElmSession {
  constructor(private readonly transport: ObdTransport) {}

  /**
   * TODO: Реализовать очередь команд и адаптивные таймауты по мотивам ElmProt.
   */
  async sendRaw(command: ElmCommand): Promise<string> {
    await this.transport.write(command);
    return this.transport.read(500);
  }
}

export * from './commands.js';
export * from './pids/types.js';
export * from './pids/catalog.js';
export * from './pids/conversions.js';
export * from './dtc/types.js';
export * from './dtc/catalog.js';
