import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { PATHS } from './config.js';
import type { Job, JobStatus } from './types.js';

/**
 * 파일 기반 잡 스토어. 하루 수십 건 규모에서 DB 를 끌어올 이유가 없다.
 * 쓰기는 tmp → rename 으로 원자적으로 처리해 중간에 죽어도 반쪽 JSON 이 남지 않는다.
 */

function jobPath(id: string): string {
  return resolve(PATHS.jobs, `${id}.json`);
}

function ensureDirs(): void {
  mkdirSync(PATHS.jobs, { recursive: true });
}

/**
 * 로컬(운영지) 기준 YYYY-MM-DD. 편성은 "한국의 오늘" 개념이므로
 * UTC 를 쓰면 아침 실행(=UTC 전날 밤)이 어제로 판정되는 버그가 난다.
 */
export function localDate(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 파일명으로 안전하고 시간순 정렬되는 ID. 로컬 날짜 기준. */
function newId(): string {
  return `${localDate().replace(/-/g, '')}-${randomUUID().slice(0, 8)}`;
}

export function createJob(topic: string, scheduledAt?: string): Job {
  ensureDirs();
  const now = new Date().toISOString();
  const job: Job = {
    id: newId(),
    topic,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    ...(scheduledAt ? { scheduledAt } : {}),
  };
  save(job);
  return job;
}

export function save(job: Job): Job {
  ensureDirs();
  const next = { ...job, updatedAt: new Date().toISOString() };
  const tmp = `${jobPath(job.id)}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  renameSync(tmp, jobPath(job.id));
  return next;
}

export function load(id: string): Job {
  try {
    return JSON.parse(readFileSync(jobPath(id), 'utf8')) as Job;
  } catch {
    throw new Error(`잡을 찾을 수 없습니다: ${id}`);
  }
}

export function list(filter?: { status?: JobStatus }): Job[] {
  ensureDirs();
  const jobs = readdirSync(PATHS.jobs)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(resolve(PATHS.jobs, f), 'utf8')) as Job)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return filter?.status ? jobs.filter((j) => j.status === filter.status) : jobs;
}

export function markFailed(job: Job, error: unknown): Job {
  return save({
    ...job,
    status: 'failed',
    error: error instanceof Error ? error.message : String(error),
  });
}
