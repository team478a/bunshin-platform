import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const projectModule = readFileSync(
  new URL('../src/video-project-delivery.ts', import.meta.url),
  'utf8',
);
const deliveryModule = readFileSync(new URL('../src/video-deliveries.ts', import.meta.url), 'utf8');
const publicModule = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

describe('video delivery module boundary', () => {
  it('keeps delivery persistence separate from project planning persistence', () => {
    expect(deliveryModule).toContain('export class PrismaVideoDeliveryRepository');
    expect(projectModule).not.toContain('class PrismaVideoDeliveryRepository');
  });

  it('preserves the legacy module export while exposing the direct public module', () => {
    expect(projectModule).toContain(
      "export { PrismaVideoDeliveryRepository } from './video-deliveries';",
    );
    expect(publicModule).toContain(
      "export { PrismaVideoDeliveryRepository } from './video-deliveries';",
    );
  });
});
