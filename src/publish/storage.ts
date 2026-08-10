import { createReadStream, statSync } from 'node:fs';
import { basename } from 'node:path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from '../config.js';

/**
 * 인스타는 파일 업로드를 받지 않는다 — 공개 URL 을 주면 Meta 가 직접 cURL 해간다.
 * 그래서 렌더 산출물을 어딘가 공개 위치에 올려야 한다. (R2 / S3 호환 아무거나)
 */
export async function uploadPublic(
  localPath: string,
  key?: string,
  contentType = 'video/mp4',
): Promise<string> {
  const objectKey = key ?? `videos/${basename(localPath)}`;

  const client = new S3Client({
    region: env.storage.region(),
    ...(env.storage.endpoint() ? { endpoint: env.storage.endpoint() } : {}),
    credentials: {
      accessKeyId: env.storage.accessKeyId(),
      secretAccessKey: env.storage.secretAccessKey(),
    },
  });

  await client.send(
    new PutObjectCommand({
      Bucket: env.storage.bucket(),
      Key: objectKey,
      Body: createReadStream(localPath),
      ContentLength: statSync(localPath).size, // 스트림 업로드에는 길이가 필요하다
      ContentType: contentType,
    }),
  );

  return `${env.storage.publicBaseUrl()}/${objectKey}`;
}
