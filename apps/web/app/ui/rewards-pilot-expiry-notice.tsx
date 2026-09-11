import type { RewardsPilotExpiryNotice } from '../../src/rewards/rewards-pilot-expiry';

export function RewardsPilotExpiryNoticeCard({
  notice,
}: {
  notice: RewardsPilotExpiryNotice | null;
}) {
  if (!notice) return null;
  return (
    <section className="settings-card" aria-labelledby="rewards-pilot-expiry-title">
      <h2 id="rewards-pilot-expiry-title">試験利用の終了日が近づいています</h2>
      <p>
        ポイントとバッジを使えるのは、あと<strong>{notice.daysRemaining}日</strong>です（
        {notice.endLabel}まで）。
      </p>
      <p>終了後については、サービスの運営者からご案内します。</p>
    </section>
  );
}
