import { TRAINING_ENROLLMENT_STATUS_LABELS } from '@bunshin/capability-training';
import { AiTrainingDataExportCard } from './ai-training-data-export-card';

type EndedStatus = 'COMPLETED' | 'CANCELLED' | 'EXPIRED';
const messages: Record<EndedStatus, string> = {
  COMPLETED: 'この研修は終了しています。これまでの取り組み、お疲れさまでした。',
  CANCELLED: 'この研修の受講は取り消されています。',
  EXPIRED: 'この研修の受講期間は終了しています。',
};
export function AiTrainingEndedCard({
  serviceSlug,
  programEnrollmentId,
  programName,
  status,
  endedAt,
}: {
  serviceSlug: string;
  programEnrollmentId: string;
  programName: string;
  status: EndedStatus;
  endedAt: Date | null;
}) {
  return (
    <>
      <header className="service-entry__header">
        <p className="eyebrow">{programName}</p>
        <h1>AI研修の受講状況</h1>
        <p>受講状態：{TRAINING_ENROLLMENT_STATUS_LABELS[status]}</p>
      </header>
      <section className="settings-card">
        <h2>{TRAINING_ENROLLMENT_STATUS_LABELS[status]}</h2>
        <p>{messages[status]}</p>
        <p>新しい課題や回答提出、AI評価は利用できません。</p>
        <p>
          終了日時：
          {endedAt
            ? new Intl.DateTimeFormat('ja-JP', {
                dateStyle: 'medium',
                timeStyle: 'short',
                timeZone: 'Asia/Tokyo',
              }).format(endedAt)
            : '記録されていません（過去の終了日は推測しません）'}
        </p>
        <p>
          再開をご希望の場合や、この状態に心当たりがない場合は、サービス運営へお問い合わせください。再開には参加資格と契約期間の確認が必要です。
        </p>
        <p>受講状態だけでは、課金・返金・契約期間の変更や学習データの削除・復元を意味しません。</p>
      </section>
      {status !== 'CANCELLED' && (
        <>
          <a
            className="button button--secondary button--full"
            href={`/s/${serviceSlug}/programs/${programEnrollmentId}/toolkit`}
          >
            保存済みのMy AI Toolkitを見る
          </a>
          <AiTrainingDataExportCard
            serviceSlug={serviceSlug}
            programEnrollmentId={programEnrollmentId}
          />
        </>
      )}
      <a className="button button--secondary button--full" href={`/s/${serviceSlug}/programs`}>
        プログラム一覧へ戻る
      </a>
    </>
  );
}
