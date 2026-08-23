'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { SocialCapabilityStatus } from './capability-section';

export interface ContentPillarView {
  id: string;
  title: string;
  description: string | null;
  weight: number;
  active: boolean;
}

type FormState = Pick<ContentPillarView, 'title' | 'description' | 'weight'>;
const empty: FormState = { title: '', description: '', weight: 50 };

function PillarForm({
  initial,
  pending,
  onSubmit,
  onCancel,
}: {
  initial: FormState;
  pending: boolean;
  onSubmit: (value: FormState) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(initial);
  return (
    <form
      className="content-pillar-form"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        void onSubmit(form);
      }}
    >
      <label>
        テーマ
        <input
          required
          maxLength={100}
          value={form.title}
          onChange={(event) => setForm({ ...form, title: event.target.value })}
        />
      </label>
      <label>
        説明（任意）
        <textarea
          maxLength={500}
          value={form.description ?? ''}
          onChange={(event) => setForm({ ...form, description: event.target.value })}
        />
      </label>
      <label>
        このテーマをどのくらい多く使いますか？（1〜100）
        <input
          required
          type="number"
          min={1}
          max={100}
          step={1}
          value={form.weight}
          onChange={(event) => setForm({ ...form, weight: Number(event.target.value) })}
        />
      </label>
      <div className="content-pillar-actions">
        <button disabled={pending} type="submit">
          保存
        </button>
        <button disabled={pending} type="button" onClick={onCancel}>
          キャンセル
        </button>
      </div>
    </form>
  );
}

export function ContentPillarSection({
  workspaceId,
  bunshinId,
  capabilityStatus,
  pillars,
}: {
  workspaceId: string;
  bunshinId: string;
  capabilityStatus: SocialCapabilityStatus;
  pillars: ContentPillarView[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const endpoint = `/api/workspaces/${encodeURIComponent(workspaceId)}/bunshins/${encodeURIComponent(bunshinId)}/content-pillars`;
  const readonly = capabilityStatus === 'SUSPENDED' || capabilityStatus === 'LOCKED';

  async function mutation(url: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(url, {
        method,
        ...(body === undefined
          ? {}
          : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      });
      setMessage(
        response.ok
          ? '投稿テーマを保存しました。'
          : '投稿テーマを保存できませんでした。入力した内容を確認してください。',
      );
      if (response.ok) {
        setEditing(null);
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="content-pillar-section">
      <h2>投稿するテーマ</h2>
      <p>よく投稿したい話題を登録します。数字が大きいテーマほど、たくさん使います。</p>
      {capabilityStatus === null ? <p>先に「SNSのお手伝いをはじめる」を押してください。</p> : null}
      {readonly ? <p>今はテーマを見ることだけできます。内容を変えることはできません。</p> : null}
      {pillars.length === 0 ? <p>投稿するテーマはまだありません。</p> : null}
      <ul className="content-pillar-list">
        {pillars.map((pillar) => (
          <li className="content-pillar-card" key={pillar.id}>
            {editing === pillar.id ? (
              <PillarForm
                initial={pillar}
                pending={pending}
                onCancel={() => setEditing(null)}
                onSubmit={(value) => mutation(`${endpoint}/${pillar.id}`, 'PATCH', value)}
              />
            ) : (
              <>
                <h3>
                  {pillar.title} <small>{pillar.active ? '有効' : '停止'}</small>
                </h3>
                {pillar.description ? <p>{pillar.description}</p> : null}
                <p>使う多さ：{pillar.weight}</p>
                {!readonly && capabilityStatus === 'ACTIVE' ? (
                  <div className="content-pillar-actions">
                    <button disabled={pending} type="button" onClick={() => setEditing(pillar.id)}>
                      編集
                    </button>
                    <button
                      disabled={pending}
                      type="button"
                      onClick={() =>
                        void mutation(
                          `${endpoint}/${pillar.id}/${pillar.active ? 'deactivate' : 'activate'}`,
                          'POST',
                          {},
                        )
                      }
                    >
                      {pillar.active ? 'お休みにする' : 'もう一度使う'}
                    </button>
                    <button
                      disabled={pending}
                      type="button"
                      onClick={() => {
                        if (window.confirm('削除後は復元できません。削除しますか？'))
                          void mutation(`${endpoint}/${pillar.id}`, 'DELETE');
                      }}
                    >
                      削除
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </li>
        ))}
      </ul>
      {capabilityStatus === 'ACTIVE' && editing === null ? (
        <button type="button" disabled={pending} onClick={() => setEditing('NEW')}>
          投稿テーマを追加
        </button>
      ) : null}
      {editing === 'NEW' ? (
        <PillarForm
          initial={empty}
          pending={pending}
          onCancel={() => setEditing(null)}
          onSubmit={(value) => mutation(endpoint, 'POST', value)}
        />
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
