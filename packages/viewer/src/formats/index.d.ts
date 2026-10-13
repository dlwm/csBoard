import type { ReplayDataSource } from '../data/replaySource.js';

export const REPLAY_PROFILE_VERSION: 'cs2-demo-format/replay/0.1';
export const PACKAGE_LIMITS: Readonly<{ compressed: number; expanded: number; file: number; entries: number }>;
export class DemoFormatError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;
  constructor(code: string, message: string, details?: Record<string, unknown>);
}
/**
 * Open a standard replay-profile ZIP without CSBoard cache conversion.
 * File/Blob inputs are size-checked before copying. Catalogue data is eager;
 * segment rows and events are decoded on demand. The caller owns the source.
 * 标准包读取器：目录立即读取，回合与事件按需解压；宿主负责销毁来源。
 */
export function openReplayPackageSource(
  input: Uint8Array | ArrayBuffer | Blob,
  options?: { signal?: AbortSignal },
): Promise<ReplayDataSource>;
