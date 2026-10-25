/// <reference lib="webworker" />
import { analyzePixels } from './core.mjs';

self.onmessage = (event: MessageEvent<{ type: 'analyze'; buffer: ArrayBuffer; width: number; height: number; requestId: number }>) => {
  const { type, buffer, width, height, requestId } = event.data;
  if (type !== 'analyze') return;
  try {
    const result = analyzePixels(new Uint8ClampedArray(buffer), width, height);
    self.postMessage({ type: 'success', requestId, result });
  } catch (error) {
    const e = error as Error & { code?: string; quality?: unknown };
    self.postMessage({ type: 'error', requestId, message: e.message || 'Image analysis failed.', code: e.code || 'ANALYSIS_FAILED', quality: e.quality || null });
  }
};
export {};
