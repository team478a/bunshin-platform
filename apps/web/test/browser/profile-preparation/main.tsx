import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { PersonalLearningProfilePreparationCard } from '../../../app/s/[serviceSlug]/programs/[programEnrollmentId]/personal-learning-profile-preparation-card';
import '../../../app/styles.css';

// Synthetic UI protocol fixture only. No session, DB or Provider. All fetches are intercepted.
let mode = 'normal';
let lost = false;
let bodies: string[] = [];
let changed = () => {};
globalThis.fetch = (input, init) => {
  if (
    input !==
      '/api/services/synthetic/ai-training/enrollments/synthetic/personal-learning/profile' ||
    init?.method !== 'POST' ||
    typeof init.body !== 'string'
  )
    return Promise.reject(new Error('Unexpected network blocked'));
  bodies.push(init.body);
  changed();
  if (mode === 'denied') return Promise.resolve(new Response(null, { status: 404 }));
  if (mode === 'conflict') return Promise.resolve(new Response(null, { status: 409 }));
  if (mode === 'lost' && !lost) {
    lost = true;
    return Promise.reject(new Error('Synthetic response loss after save'));
  }
  const c = JSON.parse(init.body) as { role: string; aiLevel: string; dailyMinutes: number };
  return Promise.resolve(
    Response.json({
      data: {
        outcome: lost ? 'ALREADY_INITIALIZED' : 'INITIALIZED',
        profile: { role: c.role, aiLevel: c.aiLevel, dailyMinutes: c.dailyMinutes },
      },
    }),
  );
};
function Harness() {
  const [revision, setRevision] = useState(0);
  const [, update] = useState(0);
  changed = () => update((v) => v + 1);
  return (
    <main className="service-entry training-page" style={{ maxWidth: 390, margin: 'auto' }}>
      <h1>合成UI検証 本番ではありません</h1>
      <label>
        テストモード
        <select
          value={mode}
          onChange={(event) => {
            mode = event.target.value;
            lost = false;
            bodies = [];
            setRevision((v) => v + 1);
          }}
        >
          <option value="normal">正常</option>
          <option value="lost">応答喪失</option>
          <option value="denied">権限失効</option>
          <option value="conflict">競合</option>
          <option value="saved">既存保存済み</option>
        </select>
      </label>
      <PersonalLearningProfilePreparationCard
        key={revision}
        serviceSlug="synthetic"
        enrollmentId="synthetic"
        initialProfile={
          mode === 'saved' ? { role: 'OTHER', aiLevel: 'INTERMEDIATE', dailyMinutes: 10 } : null
        }
      />
      <p>
        送信数: {bodies.length} / 再送一致:{' '}
        {bodies.length > 1 ? String(bodies[0] === bodies[1]) : '未再送'}
      </p>
    </main>
  );
}
const root = document.getElementById('root');
if (!root) throw new Error('fixture root missing');
createRoot(root).render(<Harness />);
