import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PATHS } from '../config.js';

/**
 * 최근에 다룬 주제 기억.
 * 같은 이슈를 며칠 연속 올리면 (1) 도달이 죽고 (2) 플랫폼 중복 탐지에 걸린다.
 */

export interface HistoryEntry {
  date: string;
  channelId: string;
  headline: string;
  keywords: string[];
}

function historyPath(): string {
  return resolve(PATHS.data, 'history.json');
}

export function readHistory(): HistoryEntry[] {
  const path = historyPath();
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as HistoryEntry[];
  } catch {
    return [];
  }
}

export function recentFor(channelId: string, days = 10): HistoryEntry[] {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  return readHistory().filter((e) => e.channelId === channelId && e.date >= cutoff);
}

export function appendHistory(entry: HistoryEntry): void {
  mkdirSync(PATHS.data, { recursive: true });
  // 90일치만 남긴다 — 그보다 오래된 주제는 다시 다뤄도 무방하다.
  const cutoff = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const next = [...readHistory().filter((e) => e.date >= cutoff), entry];

  const path = historyPath();
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  renameSync(tmp, path);
}
