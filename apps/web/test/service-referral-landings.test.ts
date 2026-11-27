import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../app/r/[code]/route';
import { referralLandingsSchema } from '../src/services/referral-landings';

const mocked = vi.hoisted(() => ({ findFirst: vi.fn(), createClick: vi.fn() }));
vi.mock('@bunshin/database', () => ({
  prisma: {
    $transaction: (run: (tx: object) => Promise<unknown>) =>
      run({
        serviceReferralCode: { findFirst: mocked.findFirst },
        serviceReferralClick: { create: mocked.createClick },
      }),
  },
}));

const code = '0123456789ABCDEF';
const clickId = 'click-1';
const pages = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    name: '通常LP',
    url: 'https://landing.example/oracle?utm_source=partner',
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    name: '特集LP',
    url: 'https://campaign.example/oracle',
  },
];
const openReferral = () =>
  GET(new Request(`https://service.example/r/${code}`), { params: Promise.resolve({ code }) });
function useSettings(referralLandings: unknown) {
  mocked.findFirst.mockResolvedValue({
    workspaceId: 'workspace-1',
    groupId: 'service-1',
    id: 'code-1',
    group: {
      serviceConfiguration: { slug: 'watashi-fortune', registration: { referralLandings } },
    },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocked.createClick.mockResolvedValue({ id: clickId });
});

describe('referral landing redirect', () => {
  it('records the click and forwards both identifiers to the active LP', async () => {
    useSettings({ revision: 1, activeId: pages[0]!.id, pages });
    const response = await openReferral();
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      `https://landing.example/oracle?utm_source=partner&ref=${code}&rc=${clickId}`,
    );
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(mocked.createClick).toHaveBeenCalledOnce();
    expect(mocked.createClick).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: 'workspace-1',
          groupId: 'service-1',
          referralCodeId: 'code-1',
        }),
      }),
    );
    useSettings({ revision: 2, activeId: pages[1]!.id, pages });
    expect((await openReferral()).headers.get('location')).toBe(
      `https://campaign.example/oracle?ref=${code}&rc=${clickId}`,
    );
  });

  it.each([
    {},
    { revision: 3, activeId: null, pages },
    { revision: 3, activeId: pages[0]!.id, pages: [] },
  ])('falls back to normal registration when no valid landing is selected', async (settings) => {
    useSettings(settings);
    expect((await openReferral()).headers.get('location')).toBe(
      `https://service.example/s/watashi-fortune?ref=${code}&rc=${clickId}`,
    );
  });

  it('does not record or redirect an ineligible code', async () => {
    mocked.findFirst.mockResolvedValue(null);
    expect((await openReferral()).status).toBe(404);
    expect(mocked.createClick).not.toHaveBeenCalled();
  });

  it.each([
    'http://landing.example',
    'javascript:alert(1)',
    'https://admin:secret@landing.example',
  ])('rejects invalid destination %s', (url) => {
    expect(
      referralLandingsSchema.safeParse({
        revision: 0,
        activeId: null,
        pages: [{ ...pages[0], url }],
      }).success,
    ).toBe(false);
  });
});
