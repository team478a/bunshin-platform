'use client';

import type { FacePolicy } from '@bunshin/platform-domain';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

export interface PersonalityVersionView {
  id: string;
  version: number;
  source: 'INITIAL' | 'MANUAL' | 'LEARNING' | 'RESTORE';
  changeReason: string;
  tone: string;
  formality: string;
  energyLevel: string;
  expertiseLevel: string;
  sentenceStyle: string;
  firstPerson: string;
  forbiddenExpressions: string[];
  preferredExpressions: string[];
  visualDirection: string | null;
  facePolicy: FacePolicy;
  createdAt: string;
}

const facePolicyLabels: Record<FacePolicy, string> = {
  FACE_OK: '顔も声も使える',
  FACE_NG_VOICE_OK: '顔は出さず、声は使える',
  FACE_VOICE_NG: '顔も声も使わない',
  FULL_ANONYMOUS: '完全に匿名で発信する',
};

const sourceLabels: Record<PersonalityVersionView['source'], string> = {
  INITIAL: '最初の設定',
  MANUAL: '自分で変更',
  LEARNING: '学習結果を反映',
  RESTORE: '前の設定へ戻した',
};

export function PersonalitySection({
  workspaceId,
  bunshinId,
  versions,
}: {
  workspaceId: string;
  bunshinId: string;
  versions: PersonalityVersionView[];
}) {
  const router = useRouter();
  const current = versions[0];
  const [form, setForm] = useState(() => ({
    tone: current?.tone ?? '',
    formality: current?.formality ?? '',
    energyLevel: current?.energyLevel ?? '',
    expertiseLevel: current?.expertiseLevel ?? '',
    sentenceStyle: current?.sentenceStyle ?? '',
    firstPerson: current?.firstPerson ?? '',
    forbiddenExpressions: current?.forbiddenExpressions.join('\n') ?? '',
    preferredExpressions: current?.preferredExpressions.join('\n') ?? '',
    visualDirection: current?.visualDirection ?? '',
    facePolicy: current?.facePolicy ?? 'FULL_ANONYMOUS',
    changeReason: '',
  }));
  const [message, setMessage] = useState<string | null>(null);
  const endpoint = `/api/workspaces/${encodeURIComponent(workspaceId)}/bunshins/${encodeURIComponent(bunshinId)}/personality-versions`;
  const lines = (value: string) =>
    value
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);

  async function save(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...form,
        forbiddenExpressions: lines(form.forbiddenExpressions),
        preferredExpressions: lines(form.preferredExpressions),
        visualDirection: form.visualDirection.trim() || null,
      }),
    });
    setMessage(
      response.ok
        ? '新しい話し方を保存しました。前の設定も残っています。'
        : '保存できませんでした。空らんや同じ表現がないか確認してください。',
    );
    if (response.ok) router.refresh();
  }

  async function restore(version: PersonalityVersionView) {
    if (!window.confirm(`第${version.version}版の話し方に戻しますか？`)) return;
    setMessage(null);
    const response = await fetch(`${endpoint}/${encodeURIComponent(version.id)}/restore`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ changeReason: `第${version.version}版へ戻す` }),
    });
    setMessage(
      response.ok ? '前の話し方を新しい設定として保存しました。' : '元に戻せませんでした。',
    );
    if (response.ok) router.refresh();
  }

  if (!current) return <p>くわしい話し方は、まだ決まっていません。</p>;

  return (
    <section className="personality-section settings-card">
      <div className="personality-section__heading">
        <div>
          <p className="personality-section__eyebrow">分身らしさの設定</p>
          <h2>BUNSHINの話し方</h2>
        </div>
        <span className="personality-section__version">いまは第{current.version}版</span>
      </div>
      <p className="personality-section__lead">
        むずかしい言葉は不要です。「友だちに話すように」「短く元気に」など、理想の話し方を書いてください。
      </p>
      <form className="form-stack personality-form" onSubmit={(event) => void save(event)}>
        <label className="field">
          <span className="field__label">話す雰囲気</span>
          <input
            className="field__control"
            required
            maxLength={100}
            value={form.tone}
            onChange={(event) => setForm({ ...form, tone: event.target.value })}
            placeholder="例：やさしく親しみやすい"
          />
        </label>
        <label className="field">
          <span className="field__label">ていねいさ</span>
          <input
            className="field__control"
            required
            maxLength={100}
            value={form.formality}
            onChange={(event) => setForm({ ...form, formality: event.target.value })}
            placeholder="例：友だちに話すくらい"
          />
        </label>
        <label className="field">
          <span className="field__label">元気さ</span>
          <input
            className="field__control"
            required
            maxLength={100}
            value={form.energyLevel}
            onChange={(event) => setForm({ ...form, energyLevel: event.target.value })}
            placeholder="例：落ち着いている"
          />
        </label>
        <label className="field">
          <span className="field__label">知識の伝え方</span>
          <input
            className="field__control"
            required
            maxLength={100}
            value={form.expertiseLevel}
            onChange={(event) => setForm({ ...form, expertiseLevel: event.target.value })}
            placeholder="例：初心者にもわかる"
          />
        </label>
        <label className="field">
          <span className="field__label">文章の形</span>
          <textarea
            className="field__control"
            required
            maxLength={500}
            value={form.sentenceStyle}
            onChange={(event) => setForm({ ...form, sentenceStyle: event.target.value })}
            placeholder="例：一文を短くする"
          />
        </label>
        <label className="field">
          <span className="field__label">自分の呼び方</span>
          <input
            className="field__control"
            required
            maxLength={50}
            value={form.firstPerson}
            onChange={(event) => setForm({ ...form, firstPerson: event.target.value })}
            placeholder="例：わたし"
          />
        </label>
        <label className="field">
          <span className="field__label">使ってほしい言葉（1行に1つ）</span>
          <textarea
            className="field__control"
            value={form.preferredExpressions}
            onChange={(event) => setForm({ ...form, preferredExpressions: event.target.value })}
          />
        </label>
        <label className="field">
          <span className="field__label">使ってほしくない言葉（1行に1つ）</span>
          <textarea
            className="field__control"
            value={form.forbiddenExpressions}
            onChange={(event) => setForm({ ...form, forbiddenExpressions: event.target.value })}
          />
        </label>
        <label className="field">
          <span className="field__label">見た目のイメージ（書かなくても大丈夫）</span>
          <textarea
            className="field__control"
            maxLength={500}
            value={form.visualDirection}
            onChange={(event) => setForm({ ...form, visualDirection: event.target.value })}
          />
        </label>
        <label className="field">
          <span className="field__label">顔と声の使い方</span>
          <select
            className="field__control"
            value={form.facePolicy}
            onChange={(event) => setForm({ ...form, facePolicy: event.target.value as FacePolicy })}
          >
            {Object.entries(facePolicyLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">変えた理由</span>
          <input
            className="field__control"
            required
            maxLength={500}
            value={form.changeReason}
            onChange={(event) => setForm({ ...form, changeReason: event.target.value })}
            placeholder="例：もっとやさしい話し方にしたい"
          />
        </label>
        <button className="button button--primary button--full" type="submit">
          この話し方を保存する
        </button>
      </form>
      {message ? (
        <p className="form-feedback" role="status">
          {message}
        </p>
      ) : null}
      <details className="personality-history-disclosure">
        <summary>前の話し方を見る</summary>
        <ol className="personality-history">
          {versions.map((version, index) => (
            <li key={version.id}>
              <strong>
                第{version.version}版 {index === 0 ? '（いま使っています）' : ''}
              </strong>
              <span>
                {sourceLabels[version.source]}・
                {new Date(version.createdAt).toLocaleDateString('ja-JP')}
              </span>
              <p>{version.changeReason}</p>
              {index > 0 ? (
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={() => void restore(version)}
                >
                  この話し方に戻す
                </button>
              ) : null}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
