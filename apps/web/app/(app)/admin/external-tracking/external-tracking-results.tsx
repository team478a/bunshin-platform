import type {
  ExternalTrackingConfiguration,
  ExternalTrackingResultConnection,
} from './external-tracking-types';

type Props = {
  base: string;
  busy: boolean;
  groupId: string;
  resultConnection: ExternalTrackingResultConnection | null;
  results: ExternalTrackingConfiguration['results'];
  resultTotals: ExternalTrackingConfiguration['resultTotals'];
  systems: ExternalTrackingConfiguration['systems'];
  onCopyText: (value: string, successMessage: string) => Promise<void>;
  onCreateResultConnection: (systemId: string) => Promise<void>;
};

export function ExternalTrackingResults({
  base,
  busy,
  groupId,
  resultConnection,
  results,
  resultTotals,
  systems,
  onCopyText,
  onCreateResultConnection,
}: Props) {
  return (
    <section className="settings-card" id="tracking-results">
      <p className="eyebrow">成果の自動取得</p>
      <h2>外部サービスから成果を受け取る</h2>
      <p>
        外部サービス側に受取URLと秘密キーを登録すると、クリック・申込・購入などの成果が自動でここへ届きます。
      </p>
      {systems.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>外部サービス</th>
                <th>接続状態</th>
                <th>最終受信</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {systems.map((system) => (
                <tr key={system.id}>
                  <td>{system.name}</td>
                  <td>
                    {system.resultIngestTokenPrefix
                      ? `設定済み（${system.resultIngestTokenPrefix}…）`
                      : '未設定'}
                  </td>
                  <td>
                    {system.lastResultReceivedAt
                      ? new Date(system.lastResultReceivedAt).toLocaleString('ja-JP')
                      : 'まだ受信していません'}
                  </td>
                  <td>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void onCreateResultConnection(system.id)}
                    >
                      {system.resultIngestTokenPrefix ? '秘密キーを作り直す' : '自動取得を設定する'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>先に外部サービスを登録してください。</p>
      )}
      {resultConnection && (
        <div className="notice" role="status">
          <strong>外部サービス側へ登録する情報</strong>
          <p>
            受取URL：<code>{resultConnection.endpointUrl}</code>
          </p>
          <p>
            秘密キー：<code>{resultConnection.token}</code>
          </p>
          <p>
            認証方法：<code>Authorization: Bearer 秘密キー</code>
          </p>
          <button
            type="button"
            onClick={() => void onCopyText(resultConnection.token, '秘密キーをコピーしました。')}
          >
            秘密キーをコピー
          </button>
          <button
            type="button"
            onClick={() =>
              void onCopyText(resultConnection.endpointUrl, '受取URLをコピーしました。')
            }
          >
            受取URLをコピー
          </button>
          <p>この秘密キーは画面を閉じると再表示できません。</p>
        </div>
      )}
      <details>
        <summary>外部サービスから送るデータ形式</summary>
        <p>1回に最大500件をJSONで送信できます。同じ成果IDは二重登録されません。</p>
        <pre>
          <code>{`{
  "records": [{
    "externalEventId": "order-123",
    "metricType": "PURCHASE",
    "count": 1,
    "amountMinor": 1200,
    "currency": "JPY",
    "occurredAt": "2026-09-13T10:00:00.000Z",
    "externalLinkId": "紹介URL側のID",
    "externalMemberId": "参加者側のID"
  }]
}`}</code>
        </pre>
        <p>
          成果の種類には <code>CLICK</code>、<code>LEAD</code>、<code>SIGNUP</code>、
          <code>PURCHASE</code>、<code>OTHER</code>を指定できます。
        </p>
      </details>
      <h3>受け取った成果</h3>
      <a
        className="button button--secondary"
        href={`${base}/export?groupId=${groupId}&kind=results`}
      >
        成果一覧をCSVで保存
      </a>
      {resultTotals.length ? (
        <ul>
          {resultTotals.map((total) => (
            <li key={`${total.metricType}:${total.currency ?? ''}`}>
              {total.metricType}：{total.count.toLocaleString('ja-JP')}件
              {total.amountMinor > 0 && total.currency
                ? ` ／ ${(total.amountMinor / 100).toLocaleString('ja-JP')} ${total.currency}`
                : ''}
            </li>
          ))}
        </ul>
      ) : (
        <p>成果はまだ届いていません。</p>
      )}
      {results.length > 0 && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>日時</th>
                <th>成果</th>
                <th>参加者</th>
                <th>URL</th>
              </tr>
            </thead>
            <tbody>
              {results.slice(0, 50).map((result) => (
                <tr key={result.id}>
                  <td>{new Date(result.occurredAt).toLocaleString('ja-JP')}</td>
                  <td>
                    {result.metricType} × {result.count}
                  </td>
                  <td>{result.memberIdentity?.groupMembership.user.displayName ?? '未照合'}</td>
                  <td>{result.externalTrackingLink?.name ?? '未照合'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
