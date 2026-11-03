type Connection = {
  id: string;
  displayName: string;
  status: string;
  tokenExpiresAt: Date | null;
};

const messages: Record<string, string> = {
  connected: 'Instagramアカウントを接続しました。',
  disconnected: 'この投稿パートナーからInstagram接続を解除しました。',
  cancelled: 'Instagramでの承認をキャンセルしました。',
  expired: '接続操作の有効期限が切れました。もう一度お試しください。',
  unavailable: 'Instagramへ接続できませんでした。設定と権限を確認して再度お試しください。',
};

const date = (value: Date) =>
  new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);

export function InstagramConnectionCard({
  serviceSlug,
  bunshinId,
  connections,
  result,
}: {
  serviceSlug: string;
  bunshinId: string;
  connections: Connection[] | null;
  result?: string | undefined;
}) {
  const start = `/api/services/${serviceSlug}/bunshins/${bunshinId}/instagram-connection/start`;
  return (
    <div className="external-connections">
      <section aria-labelledby="instagram-connection-heading">
        <h1 id="instagram-connection-heading">Instagram公式API接続</h1>
        <p>
          投稿に使うInstagramアカウントの資格情報です。外部AIへの読取許可や発信設定とは分けて管理します。
        </p>
        {result && messages[result] ? <p role="status">{messages[result]}</p> : null}
        {connections === null ? (
          <p role="alert">現在の会員状態またはSOCIAL権限ではInstagram接続を利用できません。</p>
        ) : connections.length === 0 ? (
          <>
            <p>接続済みのアカウントはありません。</p>
            <form action={start} method="post">
              <button className="button button--primary" type="submit">
                Instagramを接続
              </button>
            </form>
          </>
        ) : (
          <ul>
            {connections.map((connection) => (
              <li key={connection.id}>
                <strong>@{connection.displayName}</strong>
                <p>
                  {connection.status === 'CONNECTED'
                    ? `接続中${connection.tokenExpiresAt ? `（有効期限 ${date(connection.tokenExpiresAt)}）` : ''}`
                    : '再接続が必要です'}
                </p>
                {connection.status !== 'CONNECTED' ? (
                  <form action={start} method="post">
                    <button className="button button--primary" type="submit">
                      再接続
                    </button>
                  </form>
                ) : null}
                <form
                  action={`/api/services/${serviceSlug}/bunshins/${bunshinId}/instagram-connections/${connection.id}/disconnect`}
                  method="post"
                >
                  <button className="button button--secondary" type="submit">
                    この投稿パートナーから解除
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
