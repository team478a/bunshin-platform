import { describe, expect, it } from 'vitest';
import type { CapabilityDefinition } from '../src';

describe('capability contract', () => {
  it('describes a capability without implementing it', () => {
    const definition: CapabilityDefinition = { type: 'SOCIAL', version: '1' };
    expect(definition).toEqual({ type: 'SOCIAL', version: '1' });
  });
});
