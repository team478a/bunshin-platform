import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { PersonalLearningProfilePreparationCard } from '../app/s/[serviceSlug]/programs/[programEnrollmentId]/personal-learning-profile-preparation-card';
import {
  profilePreparationCommand,
  submitProfilePreparation,
} from '../app/s/[serviceSlug]/programs/[programEnrollmentId]/personal-learning-profile-preparation-client';

const draft = { role: 'OTHER', aiLevel: 'BEGINNER', dailyMinutes: '5' };
describe('learner Profile preparation UI', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('starts unanswered and cannot save without every explicit answer and confirmation', () => {
    expect(profilePreparationCommand(draft, false)).toBeNull();
    for (const key of ['role', 'aiLevel', 'dailyMinutes'])
      expect(profilePreparationCommand({ ...draft, [key]: '' }, true)).toBeNull();
    expect(profilePreparationCommand({ ...draft, aiLevel: 'UNKNOWN' }, true)).toBeNull();
    const html = renderToStaticMarkup(
      <PersonalLearningProfilePreparationCard
        serviceSlug="test"
        enrollmentId="test"
        initialProfile={null}
      />,
    );
    expect(html.match(/value="" selected/g)).toHaveLength(3);
    expect(html).toContain('type="submit" disabled');
    expect(html).not.toContain('checked=""');
    expect(html).toContain('学習はまだ始まりません');
    expect(html).toContain('未回答を初心者とは扱いません');
  });
  it('renders saved state without an editable form or automatic start', () => {
    const html = renderToStaticMarkup(
      <PersonalLearningProfilePreparationCard
        serviceSlug="test"
        enrollmentId="test"
        initialProfile={{ role: 'OTHER', aiLevel: 'INTERMEDIATE', dailyMinutes: 10 }}
      />,
    );
    expect(html).toContain('保存済み');
    expect(html).toContain('開始の案内をお待ちください');
    expect(html).not.toContain('<form');
  });
  it('lost response replay preserves the operation and complete body; matching receipt confirms save', async () => {
    const command = profilePreparationCommand(draft, true)!;
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('lost response after commit'))
      .mockResolvedValueOnce(
        Response.json({
          data: {
            outcome: 'ALREADY_INITIALIZED',
            profile: {
              role: command.role,
              aiLevel: command.aiLevel,
              dailyMinutes: command.dailyMinutes,
            },
          },
        }),
      );
    vi.stubGlobal('fetch', fetcher);
    expect(await submitProfilePreparation('/profile', command)).toBe('RETRY');
    expect(await submitProfilePreparation('/profile', command)).toBe('SAVED');
    expect(fetcher.mock.calls[0]).toEqual(fetcher.mock.calls[1]);
    const sentBody: unknown = fetcher.mock.calls[0]?.[1].body;
    if (typeof sentBody !== 'string') throw new Error('expected string request body');
    expect(JSON.parse(sentBody)).toEqual(command);
    expect(fetcher.mock.calls[0]?.[1].credentials).toBe('same-origin');
  });
  it.each([401, 403, 404, 409, 400, 413, 500])(
    'maps %s without showing server details',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response('private server error', { status })),
      );
      const result = await submitProfilePreparation(
        '/profile',
        profilePreparationCommand(draft, true)!,
      );
      expect(result).toBe(
        [401, 403, 404].includes(status) ? 'CLOSED' : status === 500 ? 'RETRY' : 'CONFLICT',
      );
    },
  );
  it('does not accept a partial or mismatched success receipt', async () => {
    const command = profilePreparationCommand(draft, true)!;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(Response.json({ data: { outcome: 'INITIALIZED' } })),
    );
    expect(await submitProfilePreparation('/profile', command)).toBe('RETRY');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          data: {
            outcome: 'INITIALIZED',
            profile: { role: 'SALES', aiLevel: 'BEGINNER', dailyMinutes: 5 },
          },
        }),
      ),
    );
    expect(await submitProfilePreparation('/profile', command)).toBe('CONFLICT');
  });
  it('limits the page entry to reserved Pilot before legacy runtime', () => {
    const page = readFileSync(
      new URL('../app/s/[serviceSlug]/programs/[programEnrollmentId]/page.tsx', import.meta.url),
      'utf8',
    );
    expect(page.indexOf('isPersonalLearningPilotProgram(program.settings)')).toBeLessThan(
      page.indexOf('readPersonalLearningProfilePreparation('),
    );
    expect(page.indexOf('readPersonalLearningProfilePreparation(')).toBeLessThan(
      page.indexOf('new AiTrainingParticipantService'),
    );
    const card = readFileSync(
      new URL(
        '../app/s/[serviceSlug]/programs/[programEnrollmentId]/personal-learning-profile-preparation-card.tsx',
        import.meta.url,
      ),
      'utf8',
    );
    expect(card).toContain('pending.current ??=');
    expect(card).toContain('inFlight.current');
    expect(card).not.toMatch(
      /localStorage|sessionStorage|console\.|\/answers|\/evaluate|\/consultation/,
    );
  });
});
