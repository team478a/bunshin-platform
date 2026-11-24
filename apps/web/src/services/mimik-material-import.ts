import 'server-only';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { fromBufferPromise } from 'yauzl';
import { z } from 'zod';

export const maxMimikBytes = 8 * 1024 * 1024;
const maxEntryBytes = 3 * 1024 * 1024;
const maxArchiveBytes = 12 * 1024 * 1024;
const maxSteps = 30;
const imagePath = /^screenshots\/[a-zA-Z0-9_-]{1,64}\.webp$/;
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
const manifestSchema = z.object({
  version: z.literal(1),
  guide: z.object({
    title: z.string().trim().min(1).max(160),
    description: z.string().max(400).optional(),
  }),
  redacted: z.object({ inputValues: z.literal(true), urls: z.enum(['path', 'origin']) }),
  steps: z
    .array(
      z.object({
        id,
        index: z.number().int().nonnegative(),
        description: z.string().max(400),
        inputValue: z.never().optional(),
      }),
    )
    .min(1)
    .max(maxSteps),
  screenshots: z
    .array(
      z.object({
        stepId: id,
        file: z.string().regex(imagePath),
        mimeType: z.literal('image/webp'),
      }),
    )
    .min(1)
    .max(maxSteps),
});

export class InvalidMimikRecording extends Error {}

function safeText(value: string) {
  return value
    .replace(/\b(?:https?:\/\/|mailto:)\S+/gi, '[URL]')
    .replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi, '[メールアドレス]')
    .trim();
}

async function readBundle(bytes: Buffer) {
  const zip = await fromBufferPromise(bytes, {
    lazyEntries: true,
    autoClose: false,
    strictFileNames: true,
    validateEntrySizes: true,
  });
  const files = new Map<string, Buffer>();
  const seen = new Set<string>();
  let total = 0;
  try {
    if (zip.entryCount > maxSteps + 2) throw new InvalidMimikRecording();
    for await (const entry of zip.eachEntry()) {
      const name = entry.fileName;
      if (
        seen.has(name) ||
        (name !== 'manifest.json' && name !== 'README.md' && !imagePath.test(name)) ||
        entry.uncompressedSize < 1 ||
        entry.uncompressedSize > maxEntryBytes
      )
        throw new InvalidMimikRecording();
      seen.add(name);
      total += entry.uncompressedSize;
      if (total > maxArchiveBytes) throw new InvalidMimikRecording();
      if (name === 'README.md') continue;
      const limit = name === 'manifest.json' ? 256 * 1024 : maxEntryBytes;
      if (entry.uncompressedSize > limit) throw new InvalidMimikRecording();
      const stream = await zip.openReadStreamPromise(entry);
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of stream as AsyncIterable<unknown>) {
        if (!Buffer.isBuffer(chunk)) throw new InvalidMimikRecording();
        size += chunk.length;
        if (size > limit) throw new InvalidMimikRecording();
        chunks.push(chunk);
      }
      files.set(name, Buffer.concat(chunks, size));
    }
    return files;
  } finally {
    zip.close();
  }
}

async function normalizeImage(image: Buffer) {
  const source = sharp(image, { limitInputPixels: 16_000_000, failOn: 'warning' });
  const meta = await source.metadata();
  if (meta.format !== 'webp' || (meta.pages ?? 1) !== 1) throw new InvalidMimikRecording();
  return source
    .resize({ width: 1440, height: 1440, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();
}

export async function parseMimikMaterial(bytes: Buffer) {
  if (!bytes.length || bytes.length > maxMimikBytes) throw new InvalidMimikRecording();
  try {
    const files = await readBundle(bytes);
    const manifestFile = files.get('manifest.json');
    if (!manifestFile) throw new InvalidMimikRecording();
    const json: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(manifestFile),
    );
    const manifest = manifestSchema.parse(json);
    const ids = new Set(manifest.steps.map(({ id: stepId }) => stepId));
    if (
      ids.size !== manifest.steps.length ||
      new Set(manifest.steps.map(({ index }) => index)).size !== manifest.steps.length
    )
      throw new InvalidMimikRecording();

    const images = new Map<string, Buffer>();
    const usedFiles = new Set<string>();
    let outputSize = 0;
    for (const { stepId, file } of manifest.screenshots) {
      const image = files.get(file);
      if (!ids.has(stepId) || !image || images.has(stepId) || usedFiles.has(file))
        throw new InvalidMimikRecording();
      const normalized = await normalizeImage(image);
      outputSize += normalized.length;
      if (outputSize > maxArchiveBytes) throw new InvalidMimikRecording();
      images.set(stepId, normalized);
      usedFiles.add(file);
    }
    if (files.size !== usedFiles.size + 1) throw new InvalidMimikRecording();

    const title = safeText(manifest.guide.title);
    const goal = safeText(manifest.guide.description ?? '');
    const steps = manifest.steps
      .sort((a, b) => a.index - b.index)
      .map(({ id: stepId, description }, index) => ({
        stepId,
        ordinal: index + 1,
        instruction: safeText(description) || '記録された操作を確認する。',
        afterImage: images.get(stepId) ?? null,
      }));
    const importDigest = createHash('sha256')
      .update(
        JSON.stringify({
          title,
          goal,
          steps: steps.map(({ instruction, afterImage }) => ({
            instruction,
            image: afterImage ? createHash('sha256').update(afterImage).digest('hex') : null,
          })),
        }),
      )
      .digest('hex');
    return { title, goal, steps, importDigest };
  } catch {
    throw new InvalidMimikRecording();
  }
}
