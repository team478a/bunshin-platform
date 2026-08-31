'use client';
import { useState, type FormEvent } from 'react';
const labels: Record<string, string> = {
  IDEA_ONLY: '企画だけほしい',
  GUIDED: '作り方も教えてほしい',
  READY_TO_USE: 'そのまま使えるものがほしい',
};
export function MemberProgramsEditor({
  serviceSlug,
  items,
}: {
  serviceSlug: string;
  items: {
    enrollmentId: string;
    name: string;
    guidance: string;
    modes: string[];
    memberMayChoose: boolean;
    preferredMode: string;
    notes: string;
    currentGoal: string | null;
    definitions: { id: string; name: string; metricType: string; unit: string; target: string }[];
  }[];
}) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const text = (data: FormData, name: string) => {
    const value = data.get(name);
    return typeof value === 'string' ? value : '';
  };
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
  const preference = (event: FormEvent<HTMLFormElement>, enrollmentId: string) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void send(
      {
        action: 'SAVE_PREFERENCE',
        programEnrollmentId: enrollmentId,
        preferredSupportMode: text(data, 'preferredSupportMode'),
        notes: text(data, 'notes'),
      },
      '希望を保存しました。',
    );
  };
  const goal = (
    event: FormEvent<HTMLFormElement>,
    enrollmentId: string,
    definitions: (typeof items)[number]['definitions'],
  ) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const selected = definitions.find((item) => item.id === text(data, 'goalDefinitionId'));
    if (!selected) return;
    const date = text(data, 'dueAt');
    void send(
      {
        action: 'SET_MEMBER_GOAL',
        programEnrollmentId: enrollmentId,
        goalDefinitionId: selected.id,
        title: selected.name,
        metricType: selected.metricType,
        targetValue: Number(text(data, 'targetValue')),
        unit: selected.unit,
        dueAt: date ? new Date(`${date}T23:59:59+09:00`).toISOString() : null,
      },
      '目標を保存しました。',
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
      {items.length === 0 ? (
        <section className="settings-card">
          <p>参加中のプログラムはありません。</p>
        </section>
      ) : null}
      {items.map((item) => (
        <section className="settings-card" key={item.enrollmentId}>
          <h2>{item.name}</h2>
          <p>{item.guidance}</p>
          {item.memberMayChoose ? (
            <form className="form-stack" onSubmit={(event) => preference(event, item.enrollmentId)}>
              <label className="field">
                <span className="field__label">どんな形でほしいですか？</span>
                <select
                  className="field__control"
                  name="preferredSupportMode"
                  defaultValue={item.preferredMode}
                >
                  {item.modes.map((mode) => (
                    <option key={mode} value={mode}>
                      {labels[mode] ?? mode}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field__label">伝えておきたいこと（任意）</span>
                <input
                  className="field__control"
                  name="notes"
                  maxLength={500}
                  defaultValue={item.notes}
                  placeholder="例：動画づくりは初めてです"
                />
              </label>
              <button className="button" disabled={saving}>
                希望を保存
              </button>
            </form>
          ) : (
            <p>渡す内容はサービス運営者が設定しています。</p>
          )}
          <h3>今の目標</h3>
          <p>{item.currentGoal ?? 'まだ目標を決めていません。'}</p>
          {item.definitions.length ? (
            <form
              className="form-stack"
              onSubmit={(event) => goal(event, item.enrollmentId, item.definitions)}
            >
              <label className="field">
                <span className="field__label">目標を選ぶ</span>
                <select className="field__control" name="goalDefinitionId">
                  {item.definitions.map((definition) => (
                    <option key={definition.id} value={definition.id}>
                      {definition.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field__label">目指す数</span>
                <input
                  className="field__control"
                  name="targetValue"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  defaultValue={item.definitions[0]?.target}
                />
              </label>
              <label className="field">
                <span className="field__label">いつまでに（任意）</span>
                <input className="field__control" name="dueAt" type="date" />
              </label>
              <button className="button button--primary" disabled={saving}>
                この目標にする
              </button>
            </form>
          ) : (
            <p>選べる目標を準備中です。</p>
          )}
        </section>
      ))}
    </>
  );
}
