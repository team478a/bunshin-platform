import { renderToStaticMarkup } from 'react-dom/server';
import { ApplicationError } from '@bunshin/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as BrowserLearningMaterialService from '../src/services/browser-learning-material';

const mocks = vi.hoisted(() => ({
  resolveActor: vi.fn(),
  readMaterial: vi.fn(),
  readImage: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('../src/services/browser-learning-material', async (original) => ({
  ...(await original<typeof BrowserLearningMaterialService>()),
  browserLearningMaterialActor: mocks.resolveActor,
}));
vi.mock('@bunshin/database', () => ({
  prisma: {},
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
const actor = { topicId };
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
const page = () =>
  MaterialPage({ params: Promise.resolve(params), searchParams: Promise.resolve({ topicId }) });

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
      material: {
        id: material,
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
    expect(html).toContain('variant=after');
    expect(html).toContain(topicId);
  });

  it('shows preparation status while the browser job is queued', async () => {
    mocks.readMaterial.mockResolvedValue({ device: 'mobile', status: 'PENDING', material: null });
    const html = renderToStaticMarkup(await page());
    expect(html).toContain('教材を準備中です');
    expect(html).toContain('個別学習に戻る');
    expect(mocks.readImage).not.toHaveBeenCalled();
  });
});
