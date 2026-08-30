'use client';

import { useState, type FormEvent } from 'react';
import {
  SERVICE_CREATION_TEMPLATES,
  type ServiceCreationTemplateKey,
} from '../../../../src/services/service-creation-templates';

export function ServiceEditor({ workspaces }: { workspaces: { id: string; name: string }[] }) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [templateKey, setTemplateKey] =
    useState<ServiceCreationTemplateKey>('SIDE_HUSTLE_AFFILIATE');
  const template = SERVICE_CREATION_TEMPLATES[templateKey];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const string = (name: string) => {
      const value = data.get(name);
      return typeof value === 'string' ? value : '';
    };
    setSaving(true);
    setMessage('サービスを作成しています…');
    try {
      const response = await fetch('/api/admin/services', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workspaceId: string('workspaceId'),
          templateKey: string('templateKey'),
          slug: string('slug'),
          displayName: string('displayName'),
          description: string('description'),
          operatorName: string('operatorName'),
          contactEmail: string('contactEmail'),
          visibility: string('visibility'),
          poweredByEnabled: data.has('poweredByEnabled'),
          termsUrl: string('termsUrl'),
          privacyUrl: string('privacyUrl'),
          logoUrl: string('logoUrl'),
          iconUrl: '',
          faviconUrl: '',
          primaryColor: string('primaryColor'),
          secondaryColor: string('secondaryColor'),
          fontFamily: 'system-ui',
          registrationMode: string('registrationMode'),
          emailEnabled: data.has('emailEnabled'),
          lineEnabled: data.has('lineEnabled'),
          inviteCodeEnabled: data.has('inviteCodeEnabled'),
          referralEnabled: data.has('referralEnabled'),
          reason: string('reason'),
        }),
      });
      const result = (await response.json()) as { error?: { message?: string } };
      if (!response.ok)
        throw new Error(result.error?.message ?? 'サービスを作成できませんでした。');
      setMessage('サービスを作成しました。画面を更新します…');
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'サービスを作成できませんでした。');
      setSaving(false);
    }
  }

  return (
    <section className="settings-card">
      <h2>新しいサービスを作る</h2>
      <p>名前・専用URL・登録方法をまとめて保存します。作成直後は非公開をおすすめします。</p>
      <label>
        サービスの種類
        <select
          value={templateKey}
          onChange={(event) => setTemplateKey(event.target.value as ServiceCreationTemplateKey)}
          disabled={saving}
        >
          {Object.entries(SERVICE_CREATION_TEMPLATES).map(([key, value]) => (
            <option key={key} value={key}>
              {value.label}
            </option>
          ))}
        </select>
        <small>{template.description}</small>
      </label>
      <form key={templateKey} onSubmit={(event) => void submit(event)} className="admin-form-grid">
        <input type="hidden" name="templateKey" value={templateKey} />
        <label>
          運営する団体
          <select name="workspaceId" required>
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          サービス名
          <input name="displayName" required maxLength={120} />
        </label>
        <label>
          専用URL名
          <input
            name="slug"
            required
            maxLength={80}
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            placeholder="side-job-support"
          />
          <small>小文字の英数字とハイフンだけで入力します。</small>
        </label>
        <label>
          運営者名
          <input name="operatorName" required maxLength={160} />
        </label>
        <label>
          サービス説明
          <textarea name="description" required maxLength={1000} rows={3} />
        </label>
        <label>
          問い合わせメール
          <input name="contactEmail" type="email" maxLength={320} />
        </label>
        <label>
          公開状態
          <select name="visibility" defaultValue="PRIVATE">
            <option value="PRIVATE">準備中（非公開）</option>
            <option value="PUBLIC">公開</option>
          </select>
        </label>
        <label>
          登録方法
          <select name="registrationMode" defaultValue={template.registrationMode}>
            <option value="INVITATION_ONLY">招待された人だけ</option>
            <option value="PUBLIC">誰でも登録できる</option>
            <option value="APPROVAL_REQUIRED">管理者の承認が必要</option>
            <option value="CLOSED">新しい登録を止める</option>
          </select>
        </label>
        <label>
          ロゴ画像URL
          <input name="logoUrl" type="url" placeholder="https://..." />
        </label>
        <label>
          メインカラー
          <input name="primaryColor" type="color" defaultValue="#0b356a" />
        </label>
        <label>
          サブカラー
          <input name="secondaryColor" type="color" defaultValue="#ff3b30" />
        </label>
        <label>
          利用規約URL
          <input name="termsUrl" type="url" placeholder="https://..." />
        </label>
        <label>
          プライバシーポリシーURL
          <input name="privacyUrl" type="url" placeholder="https://..." />
        </label>
        <fieldset>
          <legend>登録に使う方法</legend>
          <label>
            <input name="emailEnabled" type="checkbox" defaultChecked={template.emailEnabled} />{' '}
            メール
          </label>
          <label>
            <input name="lineEnabled" type="checkbox" defaultChecked={template.lineEnabled} /> LINE
          </label>
          <label>
            <input
              name="inviteCodeEnabled"
              type="checkbox"
              defaultChecked={template.inviteCodeEnabled}
            />{' '}
            招待コード
          </label>
          <label>
            <input
              name="referralEnabled"
              type="checkbox"
              defaultChecked={template.referralEnabled}
            />{' '}
            紹介元を記録
          </label>
        </fieldset>
        <label>
          <input name="poweredByEnabled" type="checkbox" defaultChecked /> 「Powered by
          ワタシワークス」を表示する
        </label>
        <label>
          作成理由
          <input name="reason" required maxLength={1000} placeholder="例：第一号サービスの準備" />
        </label>
        <button type="submit" disabled={saving}>
          {saving ? '作成中…' : 'サービスを作成する'}
        </button>
      </form>
      <p role="status" aria-live="polite">
        {message}
      </p>
    </section>
  );
}
