import type { ParserEngine } from './session.js';
/** Go-specific transport binding; application orchestration consumes ParserEngine. */
export interface GoTransport {
  execution?: string;
  sourceRevision?: string;
  compactTicks?: boolean;
  init(): Promise<unknown>;
  openSources(source: unknown): Promise<Array<{ part: number; byteLength: number }>>;
  request(method: string, args: Record<string, unknown>): Promise<unknown>;
  close?(): void | Promise<void>;
}
export function createGoParserEngine(transport: GoTransport, options?: { includeVoice?: boolean }): ParserEngine;
