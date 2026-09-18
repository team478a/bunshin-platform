'use client';

import { useRef, useState } from 'react';

type ResultStatus = 'DONE' | 'PARTIAL' | 'NOT_DONE';
type ParticipantState = {
  enrollmentId: string;
  programName: string;
  enrollmentStatus: 'ACTIVE' | 'COMPLETED' | 'EXPIRED';
  policyKey: 'FREE_7D' | 'PAID_90D';
  programDay: number;
  startsAt: string;
  endsAt: string | null;
  classification: 'NOT_STARTED' | 'PARTIAL' | 'LISTED' | null;
  action: {
    id: string;
    sequence: number;
    actionKey: string;
    mode: 'WORK' | 'WAIT';
    status: string;
    display: {
      title: string;
      reason: string;
      steps: string[];
      estimatedMinutes: number | null;
    };
    reevaluateAt: string | null;
  } | null;
};

const classificationLabels = {
  NOT_STARTED: 'まだ始めていない状態',
  PARTIAL: '一部まで進めた状態',
  LISTED: '商品を出品できた状態',
} as const;

export function AiResaleActionCard({
  serviceSlug,
  initialState,
}: {
  serviceSlug: string;
  initialState: ParticipantState;
}) {
  const [state, setState] = useState(initialState);
  const [itemTitle, setItemTitle] = useState('');
  const [reactionState, setReactionState] = useState<'NO_REACTION' | 'REACTION' | 'SOLD'>(
    'NO_REACTION',
  );
  const [improvementType, setImprovementType] = useState('写真');
  const [soldPriceYen, setSoldPriceYen] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const retryKey = useRef<{ status: ResultStatus; key: string } | null>(null);
  const action = state.action;

  const resetFields = () => {
    setItemTitle('');
    setReactionState('NO_REACTION');
    setImprovementType('写真');
    setSoldPriceYen('');
    setNote('');
  };

  async function submit(resultStatus: ResultStatus) {
    if (!action || action.mode === 'WAIT') return;
    setSaving(true);
    setMessage('');
    setError('');
    const request =
      retryKey.current?.status === resultStatus
        ? retryKey.current
        : { status: resultStatus, key: crypto.randomUUID() };
    retryKey.current = request;
    try {
      const response = await fetch(
        `/api/services/${encodeURIComponent(serviceSlug)}/program-enrollments/${state.enrollmentId}/current-action`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            assignmentId: action.id,
            resultStatus,
            idempotencyKey: request.key,
            itemTitle: itemTitle.trim() || null,
            reactionState: action.actionKey === 'CHECK' ? reactionState : null,
            improvementType: action.actionKey === 'IMPROVE' ? improvementType : null,
            soldPriceYen:
              action.actionKey === 'CHECK' && reactionState === 'SOLD' && soldPriceYen
                ? Number(soldPriceYen)
                : null,
            note: note.trim() || null,
          }),
        },
      );
      const payload = (await response.json()) as {
        data?: { state?: ParticipantState };
        error?: { message?: string };
      };
      if (!response.ok || !payload.data?.state) {
        throw new Error(payload.error?.message ?? '記録できませんでした。');
      }
      setState(payload.data.state);
      retryKey.current = null;
      resetFields();
      setMessage(
        resultStatus === 'DONE'
          ? 'できたことを記録しました。次にやることを更新しました。'
          : '今の状況を記録しました。無理のない次の一歩に更新しました。',
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '記録できませんでした。');
    } finally {
      setSaving(false);
    }
  }

  if (state.enrollmentStatus !== 'ACTIVE') {
    return (
      <section className="service-entry__card resale-action-card resale-action-card--complete">
        <p className="eyebrow">7日間の体験が完了しました</p>
        <h2>ここまでの結果</h2>
        <strong>
          {state.classification
            ? classificationLabels[state.classification]
            : '結果を確認しています'}
        </strong>
        <p>お疲れさまでした。次のプログラムの案内をお待ちください。</p>
      </section>
    );
  }

  if (!action) {
    return (
      <section className="service-entry__card resale-action-card">
        <h2>次にやることを準備しています</h2>
        <p>少し待ってから、この画面を更新してください。</p>
      </section>
    );
  }

  return (
    <section
      className="service-entry__card resale-action-card"
      aria-labelledby="resale-action-title"
    >
      <div className="resale-action-card__meta">
        <span>DAY {Math.min(state.programDay, state.policyKey === 'FREE_7D' ? 7 : 90)}</span>
        {action.display.estimatedMinutes !== null ? (
          <span>目安 {action.display.estimatedMinutes}分</span>
        ) : null}
      </div>
      <p className="eyebrow">今日やること</p>
      <h2 id="resale-action-title">{action.display.title}</h2>
      <p className="resale-action-card__reason">{action.display.reason}</p>

      {action.display.steps.length > 0 ? (
        <ol className="resale-action-card__steps">
          {action.display.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      ) : null}

      {action.mode === 'WAIT' ? (
        <div className="notice resale-action-card__wait">
          <strong>今日は作業しなくて大丈夫です</strong>
          <p>
            {action.reevaluateAt
              ? `${new Intl.DateTimeFormat('ja-JP', {
                  month: 'numeric',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                }).format(new Date(action.reevaluateAt))}ごろに、次の行動を確認します。`
              : '次の確認時刻まで、そのままお待ちください。'}
          </p>
        </div>
      ) : (
        <div className="resale-action-card__form">
          {['ITEM_FIND', 'NEXT_ITEM'].includes(action.actionKey) ? (
            <label className="field">
              <span className="field__label">見つけた商品</span>
              <input
                className="field__control"
                value={itemTitle}
                onChange={(event) => setItemTitle(event.target.value)}
                maxLength={160}
                placeholder="例：使っていないバッグ"
                required
              />
            </label>
          ) : null}
          {action.actionKey === 'CHECK' ? (
            <>
              <label className="field">
                <span className="field__label">商品の反応</span>
                <select
                  className="field__control"
                  value={reactionState}
                  onChange={(event) => setReactionState(event.target.value as typeof reactionState)}
                >
                  <option value="NO_REACTION">まだ反応がない</option>
                  <option value="REACTION">閲覧・いいね・質問があった</option>
                  <option value="SOLD">売れた</option>
                </select>
              </label>
              {reactionState === 'SOLD' ? (
                <label className="field">
                  <span className="field__label">販売価格（任意）</span>
                  <input
                    className="field__control"
                    type="number"
                    min="0"
                    max="100000000"
                    inputMode="numeric"
                    value={soldPriceYen}
                    onChange={(event) => setSoldPriceYen(event.target.value)}
                    placeholder="例：2500"
                  />
                </label>
              ) : null}
            </>
          ) : null}
          {action.actionKey === 'IMPROVE' ? (
            <label className="field">
              <span className="field__label">改善したところ</span>
              <select
                className="field__control"
                value={improvementType}
                onChange={(event) => setImprovementType(event.target.value)}
              >
                <option value="写真">写真</option>
                <option value="タイトル">タイトル</option>
                <option value="価格">価格</option>
                <option value="説明文">説明文</option>
              </select>
            </label>
          ) : null}
          <label className="field">
            <span className="field__label">メモ（任意）</span>
            <textarea
              className="field__control"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
              rows={3}
              placeholder="困ったことや気づいたこと"
            />
          </label>
          <button
            className="button button--primary button--full"
            type="button"
            disabled={
              saving || (['ITEM_FIND', 'NEXT_ITEM'].includes(action.actionKey) && !itemTitle.trim())
            }
            onClick={() => void submit('DONE')}
          >
            {saving ? '記録しています…' : 'できました'}
          </button>
          <div className="resale-action-card__secondary-actions">
            <button
              className="button button--secondary"
              type="button"
              disabled={saving}
              onClick={() => void submit('PARTIAL')}
            >
              途中までできた
            </button>
            <button
              className="button button--secondary"
              type="button"
              disabled={saving}
              onClick={() => void submit('NOT_DONE')}
            >
              今日はできなかった
            </button>
          </div>
        </div>
      )}
      {message ? (
        <p className="notice notice--success" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="notice notice--danger" role="alert">
          {error} もう一度同じボタンを押してください。
        </p>
      ) : null}
    </section>
  );
}
