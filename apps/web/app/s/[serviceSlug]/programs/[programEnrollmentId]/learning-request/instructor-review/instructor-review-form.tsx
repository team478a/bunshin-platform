'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { InstructorReviewProduct } from '../../../../../../../src/services/instructor-review-contract';

type ReviewOffer = Pick<
  InstructorReviewProduct,
  'priceYen' | 'description' | 'responseHours' | 'cancellationTerms'
>;

function PayButton() {
  const { pending } = useFormStatus();
  return (
    <button className="button button--primary" type="submit" disabled={pending}>
      {pending ? '決済画面を準備しています…' : '申し込んで決済へ進む'}
    </button>
  );
}

export function InstructorReviewForm({
  action,
  offer,
  assignmentId,
  productRevision,
  idempotencyKey,
  topicId,
  initialExcerpt,
}: {
  action: (data: FormData) => void | Promise<void>;
  offer: ReviewOffer;
  assignmentId: string;
  productRevision: string;
  idempotencyKey: string;
  topicId: string | null;
  initialExcerpt: string;
}) {
  const [focus, setFocus] = useState('');
  const [excerpt, setExcerpt] = useState(initialExcerpt);
  const [confirming, setConfirming] = useState(false);
  return (
    <>
      <dl>
        <dt>レビュー内容</dt>
        <dd>{offer.description}</dd>
        <dt>税込総額</dt>
        <dd>
          {new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(
            offer.priceYen,
          )}
        </dd>
        <dt>回答の目安</dt>
        <dd>決済完了から {offer.responseHours} 時間以内</dd>
        <dt>キャンセル条件</dt>
        <dd>{offer.cancellationTerms}</dd>
      </dl>
      {confirming ? (
        <form action={action} className="form-stack">
          <h2>講師に共有する内容</h2>
          <div>
            <strong>見てほしい箇所</strong>
            <p style={{ whiteSpace: 'pre-wrap' }}>{focus.trim()}</p>
          </div>
          <div>
            <strong>下書き・抜粋</strong>
            <p style={{ whiteSpace: 'pre-wrap' }}>{excerpt.trim()}</p>
          </div>
          <input type="hidden" name="assignmentId" value={assignmentId} />
          <input type="hidden" name="productRevision" value={productRevision} />
          <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
          <input type="hidden" name="topicId" value={topicId ?? ''} />
          <input type="hidden" name="focus" value={focus} />
          <input type="hidden" name="excerpt" value={excerpt} />
          <PayButton />
          <button
            className="button button--secondary"
            type="button"
            onClick={() => setConfirming(false)}
          >
            共有する内容を修正する
          </button>
        </form>
      ) : (
        <form
          className="form-stack"
          onSubmit={(event) => {
            event.preventDefault();
            if (focus.trim() && excerpt.trim()) setConfirming(true);
          }}
        >
          <label className="field">
            <span>どこを見てほしいですか？</span>
            <input
              value={focus}
              onChange={(event) => setFocus(event.target.value)}
              required
              maxLength={500}
            />
          </label>
          <label className="field">
            <span>講師に共有する下書き・抜粋</span>
            <textarea
              value={excerpt}
              onChange={(event) => setExcerpt(event.target.value)}
              required
              maxLength={8000}
              rows={6}
            />
          </label>
          <button type="submit" className="button button--primary">
            申込内容を確認する
          </button>
        </form>
      )}
    </>
  );
}
