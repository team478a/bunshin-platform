'use client';

import { useMemo, useRef, useState, type FormEvent } from 'react';
import { createClientRequestId } from './client-request-id';

type ActionDefinition = {
  label: string;
  description: string;
  placeholder: string;
  accept?: string;
  capture?: 'user' | 'environment';
};

const actions = {
  PHOTO: {
    label: '写真を1枚撮る',
    description: '今日の仕事、商品、場所など、投稿に使える本人の写真を残します。',
    placeholder: '写真についてのメモ（任意）',
    accept: 'image/jpeg,image/png,image/webp',
    capture: 'environment' as const,
  },
  CUSTOMER_QUESTION: {
    label: 'お客様から聞かれた質問を記録する',
    description: '実際に聞かれた質問は、次の投稿テーマとして使えます。',
    placeholder: '例：初めてでも使えますか？',
  },
  VOICE_MEMO: {
    label: '30秒の音声メモを残す',
    description: '今日気づいたことを短く話して残します。',
    placeholder: '音声についてのメモ（任意）',
    accept: 'audio/mpeg,audio/mp4,audio/x-m4a,audio/wav',
    capture: 'user' as const,
  },
  COMMENT_REPLY: {
    label: 'コメントへの返信を記録する',
    description: 'よく届くコメントと、あなたが返した内容を残します。',
    placeholder: 'コメントと返信内容を入力してください',
  },
  POST_IMPROVEMENT: {
    label: '過去投稿の改善点を記録する',
    description: 'もう一度使いたい点や、次は直したい点を残します。',
    placeholder: '良かった点、次に直したい点を入力してください',
  },
  REST_REASON: {
    label: '今日は投稿しない理由を記録する',
    description: '休んだ理由を残すと、無理のない投稿予定を考える材料になります。',
    placeholder: '例：撮影する時間が取れなかった',
  },
} as const satisfies Record<string, ActionDefinition>;
type Kind = keyof typeof actions;
type Action = {
  id: string;
  kind: Kind;
  title: string;
  createdAt: string;
  hasAsset: boolean;
  assetMimeType?: string | null;
  assetOriginalFilename?: string | null;
};

const order = Object.keys(actions) as Kind[];

export function DailyActionCollector({
  endpoint,
  initialActions,
  dailyMissionId,
}: {
  endpoint: string;
  initialActions: Action[];
  dailyMissionId: string | null;
}) {
  const [records, setRecords] = useState(initialActions);
  const [selected, setSelected] = useState<Kind>(() => {
    const seen = new Set(initialActions.map(({ kind }) => kind));
    return order.find((kind) => !seen.has(kind)) ?? order[initialActions.length % order.length]!;
  });
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const recommended: ActionDefinition = useMemo(() => actions[selected], [selected]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage('保存しています…');
    const form = new FormData(event.currentTarget);
    form.set('kind', selected);
    form.set('idempotencyKey', createClientRequestId());
    form.set('dailyMissionId', dailyMissionId ?? '');
    try {
      const response = await fetch(endpoint, { method: 'POST', body: form });
      const result = (await response.json().catch(() => null)) as {
        data?: Action;
        error?: { message?: string };
      } | null;
      if (!response.ok || !result?.data) {
        setMessage(result?.error?.message ?? '保存できませんでした。もう一度お試しください。');
        return;
      }
      setRecords((current) => [result.data!, ...current]);
      formRef.current?.reset();
      const currentIndex = order.indexOf(selected);
      setSelected(order[(currentIndex + 1) % order.length]!);
      setMessage('本人素材として保存しました。次の投稿案から、この分身だけが使えます。');
    } catch {
      setMessage('通信できませんでした。接続を確認して、もう一度お試しください。');
    } finally {
      setSaving(false);
    }
  }

  const fileAction = selected === 'PHOTO' || selected === 'VOICE_MEMO';
  return (
    <section className="daily-action-collector" id="daily-action">
      <header>
        <p className="eyebrow">投稿しない日もできること</p>
        <h2>今日の素材づくり</h2>
        <p>本人の体験を少しずつ残すと、次の投稿案があなたらしくなります。</p>
      </header>
      <div className="daily-action-collector__recommendation">
        <span>今日のおすすめ</span>
        <h3>{recommended.label}</h3>
        <p>{recommended.description}</p>
        <form ref={formRef} onSubmit={(event) => void submit(event)}>
          {fileAction ? (
            <label className="field">
              <span className="field__label">
                {selected === 'PHOTO' ? '写真を選ぶ・撮る' : '音声を選ぶ・録音する'}
              </span>
              <input
                className="field__control"
                name="file"
                type="file"
                accept={recommended.accept}
                capture={recommended.capture}
                required
              />
              {selected === 'VOICE_MEMO' ? (
                <small>30秒程度、10MB以内で残してください。</small>
              ) : null}
            </label>
          ) : null}
          <label className="field">
            <span className="field__label">{fileAction ? 'メモ' : '内容'}</span>
            <textarea
              className="field__control"
              name="content"
              rows={4}
              maxLength={20000}
              required={!fileAction}
              placeholder={recommended.placeholder}
            />
          </label>
          <button className="button" type="submit" disabled={saving}>
            {saving ? '保存中…' : '本人素材として保存する'}
          </button>
        </form>
      </div>
      <details className="daily-action-collector__alternatives">
        <summary>別の素材を残す</summary>
        <div>
          {order.map((kind) => (
            <button
              key={kind}
              type="button"
              aria-pressed={selected === kind}
              onClick={() => setSelected(kind)}
            >
              {actions[kind].label}
            </button>
          ))}
        </div>
      </details>
      {message ? (
        <p className="notice" role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
      {records.length > 0 ? (
        <div className="daily-action-collector__history">
          <p className="daily-action-collector__count">
            これまでに残した本人素材：{records.length}件
          </p>
          <ul>
            {records.slice(0, 5).map((record) => (
              <li key={record.id}>
                <span>{record.title}</span>
                {record.hasAsset ? (
                  <a
                    href={`${endpoint}/${encodeURIComponent(record.id)}/asset`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {record.assetMimeType?.startsWith('image/') ? '写真を確認' : '音声を確認'}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
