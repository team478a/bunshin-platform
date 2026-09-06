import { describe, expect, it } from 'vitest';
import { createClientRequestId } from '../app/ui/client-request-id';

const passThroughRandomValues = <T extends ArrayBufferView | null>(array: T): T => array;
const fillRandomValues = <T extends ArrayBufferView | null>(array: T): T => {
  if (array instanceof Uint8Array) array.fill(17);
  return array;
};

describe('createClientRequestId', () => {
  it('uses randomUUID when the browser provides it', () => {
    const value = createClientRequestId({
      randomUUID: () => '123e4567-e89b-42d3-a456-426614174000',
      getRandomValues: passThroughRandomValues,
    });
    expect(value).toBe('123e4567-e89b-42d3-a456-426614174000');
  });

  it('creates a valid v4 UUID in older embedded browsers', () => {
    const value = createClientRequestId({
      getRandomValues: fillRandomValues,
    });
    expect(value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  });
});
