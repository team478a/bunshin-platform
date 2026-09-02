'use client';
import { useState } from 'react';

type Item = {
  id: string;
  version: number;
  status: string;
  webhookRoutingKey: string;
  loginChannelId: string;
  loginSecretMask: string;
  messagingChannelId: string;
  messagingSecretMask: string;
  accessTokenMask: string;
  liffId: string | null;
  globallyPaused: boolean;
  lastVerifiedAt: string | null;
  lastErrorCategory: string | null;
  createdAt: string;
  updatedAt: string;
};

type Mode = 'SHARED' | 'DEDICATED' | 'DISABLED';
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
const stringValue = (value: FormDataEntryValue | null) => (typeof value === 'string' ? value : '');
const isMode = (value: unknown): value is Mode =>
  value === 'SHARED' || value === 'DEDICATED' || value === 'DISABLED';

async function responsePayload(response: Response): Promise<Record<string, unknown>> {
  const parsed = JSON.parse(await response.text()) as unknown;
  return isRecord(parsed) ? parsed : {};
}

export function GroupLineEditor(props: {
  workspaceId: string;
  groupId: string;
  environment: string;
  webhookOrigin: string;
  initialMode: Mode;
  initialConfigurations: Item[];
  endpoint?: string;
  scopeLabel?: string;
}) {
  const [mode, setMode] = useState(props.initialMode);
  const [items, setItems] = useState(props.initialConfigurations);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const endpoint = props.endpoint ?? `/api/admin/groups/${props.groupId}/line-configurations`;
  const scopeLabel = props.scopeLabel ?? 'グループ';
  async function call(url: string, method: string, data: unknown) {
    setBusy(true);
    setMessage('処理しています…');
    try {
      const response = await fetch(url, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
      });
      const payload = await responsePayload(response);
      const error = isRecord(payload['error']) ? payload['error'] : null;
      if (!response.ok)
        throw new Error(
          typeof error?.['message'] === 'string' ? error['message'] : '操作できませんでした',
        );
      setMessage('保存しました。');
      return payload['data'] ?? null;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '操作できませんでした');
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function reload() {
    const response = await fetch(`${endpoint}?workspaceId=${props.workspaceId}`, {
      cache: 'no-store',
    });
    if (response.ok) {
      const payload = await responsePayload(response);
      const data = isRecord(payload['data']) ? payload['data'] : null;
      if (data && Array.isArray(data['configurations'])) setItems(data['configurations'] as Item[]);
      if (data && isMode(data['mode'])) setMode(data['mode']);
    }
  }
  return (
    <>
      <section className="settings-card line-settings-card">
        <p className="eyebrow">1. 使い方を選ぶ</p>
        <h2>どのLINEを使いますか</h2>
        <p>
          「この{scopeLabel}
          専用」を選ぶと、共通LINEと分けて運用できます。初めて専用LINEを設定する場合は、先にこれを選んで保存してください。
        </p>
        <form
          className="form-stack"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            const selected = stringValue(form.get('mode'));
            if (!isMode(selected)) return;
            void call(`${endpoint}/policy`, 'PUT', {
              workspaceId: props.workspaceId,
              mode: selected,
              reason: stringValue(form.get('reason')),
            }).then((result) => {
              if (isRecord(result) && isMode(result['mode'])) setMode(result['mode']);
            });
          }}
        >
          <label className="field">
            <select
              className="field__control"
              name="mode"
              value={mode}
              onChange={(e) => setMode(e.target.value as typeof mode)}
            >
              <option value="SHARED">ワタシワークス共通LINE</option>
              <option value="DEDICATED">この{scopeLabel}専用LINE</option>
              <option value="DISABLED">LINEを使わない</option>
            </select>
          </label>{' '}
          <label className="field">
            <span className="field__label">変更理由</span>
            <input
              className="field__control"
              name="reason"
              required
              minLength={3}
              placeholder="例：テスト運用を開始"
            />
          </label>
          <button className="button button--primary" disabled={busy}>
            使い方を保存
          </button>
        </form>
      </section>
      {mode === 'DEDICATED' && (
        <section className="settings-card line-settings-card">
          <p className="eyebrow">2. 専用LINEの値を保存する</p>
          <h2>新しい専用LINE設定</h2>
          <p>
            LINE
            Developersで発行された値を入力します。Secretとアクセストークンは保存後にもう一度表示できません。
          </p>
          <form
            className="form-stack"
            onSubmit={(event) => {
              event.preventDefault();
              const f = new FormData(event.currentTarget);
              const target = event.currentTarget;
              void call(endpoint, 'POST', {
                workspaceId: props.workspaceId,
                reason: stringValue(f.get('reason')),
                loginChannelId: stringValue(f.get('loginChannelId')),
                loginChannelSecret: stringValue(f.get('loginChannelSecret')),
                messagingChannelId: stringValue(f.get('messagingChannelId')),
                messagingChannelSecret: stringValue(f.get('messagingChannelSecret')),
                channelAccessToken: stringValue(f.get('channelAccessToken')),
                liffId: stringValue(f.get('liffId')) || null,
                quotaWarningPercent: 80,
                quotaLowPriorityStop: 90,
              }).then(async (result) => {
                if (result) {
                  target.reset();
                  await reload();
                }
              });
            }}
          >
            <label className="field">
              <span className="field__label">変更理由</span>
              <input
                className="field__control"
                name="reason"
                required
                minLength={3}
                placeholder="例：公式LINEを新しく接続"
              />
            </label>
            <label className="field">
              <span className="field__label">LINEログイン用チャネルID</span>
              <input className="field__control" name="loginChannelId" required />
            </label>
            <label className="field">
              <span className="field__label">LINEログイン用チャネルシークレット</span>
              <input
                className="field__control"
                name="loginChannelSecret"
                type="password"
                required
              />
            </label>
            <label className="field">
              <span className="field__label">通知用チャネルID（Messaging API）</span>
              <input className="field__control" name="messagingChannelId" required />
            </label>
            <label className="field">
              <span className="field__label">通知用チャネルシークレット（Messaging API）</span>
              <input
                className="field__control"
                name="messagingChannelSecret"
                type="password"
                required
              />
            </label>
            <label className="field">
              <span className="field__label">通知用アクセストークン</span>
              <input
                className="field__control"
                name="channelAccessToken"
                type="password"
                required
              />
            </label>
            <label className="field">
              <span className="field__label">LIFF ID（LINE内画面を使う場合のみ）</span>
              <input className="field__control" name="liffId" />
            </label>
            <button className="button button--primary" disabled={busy}>
              停止中の設定として保存
            </button>
          </form>
        </section>
      )}
      <section className="settings-card line-settings-card">
        <p className="eyebrow">3. 接続を確認して運用を始める</p>
        <h2>保存した設定</h2>
        {items.length === 0 ? (
          <p>まだ設定はありません。</p>
        ) : (
          <ul className="plain-list line-settings-list">
            {items.map((item) => (
              <li key={item.id}>
                <strong className="line-settings-list__status">
                  第{item.version}版：
                  {item.status === 'ACTIVE'
                    ? '使用中'
                    : item.status === 'ERROR'
                      ? '確認エラー'
                      : '停止中'}
                </strong>
                <p>
                  接続確認：{item.lastVerifiedAt ? '確認済み' : 'まだ確認していません'}／Login：
                  {item.loginSecretMask}／Messaging：{item.messagingSecretMask}／Token：
                  {item.accessTokenMask}
                </p>
                <p>
                  Webhook：
                  <code>{`${props.webhookOrigin}/api/line/groups/${item.webhookRoutingKey}/webhook`}</code>
                </p>
                <button
                  className="button button--secondary"
                  disabled={busy}
                  onClick={() => {
                    void call(`${endpoint}/${item.id}/test`, 'POST', {
                      workspaceId: props.workspaceId,
                    }).then(reload);
                  }}
                >
                  接続できるか確認
                </button>{' '}
                <button
                  className="button button--primary"
                  disabled={busy || !item.lastVerifiedAt || item.lastErrorCategory !== null}
                  onClick={() => {
                    const reason = window.prompt('使用を開始する理由を入力してください');
                    if (reason) {
                      void call(`${endpoint}/${item.id}/activate`, 'POST', {
                        workspaceId: props.workspaceId,
                        reason,
                      }).then(reload);
                    }
                  }}
                >
                  使用を開始
                </button>
              </li>
            ))}
          </ul>
        )}
        {message ? (
          <p className="notice notice--success" role="status">
            {message}
          </p>
        ) : null}
      </section>
    </>
  );
}
