import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '@bunshin/shared';
const f = vi.hoisted(() => ({
  user: vi.fn(),
  actor: vi.fn(),
  origin: vi.fn(),
  read: vi.fn(),
  start: vi.fn(),
  note: vi.fn(),
  submit: vi.fn(),
  enqueue: vi.fn(),
}));
vi.mock('../src/auth/current-user', () => ({
  currentUserProvider: () => Promise.resolve({ getCurrentUser: f.user }),
}));
vi.mock('../src/auth/request-security', () => ({ requireSameOrigin: f.origin }));
vi.mock('../src/services/personal-learning-request-access', () => ({
  resolvePersonalLearningRequestActor: f.actor,
}));
vi.mock('@bunshin/database', () => ({
  prisma: {},
  PrismaPersonalLearningPracticeRepository: class {
    readPractice = f.read;
    startPractice = f.start;
    recordPracticeNote = f.note;
  },
  PrismaTrainingAnswerRepository: class {
    submit = f.submit;
  },
}));
vi.mock('../src/services/ai-training-evaluation-queue', () => ({
  enqueueAiTrainingEvaluation: f.enqueue,
}));
import { learningPracticeResponse } from '../src/http/personal-learning-practice';
const id = '11111111-1111-4111-8111-111111111111';
const start = { action: 'START', requestId: id, requestRevision: 1, candidateId: id };
const note = {
  action: 'NOTE',
  assignmentId: id,
  operationId: id,
  expectedRevision: 0,
  text: 'ここで止まった',
};
const evidence = {
  action: 'EVIDENCE',
  assignmentId: id,
  idempotencyKey: id,
  candidateId: id,
  materialVersion: 1,
  expectedRevision: 0,
  kind: 'TEXT',
  content: '見出し案を提出します',
};
function post(value: unknown = start) {
  return new Request('http://localhost/api/practice', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(value),
  });
}
describe('dynamic practice HTTP', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    f.user.mockResolvedValue({ userId: 'user' });
    f.actor.mockResolvedValue({ actorUserId: 'user', scope: {} });
    f.origin.mockImplementation(() => {});
    f.read.mockResolvedValue({ allowed: true, current: null });
    f.start.mockResolvedValue({ assignmentId: id });
    f.note.mockResolvedValue({ assignmentId: id });
    f.submit.mockResolvedValue({ outcome: 'SUBMITTED', answer: { id }, eventId: id });
    f.enqueue.mockResolvedValue(undefined);
  });
  it('starts using saved IDs only', async () => {
    expect((await learningPracticeResponse(post(), 's', 'e')).status).toBe(200);
    expect(f.start).toHaveBeenCalledWith({
      actor: { actorUserId: 'user', scope: {} },
      requestId: id,
      requestRevision: 1,
      candidateId: id,
    });
  });
  it('records a versioned note without assessment', async () => {
    expect((await learningPracticeResponse(post(note), 's', 'e')).status).toBe(200);
    expect(f.note).toHaveBeenCalledWith(
      expect.objectContaining({ text: note.text, expectedRevision: 0, operationId: id }),
    );
    expect(f.start).not.toHaveBeenCalled();
  });
  it('stores typed evidence and enqueues the existing answer evaluation job', async () => {
    expect((await learningPracticeResponse(post(evidence), 's', 'e')).status).toBe(200);
    expect(f.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        missionAssignmentId: id,
        answer: evidence.content,
        practiceEvidence: expect.objectContaining({
          kind: 'TEXT',
          candidateId: id,
          materialVersion: 1,
          expectedRevision: 0,
        }),
        idempotencyKey: id,
      }),
    );
    expect(f.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ answerId: id, correlationId: id }),
    );
    expect(f.start).not.toHaveBeenCalled();
  });
  it('revisit is uncached and read-only', async () => {
    const response = await learningPracticeResponse(
      new Request('http://localhost/api/practice'),
      's',
      'e',
    );
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(f.read).toHaveBeenCalledOnce();
    expect(f.start).not.toHaveBeenCalled();
    expect(f.note).not.toHaveBeenCalled();
  });
  it('requires login', async () => {
    f.user.mockResolvedValue(null);
    expect((await learningPracticeResponse(post(), 's', 'e')).status).toBe(401);
    expect(f.actor).not.toHaveBeenCalled();
  });
  it('rejects origin before authorization', async () => {
    f.origin.mockImplementation(() => {
      throw new ApplicationError('FORBIDDEN', 'hidden');
    });
    expect((await learningPracticeResponse(post(), 's', 'e')).status).toBe(403);
    expect(f.actor).not.toHaveBeenCalled();
  });
  it('rejects inaccessible enrollment', async () => {
    f.actor.mockRejectedValue(new ApplicationError('NOT_FOUND', 'hidden'));
    expect((await learningPracticeResponse(post(), 's', 'e')).status).toBe(404);
    expect(f.start).not.toHaveBeenCalled();
  });
  it.each([
    { ...start, userId: 'foreign' },
    { ...start, proposal: {} },
    { ...start, requestRevision: 0 },
    { ...note, expectedRevision: -1 },
    { ...note, text: ' ' },
    { ...note, text: 'x'.repeat(501) },
    { ...note, assignmentId: 'invalid' },
    { ...evidence, kind: 'PASS' },
    { ...evidence, imageUrl: 'https://example.test/private.png' },
    { ...evidence, expectedRevision: 100 },
  ])('strict validation rejects unsafe input', async (input) => {
    expect((await learningPracticeResponse(post(input), 's', 'e')).status).toBe(400);
    expect(f.start).not.toHaveBeenCalled();
    expect(f.note).not.toHaveBeenCalled();
    expect(f.submit).not.toHaveBeenCalled();
  });
  it('conflict does not expose submitted content', async () => {
    f.note.mockRejectedValue(new ApplicationError('CONFLICT', note.text));
    const response = await learningPracticeResponse(post(note), 's', 'e');
    expect(response.status).toBe(409);
    expect(await response.text()).not.toContain(note.text);
  });
});
