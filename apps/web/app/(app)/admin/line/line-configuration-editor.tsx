'use client';
import { useState, type FormEvent } from 'react';
import type { LineEndpointUrls } from '../../../../src/line/secure-configuration';

type Configuration = {
  id: string;
  version: number;
  status: 'DRAFT' | 'ACTIVE' | 'DISABLED' | 'ERROR';
  loginChannelId: string;
  loginSecretMask: string;
  messagingChannelId: string;
  messagingSecretMask: string;
  accessTokenMask: string;
  liffId: string | null;
  defaultNotificationTime: string;
  defaultTimezone: string;
  quietHoursStart: string;
  quietHoursEnd: string;
  globallyPaused: boolean;
  quotaWarningPercent: number;
  quotaLowPriorityStop: number;
  lastVerifiedAt: string | null;
  lastErrorCategory: string | null;
};

export function LineConfigurationEditor(props: {
  environment: string;
  urls: LineEndpointUrls;
  initialConfigurations: Configuration[];
}) {
  const [configurations, setConfigurations] = useState(props.initialConfigurations);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    const value = Object.fromEntries(form.entries());
    const response = await fetch('/api/admin/line-configurations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        reason: value.reason,
        loginChannelId: value.loginChannelId,
        loginChannelSecret: value.loginChannelSecret,
        messagingChannelId: value.messagingChannelId,
        messagingChannelSecret: value.messagingChannelSecret,
        channelAccessToken: value.channelAccessToken,
        liffId: value.liffId || null,
        defaultNotificationTime: value.defaultNotificationTime,
        defaultTimezone: value.defaultTimezone,
        quietHoursStart: value.quietHoursStart,
        quietHoursEnd: value.quietHoursEnd,
        globallyPaused: form.get('globallyPaused') === 'on',
        quotaWarningPercent: Number(value.quotaWarningPercent),
        quotaLowPriorityStop: Number(value.quotaLowPriorityStop),
      }),
    });
    const result = (await response.json()) as {
      data?: Configuration;
      error?: { message?: string };
    };
    if (!response.ok || !result.data) setMessage(result.error?.message ?? '保存できませんでした。');
    else {
      setConfigurations((current) => [result.data!, ...current]);
      setMessage('新しい下書きを保存しました。');
      event.currentTarget.reset();
    }
    setBusy(false);
  }

  async function action(id: string, name: 'activate' | 'test') {
    const reason = name === 'activate' ? window.prompt('変更理由を入力してください。') : '';
    if (name === 'activate' && !reason) return;
    if (
      name === 'activate' &&
      props.environment === 'PRODUCTION' &&
      !window.confirm('本番で使う設定を変更します。内容と接続テストの結果を確認しましたか？')
    )
      return;
    setBusy(true);
    const response = await fetch(`/api/admin/line-configurations/${id}/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      ...(name === 'activate' ? { body: JSON.stringify({ reason }) } : {}),
    });
    const result = (await response.json()) as {
      data?: Configuration | { success: boolean; botDisplayName: string | null };
      error?: { message?: string };
    };
    if (!response.ok || !result.data) setMessage(result.error?.message ?? '操作できませんでした。');
    else if (name === 'activate') {
      const updated = result.data as Configuration;
      setConfigurations((current) =>
        current.map((item) =>
          item.id === id
            ? updated
            : item.status === 'ACTIVE'
              ? { ...item, status: 'DISABLED' }
              : item,
        ),
      );
      setMessage('本番で使う設定を切り替えました。');
    } else {
      const tested = result.data as { success: boolean; botDisplayName: string | null };
      setMessage(
        tested.success
          ? `接続成功：${tested.botDisplayName ?? 'LINE公式アカウント'}`
          : '接続テストに失敗しました。',
      );
    }
    setBusy(false);
  }

  return (
    <section>
      <h2>登録URL（読み取り専用）</h2>
      <dl>
        {Object.entries(props.urls).map(([name, value]) => (
          <div key={name}>
            <dt>{name}</dt>
            <dd>
              <code>{value}</code>
            </dd>
          </div>
        ))}
      </dl>
      {message ? <p role="status">{message}</p> : null}
      <h2>新しい設定版</h2>
      <form onSubmit={(event) => void create(event)}>
        <label>
          変更理由
          <input name="reason" required minLength={3} maxLength={500} />
        </label>
        <label>
          LINE Login Channel ID
          <input name="loginChannelId" required />
        </label>
        <label>
          LINE Login Channel Secret
          <input name="loginChannelSecret" type="password" required />
        </label>
        <label>
          Messaging Channel ID
          <input name="messagingChannelId" required />
        </label>
        <label>
          Messaging Channel Secret
          <input name="messagingChannelSecret" type="password" required />
        </label>
        <label>
          Channel Access Token
          <input name="channelAccessToken" type="password" required />
        </label>
        <label>
          LIFF ID
          <input name="liffId" />
        </label>
        <label>
          通知初期時刻
          <input name="defaultNotificationTime" type="time" defaultValue="08:00" required />
        </label>
        <label>
          標準の地域時間
          <input name="defaultTimezone" defaultValue="Asia/Tokyo" required />
        </label>
        <label>
          通知を休む時間の開始
          <input name="quietHoursStart" type="time" defaultValue="21:00" required />
        </label>
        <label>
          通知を休む時間の終了
          <input name="quietHoursEnd" type="time" defaultValue="07:00" required />
        </label>
        <label>
          全体停止
          <input name="globallyPaused" type="checkbox" />
        </label>
        <label>
          警告率
          <input
            name="quotaWarningPercent"
            type="number"
            defaultValue="80"
            min="1"
            max="99"
            required
          />
        </label>
        <label>
          低優先通知停止率
          <input
            name="quotaLowPriorityStop"
            type="number"
            defaultValue="90"
            min="2"
            max="100"
            required
          />
        </label>
        <button disabled={busy} type="submit">
          下書きを保存
        </button>
      </form>
      <h2>設定履歴</h2>
      <ul>
        {configurations.map((item) => (
          <li key={item.id}>
            <strong>
              第{item.version}版 ／{' '}
              {item.status === 'DRAFT'
                ? '下書き'
                : item.status === 'ACTIVE'
                  ? '使用中'
                  : item.status === 'DISABLED'
                    ? '停止中'
                    : 'エラー'}
            </strong>
            <p>
              Login: {item.loginChannelId} / {item.loginSecretMask}
            </p>
            <p>
              Messaging: {item.messagingChannelId} / {item.messagingSecretMask} /{' '}
              {item.accessTokenMask}
            </p>
            <p>
              最終確認：{item.lastVerifiedAt ?? '未確認'} ／{' '}
              {item.lastErrorCategory ?? 'エラーなし'}
            </p>
            <button disabled={busy} onClick={() => void action(item.id, 'test')}>
              接続テスト
            </button>
            {item.status !== 'ACTIVE' ? (
              <button disabled={busy} onClick={() => void action(item.id, 'activate')}>
                この設定を使う
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
