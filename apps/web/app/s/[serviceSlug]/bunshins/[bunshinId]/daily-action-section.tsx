'use client';

import { useMemo, useRef, useState, type FormEvent } from 'react';
import { createClientRequestId } from '../../../../ui/client-request-id';
import type { DailyActionType } from '../../../../../src/http/service-daily-actions';

export type DailyActionView = {
  id: string;
  type: DailyActionType;
  text: string;
  label: string;
  hasPhoto: boolean;
  attachmentStatus: 'PENDING_UPLOAD' | 'READY' | 'REJECTED' | null;
  createdAt: string;
};

const choices: Array<{
  type: DailyActionType;
  icon: string;
  title: string;
  description: string;
  prompt: string;
  placeholder: string;
}> = [
  {
    type: 'PHOTO',
    icon: '📷',
    title: '写真を1枚残す',
    description: '仕事・商品・お店など、今日の1枚を選びます',
    prompt: 'この写真は何をしているところですか？',
    placeholder: '例：開店前に、今日おすすめするパンを並べたところ',
  },
  {
    type: 'CUSTOMER_QUESTION',
    icon: '💬',
    title: 'お客様の質問を残す',
    description: '今日聞かれたことを、そのまま書きます',
    prompt: 'お客様から、何と聞かれましたか？',
    placeholder: '例：予約なしでも入れますか？と聞かれた',
  },
  {
    type: 'VOICE_MEMO',
    icon: '🎤',
    title: '30秒だけ話す',
    description: 'iPhoneのキーボードにあるマイクで入力できます',
    prompt: '今日あったことを、30秒ほど話してください',
    placeholder: '入力欄を押し、iPhoneキーボードのマイクを押して話します',
  },
  {
    type: 'COMMENT_REPLY',
    icon: '↩️',
    title: 'コメントへの返事を残す',
    description: 'もらったコメントと、返した内容を残します',
    prompt: 'どんなコメントに、どう返しましたか？',
    placeholder: '例：「参考になりました」へ「ありがとうございます」と返した',
  },
  {
    type: 'POST_IMPROVEMENT',
    icon: '✏️',
    title: '前の投稿を少し直す',
    description: '次は変えたいことを1つだけ書きます',
    prompt: '次の投稿では、何を1つ変えますか？',
    placeholder: '例：最初の文章を短くして、結論を先に書く',
  },
  {
    type: 'REST_REASON',
    icon: '🌙',
    title: '今日は投稿しない',
    description: '休む理由も、次の予定を考える材料になります',
    prompt: '今日は、なぜ投稿を休みますか？',
    placeholder: '例：お客様対応が多かったので、明日の午前に投稿する',
  },
];

const extraQuestions: Record<DailyActionType, string> = {
  PHOTO: '今日、お客様に見せたい仕事・商品・場所の写真はありますか？',
  CUSTOMER_QUESTION: '最近、お客様から何を一番よく聞かれましたか？',
  VOICE_MEMO: '今日うれしかったこと、困ったことは何ですか？',
  COMMENT_REPLY: '最近届いたコメントに、どんな返事をしましたか？',
  POST_IMPROVEMENT: '前の投稿で、次は変えたいところが1つありますか？',
  REST_REASON: '投稿できなかった日は、何が一番大変でしたか？',
};

export function DailyActionSection({
  endpoint,
  initialActions,
}: {
  endpoint: string;
  initialActions: DailyActionView[];
}) {
  const [actions, setActions] = useState(initialActions);
  const [selected, setSelected] = useState<DailyActionType | null>(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const choice = choices.find((item) => item.type === selected) ?? null;
  const question = useMemo(() => {
    const missing = choices.find((item) => !actions.some((action) => action.type === item.type));
    return extraQuestions[missing?.type ?? 'CUSTOMER_QUESTION'];
  }, [actions]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!choice || saving) return;
    const values = new FormData(event.currentTarget);
    const textValue = values.get('text');
    const text = typeof textValue === 'string' ? textValue.trim() : '';
    const file = values.get('photo');
    if (text.length < 2) {
      setMessage('短い一言で大丈夫です。2文字以上で入力してください。');
      return;
    }
    if (choice.type === 'PHOTO' && (!(file instanceof File) || file.size === 0)) {
      setMessage('写真を1枚選んでください。');
      return;
    }
    setSaving(true);
    setMessage(choice.type === 'PHOTO' ? '写真を保存する準備をしています…' : '記録しています…');
    try {
      const requestId = createClientRequestId();
      const createdResponse = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-request-id': requestId },
        body: JSON.stringify({
          type: choice.type,
          text,
          idempotencyKey: requestId,
          ...(choice.type === 'PHOTO' && file instanceof File
            ? {
                originalFilename: file.name,
                mimeType: file.type,
                sizeBytes: file.size,
                rightsConfirmed: true,
              }
            : {}),
        }),
      });
      const created = (await createdResponse.json()) as {
        data?: {
          action: DailyActionView;
          upload: { method: 'PUT'; uploadUrl: string; headers: Record<string, string> } | null;
        };
        error?: { message?: string };
      };
      if (!createdResponse.ok || !created.data?.action)
        throw new Error(created.error?.message ?? '記録を保存できませんでした。');
      let savedAction = created.data.action;
      if (choice.type === 'PHOTO' && file instanceof File) {
        if (!created.data.upload) throw new Error('写真の保存先を準備できませんでした。');
        setMessage('写真を送っています…');
        const uploaded = await fetch(created.data.upload.uploadUrl, {
          method: created.data.upload.method,
          headers: created.data.upload.headers,
          body: file,
        });
        if (!uploaded.ok) throw new Error('写真を送れませんでした。もう一度お試しください。');
        setMessage('写真を安全な形式で保存しています…');
        const completeResponse = await fetch(`${endpoint}/${savedAction.id}/complete`, {
          method: 'POST',
        });
        const complete = (await completeResponse.json()) as {
          data?: DailyActionView;
          error?: { message?: string };
        };
        if (!completeResponse.ok || !complete.data)
          throw new Error(complete.error?.message ?? '写真を確認できませんでした。');
        savedAction = complete.data;
      }
      setActions((current) => [savedAction, ...current.filter(({ id }) => id !== savedAction.id)]);
      formRef.current?.reset();
      setSelected(null);
      setMessage('残しました。次の投稿を作るときに、この内容を使います。');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '記録を保存できませんでした。');
    } finally {
      setSaving(false);
    }
  }

  async function remove(action: DailyActionView) {
    if (!window.confirm('この記録を削除しますか？')) return;
    const response = await fetch(`${endpoint}/${encodeURIComponent(action.id)}`, {
      method: 'DELETE',
    });
    if (response.ok) {
      setActions((current) => current.filter(({ id }) => id !== action.id));
      setMessage('記録を削除しました。');
    } else setMessage('削除できませんでした。もう一度お試しください。');
  }

  return (
    <section className="daily-action">
      <header className="daily-action__header">
        <p className="eyebrow">今日の素材を残す</p>
        <h2>1つ選ぶだけで大丈夫です</h2>
        <p>今日あったことを残すと、次の投稿がもっとあなたらしくなります。</p>
      </header>

      <div className="daily-action__question">
        <strong>迷ったら、これを教えてください</strong>
        <p>{question}</p>
      </div>

      <div className="daily-action__choices">
        {choices.map((item) => (
          <button
            key={item.type}
            type="button"
            className={selected === item.type ? 'is-selected' : ''}
            aria-pressed={selected === item.type}
            onClick={() => {
              setSelected(item.type);
              setMessage('');
            }}
          >
            <span aria-hidden="true">{item.icon}</span>
            <strong>{item.title}</strong>
            <small>{item.description}</small>
          </button>
        ))}
      </div>

      {choice ? (
        <form ref={formRef} className="daily-action__form" onSubmit={(event) => void save(event)}>
          <h3>{choice.prompt}</h3>
          {choice.type === 'PHOTO' ? (
            <label className="field">
              <span className="field__label">写真を選ぶ</span>
              <input
                className="field__control"
                type="file"
                name="photo"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                required
              />
              <small>「写真を撮る」または「写真ライブラリ」を選べます。10MBまでです。</small>
            </label>
          ) : null}
          <label className="field">
            <span className="field__label">短い一言</span>
            <textarea
              className="field__control"
              name="text"
              rows={4}
              minLength={2}
              maxLength={1000}
              required
              placeholder={choice.placeholder}
            />
          </label>
          {choice.type === 'VOICE_MEMO' ? (
            <p className="daily-action__hint">
              入力欄を押す → iPhoneキーボード右下のマイクを押す → 30秒ほど話す、の順です。
            </p>
          ) : null}
          <button className="button button--primary button--full" type="submit" disabled={saving}>
            {saving ? '保存しています…' : 'この内容を残す'}
          </button>
          <button
            className="button button--secondary button--full"
            type="button"
            onClick={() => setSelected(null)}
          >
            やめる
          </button>
        </form>
      ) : null}

      {message ? (
        <p className="notice" role="status" aria-live="polite">
          {message}
        </p>
      ) : null}
      <p className="daily-action__privacy">
        この記録は、あなたのこの投稿パートナーだけが使います。
      </p>

      {actions.length > 0 ? (
        <details className="daily-action__history">
          <summary>残した内容を見る（{actions.length}件）</summary>
          <ul>
            {actions.map((action) => (
              <li key={action.id}>
                <strong>{action.label}</strong>
                <time dateTime={action.createdAt}>
                  {new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric' }).format(
                    new Date(action.createdAt),
                  )}
                </time>
                <p>{action.text}</p>
                <div>
                  {action.hasPhoto ? (
                    <a href={`${endpoint}/${action.id}/photo`} target="_blank" rel="noreferrer">
                      写真を見る・保存する
                    </a>
                  ) : null}
                  <button type="button" onClick={() => void remove(action)}>
                    削除
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
