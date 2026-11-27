import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { InstructorReviewForm } from '../../../apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/learning-request/instructor-review/instructor-review-form';
import design from '../../../apps/web/src/components/manaberu-learner.module.css';
import '../../../apps/web/app/styles.css';

function Harness() {
  const [draft, setDraft] = useState('週報の最初の下書き');
  const [reviewing, setReviewing] = useState(false);
  const [requested, setRequested] = useState<string | null>(null);
  return (
    <main className={`${design.frame} ${design.flow}`}>
      <section className={design.panel}>
        <h1>営業週報を書く</h1>
        {reviewing ? (
          <>
            <InstructorReviewForm
              action={(form) => {
                const excerpt = form.get('excerpt');
                if (typeof excerpt === 'string') setRequested(excerpt);
              }}
              offer={{
                priceYen: 1500,
                description: '今の課題を講師が文章でレビューします',
                responseHours: 48,
                cancellationTerms: '受付後の取り消しは運営へご相談ください',
              }}
              assignmentId="10000000-0000-4000-8000-000000000001"
              productRevision="10000000-0000-4000-8000-000000000002"
              idempotencyKey="10000000-0000-4000-8000-000000000003"
              topicId={null}
              initialExcerpt={draft}
            />
            <button type="button" onClick={() => setReviewing(false)}>
              課題に戻る
            </button>
            {requested && <p role="status">受理した共有文 {requested}</p>}
          </>
        ) : (
          <>
            <label className="field">
              下書き
              <textarea value={draft} onChange={(event) => setDraft(event.target.value)} />
            </label>
            <button type="button" className="button button--primary">
              フィードバックを見る
            </button>
            <button type="button" onClick={() => setReviewing(true)}>
              講師に相談する（有料）
            </button>
          </>
        )}
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
