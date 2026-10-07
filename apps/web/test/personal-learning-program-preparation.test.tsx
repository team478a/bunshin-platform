import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
vi.mock('@bunshin/config', () => ({ getServerEnvironment: () => ({ APP_ENV: 'production' }) }));
import { programPreparationTarget } from '../src/services/personal-learning-program-preparation';
import { ProgramPreparationCard } from '../app/s/[serviceSlug]/manage/programs/personal-learning-preparation/card';
import {
  createPreparationCommand,
  preparationSnapshot,
  submitPreparation,
} from '../app/s/[serviceSlug]/manage/programs/personal-learning-preparation/client';
const id = '11111111-1111-4111-8111-111111111111';
const group = '22222222-2222-4222-8222-222222222222';
const program = '33333333-3333-4333-8333-333333333333';
const absent = { exists: false, status: 'ABSENT', enabled: false, stateToken: 'a'.repeat(64) };
describe('stopped dedicated Program preparation UI', () => {
  beforeEach(() => {
    vi.stubEnv('PERSONAL_LEARNING_PILOT_OPERATIONS', 'true');
    vi.stubEnv(
      'PERSONAL_LEARNING_PRODUCTION_PREPARATION',
      JSON.stringify({ workspaceId: id, groupId: group, serviceProgramId: program }),
    );
    vi.stubEnv('PERSONAL_LEARNING_PILOT', 'false');
    vi.stubEnv('PERSONAL_LEARNING_PRODUCTION_CLOSED_PILOT', 'false');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  it('binds display to server authority and refuses foreign Service', () => {
    expect(programPreparationTarget({ workspaceId: id, serviceId: group })).toBe(program);
    expect(programPreparationTarget({ workspaceId: group, serviceId: group })).toBeNull();
    expect(programPreparationTarget({ workspaceId: id, serviceId: id })).toBeNull();
  });
  it.each(['PERSONAL_LEARNING_PILOT', 'PERSONAL_LEARNING_PRODUCTION_CLOSED_PILOT'])(
    'closes with %s enabled',
    (flag) => {
      vi.stubEnv(flag, 'true');
      expect(programPreparationTarget({ workspaceId: id, serviceId: group })).toBeNull();
    },
  );
  it('refuses absent, malformed or extra authority and disabled operation flag', () => {
    for (const value of [
      '',
      '{',
      JSON.stringify({ workspaceId: id, groupId: group, serviceProgramId: program, extra: true }),
    ]) {
      vi.stubEnv('PERSONAL_LEARNING_PRODUCTION_PREPARATION', value);
      expect(programPreparationTarget({ workspaceId: id, serviceId: group })).toBeNull();
    }
    vi.stubEnv('PERSONAL_LEARNING_PILOT_OPERATIONS', 'false');
    expect(programPreparationTarget({ workspaceId: id, serviceId: group })).toBeNull();
  });
  it('renders without automatic mutation, confirmation or create control before read', () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const html = renderToStaticMarkup(
      <ProgramPreparationCard serviceSlug="test" programId={program} />,
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(html).toContain('現在の状態を確認');
    expect(html).not.toContain('停止状態で作成</button>');
    expect(html).not.toContain('checked=""');
    expect(html).toContain('Pilotと通知はOFF');
  });
  it('requires ABSENT, human confirmation and bounded evidence; no authority or settings in command', () => {
    expect(createPreparationCommand(absent, 'review', false)).toBeNull();
    expect(createPreparationCommand({ ...absent, exists: true }, 'review', true)).toBeNull();
    expect(createPreparationCommand({ ...absent, enabled: true }, 'review', true)).toBeNull();
    expect(createPreparationCommand(absent, 'secret text', true)).toBeNull();
    expect(createPreparationCommand(absent, 'review-1171', true)?.action).toBe('CREATE_PROGRAM');
    expect(preparationSnapshot({ ...absent, stateToken: 'invalid' })).toBeNull();
  });
  it('replays exactly the same command after lost response and validates stopped receipt', async () => {
    const command = createPreparationCommand(absent, 'review', true)!;
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('lost'))
      .mockResolvedValueOnce(
        Response.json({
          data: { ...absent, exists: true, status: 'SUSPENDED', programOfferingId: id },
        }),
      );
    vi.stubGlobal('fetch', fetcher);
    expect(await submitPreparation('/endpoint', command)).toBe('RETRY');
    expect(await submitPreparation('/endpoint', command)).toBe('SAVED');
    expect(fetcher.mock.calls[0]).toEqual(fetcher.mock.calls[1]);
  });
  it.each([401, 403, 404, 409, 413])(
    'rejects %s without exposing server messages',
    async (status) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('secret', { status })));
      expect(
        await submitPreparation('/endpoint', createPreparationCommand(absent, 'review', true)!),
      ).toBe('REJECTED');
    },
  );
  it('does not accept active/enabled/malformed receipts or send other operations', async () => {
    const command = createPreparationCommand(absent, 'review', true)!;
    for (const data of [
      {},
      { ...absent, exists: true, status: 'ACTIVE', programOfferingId: id },
      { ...absent, exists: true, status: 'SUSPENDED', enabled: true, programOfferingId: id },
    ]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ data })));
      expect(await submitPreparation('/endpoint', command)).toBe('RETRY');
    }
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    expect(await submitPreparation('/endpoint', { ...command, action: 'START' })).toBe('REJECTED');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
