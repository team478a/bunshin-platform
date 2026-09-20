'use client';

import { useState, type FormEvent } from 'react';

type Template = {
  id: string;
  channel: 'EMAIL' | 'LINE';
  purpose: 'REGISTRATION_COMPLETE' | 'REMINDER' | 'WEEKLY_REPORT' | 'GENERAL_ANNOUNCEMENT';
  name: string;
  subject: string | null;
  body: string;
  isActive: boolean;
};

const purposeLabels: Record<Template['purpose'], string> = {
  REGISTRATION_COMPLETE: '登録完了',
  REMINDER: '行動リマインド',
  WEEKLY_REPORT: '週次レポート',
  GENERAL_ANNOUNCEMENT: '任意のお知らせ',
};

export function ServiceMessageTemplateEditor({
  serviceSlug,
  initialTemplates,
}: {
  serviceSlug: string;
  initialTemplates: Template[];
}) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [editing, setEditing] = useState<Template | null>(null);
  const [message, setMessage] = useState('');
  const endpoint = `/api/services/${encodeURIComponent(serviceSlug)}/message-templates`;

  async function reload() {
    const response = await fetch(endpoint);
    if (response.ok) setTemplates(((await response.json()) as { data: Template[] }).data);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const channel = String(form.get('channel')) as Template['channel'];
    const body = {
      ...(editing ? { id: editing.id } : {}),
      channel,
      purpose: String(form.get('purpose')),
      name: String(form.get('name')),
      subject: channel === 'EMAIL' ? String(form.get('subject')) : '',
      body: String(form.get('body')),
      isActive: form.has('isActive'),
    };
    setMessage('保存しています…');
    const response = await fetch(endpoint, {
      method: editing ? 'PATCH' : 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      setMessage('保存できませんでした。必須項目を確認してください。');
      return;
    }
    setMessage('保存しました。');
    setEditing(null);
    await reload();
  }
  async function archive(id: string) {
    if (!window.confirm('このテンプレートを停止します。')) return;
    const response = await fetch(endpoint, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    setMessage(response.ok ? 'テンプレートを停止しました。' : '停止できませんでした。');
    if (response.ok) await reload();
  }
  const value = editing ?? {
    channel: 'EMAIL' as const,
    purpose: 'REGISTRATION_COMPLETE' as const,
    name: '',
    subject: '',
    body: '',
    isActive: true,
  };
  return (
    <>
      <section className="settings-card">
        <h2>{editing ? 'テンプレートを編集' : 'テンプレートを追加'}</h2>
        <p>登録完了・リマインド・週次レポート・任意案内の文面を、サービスごとに保管できます。</p>
        <form
          className="admin-form-grid"
          onSubmit={(event) => void save(event)}
          key={editing?.id ?? 'new'}
        >
          <label>
            配信方法
            <select name="channel" defaultValue={value.channel}>
              <option value="EMAIL">メール</option>
              <option value="LINE">LINE</option>
            </select>
          </label>
          <label>
            用途
            <select name="purpose" defaultValue={value.purpose}>
              {Object.entries(purposeLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            管理用の名前
            <input
              name="name"
              required
              maxLength={120}
              defaultValue={value.name}
              placeholder="例：登録完了のご案内"
            />
          </label>
          <label>
            メール件名
            <input
              name="subject"
              maxLength={200}
              defaultValue={value.subject ?? ''}
              placeholder="LINEでは空欄にします"
            />
          </label>
          <label>
            本文
            <textarea name="body" required maxLength={10000} rows={8} defaultValue={value.body} />
            <small>
              {'{{name}}'} と {'{{serviceName}}'} を使えます。
            </small>
          </label>
          <label className="field field--checkbox">
            <input name="isActive" type="checkbox" defaultChecked={value.isActive} />
            <span>利用可能にする</span>
          </label>
          <button type="submit">{editing ? '変更を保存する' : 'テンプレートを保存する'}</button>
          {editing ? (
            <button type="button" onClick={() => setEditing(null)}>
              編集をやめる
            </button>
          ) : null}
        </form>
        <p role="status" aria-live="polite">
          {message}
        </p>
      </section>
      <section className="settings-card">
        <h2>保存済みテンプレート</h2>
        {templates.length ? (
          <ul>
            {templates.map((template) => (
              <li key={template.id}>
                <strong>{template.name}</strong>（{template.channel === 'EMAIL' ? 'メール' : 'LINE'}
                ／{purposeLabels[template.purpose]}／{template.isActive ? '利用中' : '停止中'}）{' '}
                <button type="button" onClick={() => setEditing(template)}>
                  編集
                </button>
                {template.isActive ? (
                  <button type="button" onClick={() => void archive(template.id)}>
                    停止
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p>まだテンプレートはありません。</p>
        )}
      </section>
    </>
  );
}
