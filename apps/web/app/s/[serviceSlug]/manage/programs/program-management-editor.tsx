'use client';

import { useState, type FormEvent } from 'react';

type SupportMode = 'IDEA_ONLY' | 'GUIDED' | 'READY_TO_USE';
const labels: Record<SupportMode, string> = {
  IDEA_ONLY: '企画だけ',
  GUIDED: '作り方・台本・プロンプト',
  READY_TO_USE: 'そのまま使える完成品',
};

export function ProgramManagementEditor({
  serviceSlug,
  available,
  programs,
  members,
}: {
  serviceSlug: string;
  available: {
    versionId: string;
    name: string;
    description: string;
    supportModes: SupportMode[];
  }[];
  programs: {
    id: string;
    name: string;
    description: string;
    offeringId: string;
    supportModes: SupportMode[];
    enrolledMembershipIds: string[];
  }[];
  members: { id: string; name: string; email: string | null }[];
}) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  async function request(path: string, body: unknown, success: string) {
    setSaving(true);
    setMessage('保存しています…');
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message ?? '保存できませんでした。');
      setMessage(`${success} 画面を更新します…`);
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存できませんでした。');
      setSaving(false);
    }
  }

  function adopt(event: FormEvent<HTMLFormElement>, item: (typeof available)[number]) {
    event.preventDefault();
    void request(
      `/api/services/${serviceSlug}/programs`,
      {
        programTemplateVersionId: item.versionId,
        displayName: item.name,
        description: item.description,
        supportModes: item.supportModes,
      },
      'このサービスで使えるようにしました。',
    );
  }

  function enroll(event: FormEvent<HTMLFormElement>, program: (typeof programs)[number]) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (name: string) => {
      const value = data.get(name);
      return typeof value === 'string' ? value : '';
    };
    void request(
      `/api/services/${serviceSlug}/programs/${program.id}/enrollments`,
      {
        groupMembershipId: text('groupMembershipId'),
        programOfferingId: program.offeringId,
        supportMode: text('supportMode'),
        goal: text('goal'),
      },
      '参加者をプログラムへ登録しました。',
    );
  }

  return (
    <>
      <p
        role="status"
        aria-live="polite"
        className={message ? 'notice notice--success' : undefined}
      >
        {message}
      </p>
      <section className="settings-card">
        <h2>利用できる公式プログラム</h2>
        <p>「このサービスで使う」を押すまでは、参加者には表示されません。</p>
        {available.length === 0 ? <p>追加できる公式プログラムはありません。</p> : null}
        <div className="settings-stack">
          {available.map((item) => (
            <article key={item.versionId}>
              <h3>{item.name}</h3>
              <p>{item.description}</p>
              <p>渡せる内容：{item.supportModes.map((mode) => labels[mode]).join('・')}</p>
              <form onSubmit={(event) => adopt(event, item)}>
                <button className="button button--primary" type="submit" disabled={saving}>
                  このサービスで使う
                </button>
              </form>
            </article>
          ))}
        </div>
      </section>
      <section className="settings-card">
        <h2>サービスで提供中のプログラム</h2>
        {programs.length === 0 ? <p>提供中のプログラムはありません。</p> : null}
        <div className="settings-stack">
          {programs.map((program) => {
            const eligible = members.filter(
              (member) => !program.enrolledMembershipIds.includes(member.id),
            );
            return (
              <article key={program.id}>
                <h3>{program.name}</h3>
                <p>{program.description}</p>
                <p>参加中：{program.enrolledMembershipIds.length}人</p>
                {eligible.length === 0 ? (
                  <p>登録できる参加者はいません。</p>
                ) : (
                  <form className="form-stack" onSubmit={(event) => enroll(event, program)}>
                    <label className="field">
                      <span className="field__label">参加者</span>
                      <select className="field__control" name="groupMembershipId" required>
                        {eligible.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.name}
                            {member.email ? `（${member.email}）` : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span className="field__label">渡す内容</span>
                      <select className="field__control" name="supportMode" required>
                        {program.supportModes.map((mode) => (
                          <option key={mode} value={mode}>
                            {labels[mode]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span className="field__label">この人の目標（あとで本人が変更できます）</span>
                      <input
                        className="field__control"
                        name="goal"
                        maxLength={500}
                        placeholder="例：週3回投稿を30日続ける"
                      />
                    </label>
                    <button className="button" type="submit" disabled={saving}>
                      この人を無料で参加登録する
                    </button>
                  </form>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}
