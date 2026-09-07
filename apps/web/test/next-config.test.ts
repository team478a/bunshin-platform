import { describe, expect, it } from 'vitest';
import config from '../next.config';

describe('Next.js server dependency packaging', () => {
  it('keeps Satori and HarfBuzz external so hb.wasm resolves at runtime', () => {
    expect(config.serverExternalPackages).toEqual(expect.arrayContaining(['harfbuzzjs', 'satori']));
  });
});
