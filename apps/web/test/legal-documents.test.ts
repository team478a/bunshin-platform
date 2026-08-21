import { beforeEach, describe, expect, it, vi } from 'vitest';

const now = new Date('2026-08-21T00:00:00Z');
const document = {
  id: '11111111-1111-4111-8111-111111111111',
  type: 'TERMS',
  version: 1,
  title: '利用規約',
  content: '本文',
  status: 'DRAFT',
  effectiveAt: null,
  publishedAt: null,
  createdAt: now,
  updatedAt: now,
};
interface TestState {
  user: { userId: string } | null;
  allowed: boolean;
  createDraft: ReturnType<typeof vi.fn>;
  publish: ReturnType<typeof vi.fn>;
}
const state = vi.hoisted<TestState>(() => ({
  user: { userId: 'admin-1' },
  allowed: true,
  createDraft: vi.fn(),
  publish: vi.fn(),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: () => Promise.resolve(state.user) }),
}));
vi.mock('@bunshin/database', () => ({
  PrismaLegalDocumentRepository: class {
    listForAdmin() {
      return Promise.resolve(state.allowed ? [document] : null);
    }
    createDraft = state.createDraft;
    publish = state.publish;
  },
}));

import {
  createLegalDocumentResponse,
  listLegalDocumentsResponse,
  publishLegalDocumentResponse,
} from '../src/http/legal-documents';
const request = (path: string, body?: unknown) =>
  new Request(
    `http://localhost${path}`,
    body === undefined
      ? undefined
      : {
          method: 'POST',
          headers: { origin: 'http://localhost', 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
  );

describe('legal document admin HTTP', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv('APP_URL', 'http://localhost');
    vi.stubEnv('DATABASE_URL', 'postgresql://local');
    vi.stubEnv('DIRECT_URL', 'postgresql://local');
    vi.stubEnv('SESSION_SECRET', '12345678901234567890123456789012');
    vi.stubEnv('LOG_LEVEL', 'info');
    state.user = { userId: 'admin-1' };
    state.allowed = true;
    state.createDraft.mockResolvedValue(document);
    state.publish.mockResolvedValue({
      ...document,
      status: 'PUBLISHED',
      effectiveAt: now,
      publishedAt: now,
    });
  });
  it('requires authentication and hides unauthorized admins', async () => {
    state.user = null;
    expect((await listLegalDocumentsResponse(request('/api/admin/legal-documents'))).status).toBe(
      401,
    );
    state.user = { userId: 'member-1' };
    state.allowed = false;
    expect((await listLegalDocumentsResponse(request('/api/admin/legal-documents'))).status).toBe(
      404,
    );
  });
  it('creates and publishes documents with no-store responses', async () => {
    let response = await createLegalDocumentResponse(
      request('/api/admin/legal-documents', { type: 'TERMS', title: '利用規約', content: '本文' }),
    );
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    response = await publishLegalDocumentResponse(
      request('/publish', { effectiveAt: now.toISOString() }),
      document.id,
    );
    expect(response.status).toBe(200);
    expect(state.publish).toHaveBeenCalled();
  });
});
