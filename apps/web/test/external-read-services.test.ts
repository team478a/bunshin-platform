import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BindExternalReadCredential,
  ReadAuthenticatedExternalMemberUsage,
} from '@bunshin/application';
const m = vi.hoisted(() => ({ credentials: vi.fn(), usage: vi.fn() }));
vi.mock('../src/services/external-read-credential', () => ({
  createExternalReadCredentialServices: m.credentials,
}));
vi.mock('@bunshin/database', () => ({
  prisma: {},
  PrismaMemberUsageRepository: class {
    constructor() {
      m.usage();
    }
  },
}));
import { createExternalReadServices } from '../src/services/external-read';
beforeEach(() => vi.resetAllMocks());
describe('minimal external read composition', () => {
  it('does not construct a usage repository when credentials are disabled', async () => {
    m.credentials.mockResolvedValue(null);
    expect(await createExternalReadServices()).toBeNull();
    expect(m.usage).not.toHaveBeenCalled();
  });
  it('reuses the existing usage repository and credential use cases without new storage', async () => {
    m.credentials.mockResolvedValue({ verifier: {}, bindings: {} });
    const services = await createExternalReadServices();
    expect(services?.binding).toBeInstanceOf(BindExternalReadCredential);
    expect(services?.usage).toBeInstanceOf(ReadAuthenticatedExternalMemberUsage);
    expect(m.usage).toHaveBeenCalledOnce();
  });
});
