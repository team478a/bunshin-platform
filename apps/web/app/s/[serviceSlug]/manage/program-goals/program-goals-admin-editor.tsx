'use client';
import { useState, type FormEvent } from 'react';

const modes = [
  ['IDEA_ONLY', '企画だけ'],
  ['GUIDED', '作り方・台本・プロンプト'],
  ['READY_TO_USE', 'そのまま使える完成品'],
] as const;

export function ProgramGoalsAdminEditor({
  serviceSlug,
  programs,
}: {
  serviceSlug: string;
  programs: {
    id: string;
    name: string;
    policy: { modes: string[]; guidance: string } | null;
    goals: { id: string; name: string; unit: string }[];
  }[];
}) {
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const send = async (body: unknown, success: string) => {
    setSaving(true);
    setMessage('保存しています…');
    try {
      const response = await fetch(`/api/services/${serviceSlug}/program-goals`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message ?? '保存できませんでした。');
      setMessage(success);
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存できませんでした。');
      setSaving(false);
    }
  };
  const text = (data: FormData, name: string) => {
    const value = data.get(name);
    return typeof value === 'string' ? value : '';
  };
  const policy = (event: FormEvent<HTMLFormElement>, id: string) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const allowedSupportModes = modes.map(([value]) => value).filter((value) => data.has(value));
    void send(
      {
        action: 'SET_SUPPORT_POLICY',
        serviceProgramId: id,
        allowedSupportModes,
        defaultSupportMode: text(data, 'defaultSupportMode'),
        memberMayChoose: data.has('memberMayChoose'),
        guidance: text(data, 'guidance'),
      },
      '支援方法を保存しました。',
    );
  };
  const goal = (event: FormEvent<HTMLFormElement>, id: string) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const raw = Number(text(data, 'suggestedTarget'));
    void send(
      {
        action: 'CREATE_GOAL_DEFINITION',
        serviceProgramId: id,
        name: text(data, 'name'),
        description: text(data, 'description'),
        metricType: text(data, 'metricType'),
        unit: text(data, 'unit'),
        suggestedTarget: Number.isFinite(raw) && raw > 0 ? raw : null,
      },
      '目標候補を追加しました。',
    );
  };
  return (
    <>
      <p
        role="status"
        aria-live="polite"
        className={message ? 'notice notice--success' : undefined}
      >
        {message}
      </p>
      {programs.length === 0 ? (
        <section className="settings-card">
          <p>先に実践プログラムを追加してください。</p>
        </section>
      ) : null}
      {programs.map((program) => (
        <section className="settings-card" key={program.id}>
          <h2>{program.name}</h2>
          {program.policy ? (
            <p>現在の案内：{program.policy.guidance}</p>
          ) : (
            <p>支援方法はまだ設定されていません。</p>
          )}
          <form className="form-stack" onSubmit={(event) => policy(event, program.id)}>
            <fieldset>
              <legend>参加者へ渡せる内容</legend>
              {modes.map(([value, label]) => (
                <label key={value}>
                  <input
                    type="checkbox"
                    name={value}
                    defaultChecked={program.policy?.modes.includes(value) ?? true}
                  />{' '}
                  {label}
                </label>
              ))}
            </fieldset>
            <label className="field">
              <span className="field__label">最初に選ぶ内容</span>
              <select className="field__control" name="defaultSupportMode">
                {modes.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <input type="checkbox" name="memberMayChoose" defaultChecked /> 参加者が自分で選べる
            </label>
            <label className="field">
              <span className="field__label">参加者への案内</span>
              <input
                className="field__control"
                name="guidance"
                required
                maxLength={1000}
                defaultValue={program.policy?.guidance ?? ''}
                placeholder="例：企画だけでも、作り方つきでも選べます"
              />
            </label>
            <button className="button button--primary" disabled={saving}>
              支援方法を保存
            </button>
          </form>
          <h3>選べる目標</h3>
          <p>
            {program.goals.length
              ? program.goals.map((item) => `${item.name}（${item.unit}）`).join('・')
              : 'まだありません。'}
          </p>
          <form className="form-stack" onSubmit={(event) => goal(event, program.id)}>
            <label className="field">
              <span className="field__label">目標名</span>
              <input
                className="field__control"
                name="name"
                required
                maxLength={160}
                placeholder="例：週3回投稿する"
              />
            </label>
            <label className="field">
              <span className="field__label">説明</span>
              <input
                className="field__control"
                name="description"
                required
                maxLength={1000}
                placeholder="例：まず30日間続けます"
              />
            </label>
            <label className="field">
              <span className="field__label">何を数えるか</span>
              <select className="field__control" name="metricType">
                <option value="ACTION">自分の行動</option>
                <option value="TRAFFIC">見てもらえた結果</option>
                <option value="BUSINESS">仕事につながった結果</option>
              </select>
            </label>
            <label className="field">
              <span className="field__label">単位</span>
              <input
                className="field__control"
                name="unit"
                required
                maxLength={40}
                placeholder="投稿、回、人など"
              />
            </label>
            <label className="field">
              <span className="field__label">おすすめの数（任意）</span>
              <input
                className="field__control"
                name="suggestedTarget"
                type="number"
                min="0.01"
                step="0.01"
              />
            </label>
            <button className="button" disabled={saving}>
              目標候補を追加
            </button>
          </form>
        </section>
      ))}
    </>
  );
}
