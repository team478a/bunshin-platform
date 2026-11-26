import { renderToStaticMarkup } from 'react-dom/server';
import type * as BunshinConfig from '@bunshin/config';
import { ApplicationError } from '@bunshin/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as BrowserLearningMaterialService from '../src/services/browser-learning-material';
import { learningMaterialPath } from '../src/services/browser-learning-material';

const mocks = vi.hoisted(() => ({
  resolveActor: vi.fn(),
  readMaterial: vi.fn(),
  readImage: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@bunshin/config', async (original) => ({
  ...(await original<typeof BunshinConfig>()),
  getServerEnvironment: () => ({ APP_URL: 'https://manaberu.example.test' }),
}));
vi.mock('../src/services/browser-learning-material', async (original) => ({
  ...(await original<typeof BrowserLearningMaterialService>()),
  browserLearningMaterialActor: mocks.resolveActor,
}));
vi.mock('@bunshin/database', () => ({
  prisma: {},
  PrismaBrowserMaterialVideos: class {
    state = () => null;
    speechAvailability = () => Promise.resolve({ enabled: false, previews: false });
  },
  PrismaBrowserLearningMaterials: class {
    readMaterial = mocks.readMaterial;
    readImage = mocks.readImage;
  },
}));

import { safeLineAuthReturnPath } from '../src/auth/line-return';
import { GET } from '../app/s/[serviceSlug]/programs/[programEnrollmentId]/learning-request/browser-material/image/route';
import MaterialPage from '../app/s/[serviceSlug]/programs/[programEnrollmentId]/learning-request/browser-material/page';

const material = '22222222-2222-4222-8222-222222222222';
const topicId = '33333333-3333-4333-8333-333333333333';
const params = {
  serviceSlug: 'manaberu',
  programEnrollmentId: '44444444-4444-4444-8444-444444444444',
};
const actor = { topicId, scope: { workspaceId: '55555555-5555-4555-8555-555555555555' } };
const image = () =>
  GET(
    new Request(
      'http://localhost/image?topicId=' +
        topicId +
        '&material=' +
        material +
        '&step=1&variant=after',
    ),
    {
      params: Promise.resolve(params),
    },
  );
const page = (print?: string) =>
  MaterialPage({
    params: Promise.resolve(params),
    searchParams: Promise.resolve(print ? { topicId, print } : { topicId }),
  });

describe('illustrated lessons in the personal learning page', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.resolveActor.mockResolvedValue(actor);
  });

  it('preserves an approved topic return path for sign-in', () => {
    const path =
      '/s/manaberu/programs/' + params.programEnrollmentId + '/learning-request/browser-material';
    expect(safeLineAuthReturnPath(path + '?topicId=' + topicId)).toBe(path + '?topicId=' + topicId);
    expect(safeLineAuthReturnPath(path + '?topicId=invalid')).toBeNull();
    expect(safeLineAuthReturnPath(path + '?topicId=' + topicId + '&topicId=' + topicId)).toBeNull();
    expect(safeLineAuthReturnPath(path + '/image')).toBeNull();
    expect(
      learningMaterialPath(params.serviceSlug, params.programEnrollmentId, topicId, 'daichi'),
    ).toBe(path + '?topicId=' + topicId + '&narrator=daichi');
  });

  it('reads private image evidence through the currently authorized enrollment and topic', async () => {
    mocks.readImage.mockResolvedValue(new Uint8Array([1, 2]));
    const response = await image();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/webp');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(mocks.resolveActor).toHaveBeenCalledWith(
      params.serviceSlug,
      params.programEnrollmentId,
      topicId,
    );
    expect(mocks.readImage).toHaveBeenCalledWith(actor, material, 1, 'after');

    mocks.readImage.mockClear();
    mocks.resolveActor.mockRejectedValue(new ApplicationError('NOT_FOUND', 'unavailable'));
    expect((await image()).status).toBe(404);
    expect(mocks.readImage).not.toHaveBeenCalled();
  });

  it('renders verified instructions, images, and a device-specific exercise', async () => {
    mocks.readImage.mockResolvedValue(new Uint8Array([1, 2]));
    mocks.readMaterial.mockResolvedValue({
      device: 'mobile',
      canGenerate: true,
      canReview: true,
      reviewStatus: 'DEAD',
      material: {
        id: material,
        revision: 2,
        title: '練習用メモ',
        goal: '表示を確かめる',
        preparation: '操作練習を開く',
        practice: '違う文を入れる',
        checkpoint: '表示された場所を確認する',
        verifiedAt: new Date('2026-11-24T10:00:00Z'),
        steps: [{ ordinal: 1, stepId: 'preview', instruction: 'プレビューを押す' }],
      },
    });
    const html = renderToStaticMarkup(await page());
    expect(html).toContain('プレビューを押す');
    expect(html).toContain('タップして');
    expect(html).toContain('教材と画面が違う');
    expect(html).toContain('前の教材を表示しています');
    expect(html).toContain('variant=after');
    expect(html).toContain(topicId);
    for (const format of ['guide', 'quick', 'compare', 'practice']) {
      expect(html).toContain(
        learningMaterialPath(params.serviceSlug, params.programEnrollmentId, topicId) +
          '&amp;print=1&amp;format=' +
          format,
      );
    }
  });

  it('prints every authorized step and links only to recorded images', async () => {
    mocks.readMaterial.mockResolvedValue({
      device: 'desktop',
      printImages: [
        { ordinal: 1, before: true, after: true, detail: false },
        { ordinal: 2, before: false, after: true, detail: true },
      ],
      material: {
        id: material,
        revision: 1,
        title: '担当窓口を探す',
        goal: '問い合わせ先を確認する',
        preparation: '案内を開く',
        practice: '別の案内も確認する',
        checkpoint: '担当名を説明する',
        steps: [
          { ordinal: 1, instruction: '一覧を開く' },
          { ordinal: 2, instruction: '担当窓口を表示' },
        ],
      },
    });

    const html = renderToStaticMarkup(await page('1'));
    expect(mocks.readMaterial).toHaveBeenCalledWith(actor, { print: true });
    expect(mocks.readImage).not.toHaveBeenCalled();
    expect(html).toContain('印刷・PDFとして保存');
    expect(html).toContain(
      'href="https://manaberu.example.test' +
        learningMaterialPath(params.serviceSlug, params.programEnrollmentId, topicId) +
        '"',
    );
    expect(html).toContain('一覧を開く');
    expect(html).toContain('担当窓口を表示');
    expect(html).toContain('別の案内も確認する');
    expect(html).toContain('step=2&amp;variant=detail');
    expect(html).not.toContain('step=1&amp;variant=detail');
    expect(html).not.toContain('step=2&amp;variant=before');

    mocks.readMaterial.mockClear();
    mocks.resolveActor.mockRejectedValue(new ApplicationError('NOT_FOUND', 'unavailable'));
    await expect(page('1')).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK;404');
    expect(mocks.readMaterial).not.toHaveBeenCalled();
  });

  it('shows preparation status while the browser job is queued', async () => {
    mocks.readMaterial.mockResolvedValue({
      device: 'mobile',
      status: 'PENDING',
      material: null,
      canGenerate: true,
    });
    const html = renderToStaticMarkup(await page());
    expect(html).toContain('教材を準備中です');
    expect(html).toContain('個別学習に戻る');
    expect(mocks.readImage).not.toHaveBeenCalled();
  });

  it('lets the learner continue when the selected device has no verified recipe', async () => {
    mocks.readMaterial.mockResolvedValue({
      device: 'mobile',
      status: null,
      material: null,
      canGenerate: false,
    });
    const html = renderToStaticMarkup(await page());
    expect(html).toContain('この端末向けの検証済みレシピは準備中です');
    expect(html).toContain('個別学習に戻る');
    expect(html).not.toContain('画像付き教材を作る');
  });
});
