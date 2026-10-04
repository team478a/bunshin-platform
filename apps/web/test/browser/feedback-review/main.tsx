import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { FeedbackReviewControl } from '../../../app/s/[serviceSlug]/manage/improvement-feedback/feedback-review-control';

// A deliberately synthetic protocol fixture, NOT the Repository or its safety proof.
// Only client behavior is under test. Receipts here are a model of server responses.
type Mode = 'normal' | 'lost-prepare' | 'lost-final' | 'conflict' | 'denied' | 'busy';
let mode: Mode = 'normal';
let lost = false;
let state = 'OPEN';
let calls: string[] = [];
let writes = 0;
let release: (() => void) | null = null;
let changed = () => {};
globalThis.fetch = async (input, init) => {
  if (input !== '/__synthetic_review' || init?.method !== 'POST' || typeof init.body !== 'string') {
    throw new Error('Unexpected network request blocked by synthetic fixture');
  }
  const body = init.body;
  const command = JSON.parse(body) as { action: string };
  calls.push(body);
  changed();
  if (mode === 'busy')
    await new Promise<void>((resolve) => {
      release = resolve;
    });
  if (mode === 'denied') return new Response('{}', { status: 403 });
  if (command.action === 'PREPARE') {
    if (mode === 'lost-prepare' && !lost) {
      lost = true;
      throw new TypeError('Synthetic response lost');
    }
    return Response.json({
      data: { state, handle: state === 'OPEN' ? 'synthetic-fixed-action-handle' : null },
    });
  }
  if (mode === 'conflict') return new Response('{}', { status: 409 });
  if (state === 'OPEN') {
    state = command.action === 'DISMISS' ? 'DISMISSED' : 'REVIEWED';
    writes++;
  }
  changed();
  if (mode === 'lost-final' && !lost) {
    lost = true;
    throw new TypeError('Synthetic response lost after fixture write');
  }
  return Response.json({ data: { state } });
};
function Harness() {
  const [version, setVersion] = useState(0);
  const [, refresh] = useState(0);
  changed = () => refresh((value) => value + 1);
  function reset(next: Mode) {
    mode = next;
    lost = false;
    state = 'OPEN';
    calls = [];
    writes = 0;
    release = null;
    setVersion((value) => value + 1);
  }
  return (
    <main
      style={{
        maxWidth: 390,
        margin: '16px auto',
        padding: 16,
        fontFamily: 'sans-serif',
        overflowWrap: 'anywhere',
      }}
    >
      <h1>合成データ検証</h1>
      <p>390px幅・実React操作部品。API/DB/認証はfake。本番ではありません。</p>
      <nav aria-label="検証ケース">
        {(['normal', 'lost-prepare', 'lost-final', 'conflict', 'denied', 'busy'] as const).map(
          (item) => (
            <button type="button" key={item} onClick={() => reset(item)}>
              {item}
            </button>
          ),
        )}
      </nav>
      <section aria-label="操作A" key={`a-${version}`}>
        <h2>操作A</h2>
        <FeedbackReviewControl
          endpoint="/__synthetic_review"
          selectionHandle="synthetic-selection"
        />
      </section>
      <section aria-label="操作B" key={`b-${version}`}>
        <h2>操作B（同じ候補）</h2>
        <FeedbackReviewControl
          endpoint="/__synthetic_review"
          selectionHandle="synthetic-selection"
        />
      </section>
      <button
        type="button"
        onClick={() => {
          const resume = release;
          release = null;
          resume?.();
        }}
      >
        保留応答を返す
      </button>
      <output aria-label="fixture台帳">
        {JSON.stringify(
          {
            mode,
            state,
            calls: calls.length,
            writes,
            identicalLastTwo: calls.length >= 2 && calls.at(-1) === calls.at(-2),
            commands: calls.map((body) => JSON.parse(body) as unknown),
          },
          null,
          2,
        )}
      </output>
    </main>
  );
}
const root = document.getElementById('root');
if (!root) throw new Error('Missing fixture root');
createRoot(root).render(<Harness />);
