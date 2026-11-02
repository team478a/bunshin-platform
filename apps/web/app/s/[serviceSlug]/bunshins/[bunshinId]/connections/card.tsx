'use client';
import { useRef, useState } from 'react';
import {
  externalGrantViewSchema,
  type ExternalGrantOwnerView,
} from '../../../../../../src/external-read-grant-view';
import './connections.css';
const date = (value: string) =>
  new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
export function ExternalGrantOwnerCard({
  endpoint,
  initial,
}: {
  endpoint: string;
  initial: ExternalGrantOwnerView;
}) {
  const [view, setView] = useState(initial),
    [clientId, setClientId] = useState(initial.clients[0]?.id ?? '');
  const [minutes, setMinutes] = useState(60),
    [consent, setConsent] = useState(false),
    [pending, setPending] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const command = useRef<{ key: string; id: string } | null>(null);
  const load = async () => {
    const response = await fetch(endpoint, { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) throw new Error('reload');
    const payload = (await response.json()) as { data?: unknown };
    const parsed = externalGrantViewSchema.safeParse(payload.data);
    if (!parsed.success) throw new Error('reload');
    setView(parsed.data);
    return parsed.data;
  };
  const refresh = async () => {
    setPending(true);
    setError('');
    try {
      await load();
      setMessage('一覧を更新しました。');
    } catch {
      setError('一覧を取得できませんでした。時間をおいて再読込してください。');
    } finally {
      setPending(false);
    }
  };
  const save = async (kind: 'ISSUE' | 'REVOKE', id?: string) => {
    if (pending) return;
    setPending(true);
    setError('');
    setMessage('');
    let saved = false;
    try {
      let body: unknown;
      if (kind === 'ISSUE') {
        if (!consent || !view.clients.some((c) => c.id === clientId)) throw new Error('consent');
        const key = JSON.stringify([clientId, minutes, view.consentVersion]);
        if (command.current?.key !== key) command.current = { key, id: crypto.randomUUID() };
        body = {
          commandId: command.current.id,
          clientId,
          operation: 'member-usage:read',
          expiresInMinutes: minutes,
          consentVersion: view.consentVersion,
        };
      } else {
        const row = view.grants.find((g) => g.id === id);
        if (!row) throw new Error('missing');
        body = { connectionId: row.id, expectedRevision: row.revision };
      }
      const response = await fetch(endpoint, {
        method: kind === 'ISSUE' ? 'POST' : 'DELETE',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        if (response.status === 409) throw new Error('conflict');
        throw new Error('save');
      }
      const ack = (await response.json()) as { data?: { saved?: unknown } };
      if (ack.data?.saved !== true) throw new Error('save');
      saved = true;
      setConsent(false);
      setConfirmation(null);
      if (kind === 'ISSUE') command.current = null;
      setMessage(
        kind === 'ISSUE'
          ? '読取の許可を保存しました。外部サービスとの接続はまだ完了していません。'
          : '読取の許可を解除しました。',
      );
      await load();
    } catch (cause) {
      setError(
        saved
          ? '操作は保存済みですが、一覧の更新に失敗しました。再読込してください。'
          : cause instanceof Error && cause.message === 'conflict'
            ? '状態が変更されています。再読込してから確認してください。'
            : '操作を完了できませんでした。時間をおいて再試行してください。',
      );
    } finally {
      setPending(false);
    }
  };
  const available = view.managementAvailable && view.clients.length > 0;
  return (
    <div className="external-connections" aria-busy={pending}>
      <header>
        <h1>外部サービスの読取許可</h1>
        <p>対象：{view.targetName}</p>
      </header>
      <p>この画面では、外部サービスに見せる情報の範囲と期限を管理します。</p>
      <section aria-labelledby="external-read-scope">
        <h2 id="external-read-scope">許可する情報</h2>
        <p>
          この投稿パートナーの直近7日・30日の利用実績（生成・採用・不採用・投稿完了報告・活動日数）です。投稿完了報告は本人の申告です。
        </p>
        <p>投稿本文・記憶・企業情報・AI原価は含みません。投稿や設定変更の権限は付与しません。</p>
        <p>
          解除後は新たな読取を停止します。外部サービスがすでに取得した情報は、別途そのサービスで削除が必要な場合があります。
        </p>
      </section>
      <section>
        <h2>新しい読取許可</h2>
        {!view.managementAvailable ? (
          <p>この環境では許可管理の準備中です。</p>
        ) : !available ? (
          <p>
            現在、新しい読取許可を発行できる接続先はありません。既存の許可は下から解除できます。
          </p>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void save('ISSUE');
            }}
          >
            <label>
              接続先
              <select
                value={clientId}
                disabled={pending}
                onChange={(event) => {
                  setClientId(event.target.value);
                  setConsent(false);
                }}
              >
                <option value="" disabled>
                  接続先を選ぶ
                </option>
                {view.clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              許可する期間
              <select
                value={minutes}
                disabled={pending}
                onChange={(event) => {
                  setMinutes(Number(event.target.value));
                  setConsent(false);
                }}
              >
                <option value={15}>15分</option>
                <option value={60}>1時間</option>
                <option value={1440}>24時間</option>
              </select>
            </label>
            <label className="external-connections__consent">
              <input
                type="checkbox"
                checked={consent}
                disabled={pending}
                onChange={(event) => setConsent(event.target.checked)}
              />
              <span>
                選択した接続先に、この投稿パートナーの利用実績を選択した期間だけ読み取らせることに同意します。
              </span>
            </label>
            <button
              className="button button--primary"
              disabled={pending || !consent || !view.clients.some((c) => c.id === clientId)}
            >
              同意して読取を許可する
            </button>
            <p>許可の保存だけでは接続は完了しません。外部サービスでの本人認証が別途必要です。</p>
          </form>
        )}
      </section>
      {message ? <p role="status">{message}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      <section>
        <h2>保存済みの許可</h2>
        <p>一覧取得時の状態です。最新50件まで表示します。日時は日本時間です。</p>
        <button
          className="button button--secondary"
          disabled={pending}
          onClick={() => void refresh()}
        >
          一覧を再読込する
        </button>
        {!view.grants.length ? (
          <p>保存済みの許可はありません。</p>
        ) : (
          <ul>
            {view.grants.map((grant) => (
              <li key={grant.id}>
                <h3>{grant.clientName}</h3>
                <p>
                  {grant.state === 'REVOKED'
                    ? '解除済み'
                    : grant.state === 'EXPIRED'
                      ? '期限切れ'
                      : '許可中'}
                </p>
                <p>
                  許可日時：{date(grant.grantedAt)}
                  <br />
                  期限：{date(grant.expiresAt)}
                </p>
                {grant.state !== 'REVOKED' && view.managementAvailable ? (
                  confirmation === grant.id ? (
                    <div>
                      <p>この接続先の読取許可を解除しますか？</p>
                      <button
                        className="button button--primary"
                        disabled={pending}
                        onClick={() => void save('REVOKE', grant.id)}
                      >
                        確認して解除する
                      </button>
                      <button
                        className="button button--secondary"
                        disabled={pending}
                        onClick={() => setConfirmation(null)}
                      >
                        戻る
                      </button>
                    </div>
                  ) : (
                    <button
                      className="button button--secondary"
                      disabled={pending}
                      onClick={() => setConfirmation(grant.id)}
                    >
                      この許可を解除する
                    </button>
                  )
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
