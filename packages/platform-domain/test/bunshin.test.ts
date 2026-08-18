import { describe, expect, it } from 'vitest';
import { canManageBunshin, isValidBunshinSlug, normalizeBunshinSlug } from '../src';

describe('Bunshin identity rules', () => {
  it('normalizes and validates a workspace-local slug', () => {
    expect(normalizeBunshinSlug(' Expert-One ')).toBe('expert-one');
    expect(isValidBunshinSlug('expert-one')).toBe(true);
    expect(isValidBunshinSlug('Expert_One')).toBe(false);
  });

  it('allows OWNER and ADMIN to manage any Bunshin', () => {
    expect(canManageBunshin('OWNER', 'actor', 'owner')).toBe(true);
    expect(canManageBunshin('ADMIN', 'actor', 'owner')).toBe(true);
  });

  it('allows a MEMBER to manage only their own Bunshin', () => {
    expect(canManageBunshin('MEMBER', 'owner', 'owner')).toBe(true);
    expect(canManageBunshin('MEMBER', 'actor', 'owner')).toBe(false);
  });
});
