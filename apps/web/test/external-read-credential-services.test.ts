import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  env: vi.fn(),
  catalog: vi.fn(),
  configuration: vi.fn(),
  verifier: vi.fn(),
  repository: vi.fn(),
}));
vi.mock('@bunshin/config', () => ({ getServerEnvironment: m.env }));
vi.mock('../src/services/external-read-client-catalog', () => ({
  externalReadClientCatalog: m.catalog,
}));
vi.mock('../src/auth/supabase', () => ({ authConfiguration: m.configuration }));
vi.mock('../src/auth/external-read-credential', () => ({
  SupabaseExternalReadCredentialVerifier: class {
    constructor(...args: unknown[]) {
      m.verifier(...args);
    }
  },
}));
vi.mock('@bunshin/database', () => ({
  prisma: {},
  PrismaExternalReadGrantRepository: class {
    constructor(...args: unknown[]) {
      m.repository(...args);
    }
  },
}));
import { createExternalReadCredentialServices } from '../src/services/external-read-credential';
beforeEach(() => {
  vi.resetAllMocks();
  m.env.mockReturnValue({ APP_ENV: 'development' });
  m.catalog.mockReturnValue([]);
  m.configuration.mockReturnValue({ url: 'https://auth.example.test', key: 'public-key' });
});
describe('disabled external credential composition', () => {
  it('does not load auth configuration or connect without a reviewed client', async () => {
    expect(await createExternalReadCredentialServices()).toBeNull();
    expect(m.configuration).not.toHaveBeenCalled();
  });
  it('keeps reviewed staging clients in the staging credential environment', async () => {
    m.env.mockReturnValue({ APP_ENV: 'staging' });
    m.catalog.mockReturnValue([{ id: 'synthetic' }]);
    expect(
      await createExternalReadCredentialServices('https://mcp.example.test/api/mcp'),
    ).not.toBeNull();
    expect(m.verifier).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: 'staging',
        clientIds: ['synthetic'],
        expectedAudience: 'https://mcp.example.test/api/mcp',
      }),
    );
    expect(m.repository.mock.calls[0]?.[1]).toBe('staging');
  });
});
