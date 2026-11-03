import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ env: vi.fn(), catalog: vi.fn(), configuration: vi.fn() }));
vi.mock('@bunshin/config', () => ({ getServerEnvironment: m.env }));
vi.mock('../src/services/external-read-client-catalog', () => ({
  externalReadClientCatalog: m.catalog,
}));
vi.mock('../src/auth/supabase', () => ({ authConfiguration: m.configuration }));
import { createExternalReadCredentialServices } from '../src/services/external-read-credential';
beforeEach(() => {
  vi.resetAllMocks();
  m.env.mockReturnValue({ APP_ENV: 'development' });
  m.catalog.mockReturnValue([]);
});
describe('disabled external credential composition', () => {
  it('does not load auth configuration or connect without a reviewed client', async () => {
    expect(await createExternalReadCredentialServices()).toBeNull();
    expect(m.configuration).not.toHaveBeenCalled();
  });
  it('never maps staging into a different credential environment', async () => {
    m.env.mockReturnValue({ APP_ENV: 'staging' });
    m.catalog.mockReturnValue([{ id: 'synthetic' }]);
    expect(await createExternalReadCredentialServices()).toBeNull();
    expect(m.configuration).not.toHaveBeenCalled();
  });
});
