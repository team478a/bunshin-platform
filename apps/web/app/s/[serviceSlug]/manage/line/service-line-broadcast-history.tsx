'use client';

import type {
  ServiceLineBroadcastHealth,
  ServiceLineBroadcastOperationalStatus,
  ServiceLineBroadcastView,
} from './service-line-broadcast-types';

const statusLabels: Record<ServiceLineBroadcastOperationalStatus, string> = {
  HEALTHY: '正常',
  SCHEDULED: '予約中',
  STALLED: '配信停滞',
  NEEDS_ATTENTION: '再送確認',
  RECOVERED: '自動回復済み',
  CANCELLED: '取消済み',
};

export function ServiceLineBroadcastHistory({
  serviceSlug,
  broadcasts,
  health,
  reload,
  announce,
}: {
  serviceSlug: string;
  broadcasts: ServiceLineBroadcastView[];
  health: ServiceLineBroadcastHealth;
  reload: () => Promise<void>;
  announce: (message: string) => void;
}) {
  return (
    <>
      <div className="line-broadcast-summary" aria-label="配信の運用状況">
        <span>
          配信停滞 <strong>{health.stalledBroadcasts}件</strong>
        </span>
        <span>
          失敗宛先 <strong>{health.failedRecipients}件</strong>
        </span>
        <span>
          失敗率 <strong>{health.failureRate}%</strong>
        </span>
        <span>
          自動回復 <strong>{health.recoveryAttempts}件</strong>
        </span>
      </div>
      {health.stalledBroadcasts > 0 ? (
        <p className="line-broadcast-alert" role="alert">
          送信予定から15分以上進んでいない配信があります。最近の配信を確認してください。
        </p>
      ) : null}
      <h3>最近の配信</h3>
      <p>
        <a href={`/api/services/${encodeURIComponent(serviceSlug)}/line-broadcasts/export`}>
          配信結果をCSVでダウンロード
        </a>
      </p>
      <ul className="line-broadcast-list">
        {broadcasts.map((broadcast) => (
          <li key={broadcast.id}>
            <div className="line-broadcast-list__detail">
              <strong>{broadcast.title}</strong>
              <span
                className={`line-broadcast-state line-broadcast-state--${broadcast.operationalStatus.toLowerCase()}`}
              >
                {statusLabels[broadcast.operationalStatus]}
              </span>
              <small>
                送信 {broadcast.recipients.SENT ?? 0}件／失敗 {broadcast.recipients.FAILED ?? 0}
                件／失敗率 {broadcast.failureRate}%
                {broadcast.recoveryAttempts > 0 ? `／自動回復 ${broadcast.recoveryAttempts}回` : ''}
              </small>
            </div>
            {(broadcast.recipients.FAILED ?? 0) > 0 ? (
              <button
                className="button button--secondary"
                type="button"
                onClick={() => {
                  const reason = window.prompt('再送する理由を入力してください');
                  if (!reason) return;
                  void fetch(
                    `/api/services/${encodeURIComponent(serviceSlug)}/line-broadcasts/${broadcast.id}/retry`,
                    {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ reason }),
                    },
                  ).then(async (response) => {
                    announce(
                      response.ok
                        ? '失敗した宛先へ再送を予約しました。'
                        : '再送を予約できませんでした。',
                    );
                    await reload();
                  });
                }}
              >
                失敗分を再送する
              </button>
            ) : null}
            {broadcast.status === 'SCHEDULED' ? (
              <button
                className="button button--secondary"
                type="button"
                onClick={() => {
                  const reason = window.prompt('取り消す理由を入力してください');
                  if (!reason || !window.confirm('まだ送っていない相手への配信を取り消します。'))
                    return;
                  void fetch(
                    `/api/services/${encodeURIComponent(serviceSlug)}/line-broadcasts/${broadcast.id}/cancel`,
                    {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ reason }),
                    },
                  ).then(async (response) => {
                    announce(
                      response.ok
                        ? '予約した配信を取り消しました。'
                        : '配信を取り消せませんでした。',
                    );
                    await reload();
                  });
                }}
              >
                配信を取り消す
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}
