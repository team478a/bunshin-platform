import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  AI_TRAINING_LEARNING_DEFINITION_FIXTURES,
  getAiTrainingMissionQuality,
  AI_TRAINING_LEARNING_ROUTER_VERSION,
} from '@bunshin/capability-training';
import { DefinitionReviewCard } from '../app/s/[serviceSlug]/manage/programs/learning-definition-review/card';
import {
  approvalCommand,
  loadDefinitionReviews,
  parseDefinitionReviews,
  reviewKeys,
  reviewReady,
  submitDefinitionApproval,
} from '../app/s/[serviceSlug]/manage/programs/learning-definition-review/client';

const data = () =>
  AI_TRAINING_LEARNING_DEFINITION_FIXTURES.map((definition) => ({
    definition,
    mission: getAiTrainingMissionQuality(definition.legacyMissionRef.actionKey),
    revision: 'a'.repeat(64),
    reviewDigest: 'b'.repeat(64),
    current: null,
    routerRuleVersion: AI_TRAINING_LEARNING_ROUTER_VERSION,
  }));
const allChecks = Object.fromEntries(reviewKeys.map((k) => [k, true]));
const sha = 'c'.repeat(40);
const item = () => parseDefinitionReviews(data())![0]!;
const command = () => approvalCommand(item(), allChecks, sha, 'human-review', true)!;
afterEach(() => vi.unstubAllGlobals());
describe('Definition approval minimal UI and client', () => {
  it('mount does not read/write; no preselected review or automatic/bulk operation', () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const html = renderToStaticMarkup(<DefinitionReviewCard serviceSlug="synthetic" />);
    expect(fetcher).not.toHaveBeenCalled();
    expect(html).toContain('現在の定義と承認状態を確認');
    expect(html).not.toContain('checked=""');
    expect(html).not.toContain('<select');
    expect(html).not.toContain('この1件の承認を登録</button>');
  });
  it('reads only three exact references and strips admin identity', () => {
    const input = data().map((i) => ({
      ...i,
      current: {
        approvalStatus: 'APPROVED',
        approvedAt: '2026-10-10T00:00:00.000Z',
        approvedByUserId: 'private-user',
      },
    }));
    expect(parseDefinitionReviews(input)).toHaveLength(3);
    expect(JSON.stringify(parseDefinitionReviews(input))).not.toContain('private-user');
  });
  it('rejects missing, duplicate, foreign version/package, mismatched Mission/Rubric and invalid receipt', () => {
    const list = data();
    for (const value of [
      [],
      list.slice(0, 2),
      [list[0], list[0], list[2]],
      list.map((i) => ({ ...i, reviewDigest: 'bad' })),
      list.map((i) => ({
        ...i,
        definition: {
          ...i.definition,
          reference: { ...i.definition.reference, packageKey: 'SOCIAL' },
        },
      })),
      list.map((i) => ({
        ...i,
        definition: { ...i.definition, reference: { ...i.definition.reference, version: 'new' } },
      })),
      list.map((i) => ({ ...i, mission: { ...i.mission, key: 'PROMPT_CONDITION' } })),
      list.map((i) => ({
        ...i,
        definition: {
          ...i.definition,
          evaluationRubricRef: {
            ...i.definition.evaluationRubricRef,
            rubricKey: 'PROMPT_CONDITION',
          },
        },
      })),
    ])
      expect(parseDefinitionReviews(value)).toBeNull();
  });
  it('requires seven separate human checks, explicit confirmation, SHA and bounded evidence', () => {
    for (const k of reviewKeys) {
      expect(approvalCommand(item(), { ...allChecks, [k]: false }, sha, 'review', true)).toBeNull();
      expect(reviewReady(item(), { ...allChecks, [k]: false }, sha, 'review', true)).toBe(false);
    }
    expect(approvalCommand(item(), allChecks, sha, 'review', false)).toBeNull();
    expect(approvalCommand(item(), allChecks, 'abc', 'review', true)).toBeNull();
    expect(approvalCommand(item(), allChecks, sha, 'secret text', true)).toBeNull();
    expect(
      approvalCommand(item(), { ...allChecks, extra: true } as never, sha, 'review', true),
    ).toBeNull();
    expect(reviewReady(item(), allChecks, sha, 'review', true)).toBe(true);
  });
  it('commands reference only the selected review, no tenant/actor input, and cannot reapprove APPROVED', () => {
    const c = command();
    expect(Object.keys(c)).toHaveLength(10);
    expect(c).toMatchObject({
      definitionKey: 'PROMPT_STRUCTURE',
      expectedRevision: item().revision,
      reviewDigest: item().reviewDigest,
    });
    expect(
      approvalCommand(
        { ...item(), current: { approvalStatus: 'APPROVED', approvedAt: null } },
        allChecks,
        sha,
        'review',
        true,
      ),
    ).toBeNull();
    expect(c).not.toHaveProperty('workspaceId');
    expect(c).not.toHaveProperty('userId');
  });
  it('load uses same-origin GET and no cache', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ data: data() }));
    vi.stubGlobal('fetch', fetcher);
    expect(await loadDefinitionReviews('synthetic')).toHaveLength(3);
    expect(fetcher).toHaveBeenCalledWith(
      '/api/services/synthetic/ai-training/definition-approvals',
      { credentials: 'same-origin', cache: 'no-store' },
    );
  });
  it('lost response reuses exactly the same command and accepts replay receipt, not current state', async () => {
    const c = command();
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error('lost'))
      .mockResolvedValueOnce(
        Response.json({
          data: {
            replayed: true,
            operationId: c.operationId,
            stateAtOperation: {
              approvalStatus: 'APPROVED',
              approvedAt: '2026-10-10T00:00:00.000Z',
              approvedByUserId: '11111111-1111-4111-8111-111111111111',
            },
          },
        }),
      );
    vi.stubGlobal('fetch', fetcher);
    expect(await submitDefinitionApproval('synthetic', c)).toBe('RETRY');
    expect(await submitDefinitionApproval('synthetic', c)).toBe('RECEIVED');
    expect(fetcher.mock.calls[0]).toEqual(fetcher.mock.calls[1]);
    expect(fetcher.mock.calls[0]![1]).toMatchObject({
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
    });
  });
  it.each([400, 401, 403, 404, 409, 413])(
    'HTTP %s requires fresh review, no raw error display',
    async (status) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('private detail', { status })));
      expect(await submitDefinitionApproval('synthetic', command())).toBe('REJECTED');
    },
  );
  it('malformed success and 5xx remain uncertain; non-APPROVE/extra fields rejected before fetch', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ data: { replayed: false } }));
    vi.stubGlobal('fetch', fetcher);
    expect(await submitDefinitionApproval('synthetic', command())).toBe('RETRY');
    fetcher.mockResolvedValue(new Response('', { status: 503 }));
    expect(await submitDefinitionApproval('synthetic', command())).toBe('RETRY');
    fetcher.mockClear();
    for (const c of [
      { ...command(), action: 'START' },
      { ...command(), workspaceId: 'foreign' },
      { ...command(), action: 'DEPRECATE' },
    ]) {
      expect(await submitDefinitionApproval('synthetic', c as never)).toBe('REJECTED');
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
});
