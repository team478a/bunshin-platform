'use client';

import { useState, type FormEvent } from 'react';

export function ProgramAdminEditor({ workspaces }: { workspaces: { id: string; name: string }[] }) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [preset, setPreset] = useState<'SIDE_HUSTLE_90_DAY' | 'SIMPLE'>('SIDE_HUSTLE_90_DAY');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const text = (name: string) => {
      const value = data.get(name);
      return typeof value === 'string' ? value : '';
    };
    const supportModes = ['IDEA_ONLY', 'GUIDED', 'READY_TO_USE'].filter((mode) => data.has(mode));
    setSaving(true);
    setMessage('公式プログラムを保存しています…');
    try {
      const response = await fetch('/api/admin/programs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workspaceId: text('workspaceId'),
          name: text('name'),
          description: text('description'),
          category: text('category'),
          targetAudience: text('targetAudience'),
          definitionPreset: text('definitionPreset'),
          standardDurationDays: Number(text('standardDurationDays')),
          supportModes,
        }),
      });
      const result = (await response.json()) as { error?: { message?: string } };
      if (!response.ok)
        throw new Error(result.error?.message ?? '公式プログラムを保存できませんでした。');
      setMessage('公式プログラムを公開しました。画面を更新します…');
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '公式プログラムを保存できませんでした。');
      setSaving(false);
    }
  }

  return (
    <section className="settings-card">
      <h2>新しい公式プログラムを作る</h2>
      <p>サービスが選んで使える実践プログラムの原型を、第1版として公開します。</p>
      <form className="form-stack" onSubmit={(event) => void submit(event)}>
        <label className="field">
          <span className="field__label">提供先の運営団体</span>
          <select className="field__control" name="workspaceId" required>
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">プログラム名</span>
          <input className="field__control" name="name" required maxLength={160} />
        </label>
        <label className="field">
          <span className="field__label">どんな人のためのものですか</span>
          <input className="field__control" name="targetAudience" required maxLength={500} />
        </label>
        <label className="field">
          <span className="field__label">種類</span>
          <input
            className="field__control"
            name="category"
            required
            maxLength={80}
            placeholder="例：SNS副業"
          />
        </label>
        <label className="field">
          <span className="field__label">説明</span>
          <textarea
            className="field__control"
            name="description"
            required
            maxLength={2000}
            rows={4}
          />
        </label>
        <label className="field">
          <span className="field__label">プログラムの型</span>
          <select
            className="field__control"
            name="definitionPreset"
            value={preset}
            onChange={(event) => setPreset(event.target.value as typeof preset)}
          >
            <option value="SIDE_HUSTLE_90_DAY">副業・SNS集客の90日プログラム</option>
            <option value="SIMPLE">シンプルな毎日実践プログラム</option>
          </select>
          <small>90日プログラムには、4つの段階と曜日ごとの行動、成果の確認項目が入ります。</small>
        </label>
        <label className="field">
          <span className="field__label">標準の日数</span>
          <input
            className="field__control"
            name="standardDurationDays"
            type="number"
            min={1}
            max={365}
            key={preset}
            defaultValue={preset === 'SIDE_HUSTLE_90_DAY' ? 90 : 30}
            readOnly={preset === 'SIDE_HUSTLE_90_DAY'}
            required
          />
        </label>
        <fieldset>
          <legend>参加者へ渡せる内容</legend>
          <label>
            <input name="IDEA_ONLY" type="checkbox" defaultChecked /> 企画だけ
          </label>
          <label>
            <input name="GUIDED" type="checkbox" defaultChecked /> 作り方・台本・プロンプト
          </label>
          <label>
            <input name="READY_TO_USE" type="checkbox" defaultChecked /> そのまま使える完成品
          </label>
        </fieldset>
        <button className="button button--primary" type="submit" disabled={saving}>
          {saving ? '保存中…' : '第1版を公開する'}
        </button>
      </form>
      <p role="status" aria-live="polite">
        {message}
      </p>
    </section>
  );
}
