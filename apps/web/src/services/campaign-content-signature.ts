import { createHash } from 'node:crypto';

const normalize = (value: unknown) =>
  JSON.stringify(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[\s\p{P}\p{S}]+/gu, '');

export function campaignContentSignature(value: unknown) {
  const content = normalize(value);
  const fingerprint = createHash('sha256').update(content).digest('hex');
  const features = new Set<string>();
  for (let index = 0; index < Math.max(1, content.length - 2); index += 1)
    features.add(content.slice(index, index + 3));
  const weights = new Array<number>(64).fill(0);
  for (const feature of features) {
    const digest = createHash('sha256').update(feature).digest();
    for (let bit = 0; bit < 64; bit += 1) {
      const enabled = (digest[Math.floor(bit / 8)]! & (1 << (7 - (bit % 8)))) !== 0;
      weights[bit] = weights[bit]! + (enabled ? 1 : -1);
    }
  }
  let signature = 0n;
  for (const weight of weights) signature = (signature << 1n) | (weight >= 0 ? 1n : 0n);
  return { contentFingerprint: fingerprint, simhash: signature.toString(16).padStart(16, '0') };
}
