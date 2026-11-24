import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({
  env: vi.fn(),
  user: vi.fn(),
  membership: vi.fn(),
  image: vi.fn(),
  search: vi.fn(),
  material: vi.fn(),
}));
vi.mock('@bunshin/config', () => ({ getServerEnvironment: mocks.env }));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: mocks.user }),
}));
vi.mock('@bunshin/database', () => ({
  prisma: {
    workspaceMembership: { findFirst: mocks.membership },
    browserFixtureMaterial: { findMany: mocks.search, findFirst: mocks.material },
    browserFixtureMaterialStep: { findFirst: mocks.image },
  },
}));

import BrowserMaterialsPage from '../app/(app)/organizations/[workspaceId]/browser-materials/page';
import { GET } from '../app/api/browser-materials/[workspaceId]/[materialId]/[step]/[variant]/route';
import { browserMaterialActor, searchBrowserMaterials } from '../src/services/browser-materials';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const materialId = '22222222-2222-4222-8222-222222222222';
const actorId = '33333333-3333-4333-8333-333333333333';
const imageRequest = () =>
  GET(new Request('http://localhost'), {
    params: Promise.resolve({ workspaceId, materialId, step: '1', variant: 'before' }),
  });

describe('browser material access', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.env.mockReturnValue({ APP_ENV: 'development' });
    mocks.user.mockResolvedValue({ userId: actorId });
    mocks.membership.mockResolvedValue({ id: 'fixture-membership' });
  });
  afterEach(() => vi.clearAllMocks());

  it('requires both the workspace and recipe owner for image and search reads', async () => {
    mocks.image.mockResolvedValue({ beforeImage: new Uint8Array([1, 2]) });
    const image = await imageRequest();
    expect(image.status).toBe(200);
    expect(image.headers.get('cache-control')).toBe('private, no-store');
    const scope: unknown = expect.arrayContaining([
      { recipe: expect.objectContaining({ workspaceId, actorId }) },
      expect.objectContaining({ workspaceId, importedBy: actorId }),
    ]);
    expect(mocks.image).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ material: { OR: scope } }) }),
    );
    const actor = await browserMaterialActor(workspaceId);
    await searchBrowserMaterials(actor!, 'メモ');
    expect(mocks.search).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: scope,
          title: { contains: 'メモ', mode: 'insensitive' },
        }),
      }),
    );
  });

  it('renders the selected step and the learner exercise on the last page', async () => {
    mocks.material.mockResolvedValue({
      id: materialId,
      title: 'メモの練習',
      goal: '表示を確かめる',
      preparation: '練習画面を開く',
      practice: '別の名前を入力する',
      checkpoint: '表示はどこで確認しましたか',
      verifiedAt: new Date('2026-11-24T10:00:00Z'),
      recipe: { device: 'mobile' },
      steps: [
        { ordinal: 1, stepId: 'open', instruction: '最初の操作を行う' },
        { ordinal: 2, stepId: 'preview', instruction: 'プレビューを押す' },
      ],
    });
    mocks.image.mockResolvedValue({ ordinal: 2 });
    const view = await BrowserMaterialsPage({
      params: Promise.resolve({ workspaceId }),
      searchParams: Promise.resolve({ material: materialId, step: '2' }),
    });
    const html = renderToStaticMarkup(view);
    expect(html).toContain('プレビューを押す');
    expect(html).toContain('実践課題');
    expect(html).toContain('操作箇所を拡大');
    expect(html).toContain('/2/after');
    expect(html).not.toContain('最初の操作を行う');
  });

  it('labels an imported recording and displays a single captured screenshot', async () => {
    mocks.material.mockResolvedValue({
      id: materialId,
      title: '操作記録',
      goal: '',
      preparation: '準備',
      practice: '練習',
      checkpoint: '確認',
      verifiedAt: null,
      importedAt: new Date('2026-11-25T10:00:00Z'),
      fixtureDevice: 'mobile',
      steps: [{ ordinal: 1, stepId: 'one', instruction: 'ボタンを選ぶ' }],
    });
    mocks.image.mockResolvedValue({ ordinal: 1 });
    const view = await BrowserMaterialsPage({
      params: Promise.resolve({ workspaceId }),
      searchParams: Promise.resolve({ material: materialId }),
    });
    const html = renderToStaticMarkup(view);
    expect(html).toContain('人の操作記録・未検証');
    expect(html).toContain('記録画面');
    expect(html).toContain('/1/after');
    expect(html).not.toContain('/1/before');
  });

  it('returns no image for an unavailable material or an untrusted session', async () => {
    mocks.image.mockResolvedValue(null);
    expect((await imageRequest()).status).toBe(404);
    mocks.image.mockClear();
    mocks.membership.mockResolvedValue(null);
    expect((await imageRequest()).status).toBe(404);
    mocks.env.mockReturnValue({ APP_ENV: 'production' });
    expect((await imageRequest()).status).toBe(404);
    expect(mocks.image).not.toHaveBeenCalled();
  });
});
