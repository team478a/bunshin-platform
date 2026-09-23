import type { Route } from 'next';
import Link from 'next/link';
import { parseAiTrainingOperationsSettings } from '@bunshin/capability-training';
import type { buildAiTrainingAdminDashboard } from '../../../../../src/services/ai-training-admin-dashboard';
import type { buildAiTrainingPilotAnalytics } from '../../../../../src/services/ai-training-pilot-analytics';
import { PublicShell } from '../../../../ui/public-shell';

const dateTimeLabel = (value: Date | null) =>
  value
    ? new Intl.DateTimeFormat('ja-JP', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Tokyo',
      }).format(value)
    : 'まだ実施していません';

const engagementLabel = {
  NOT_STARTED: '初期設定待ち',
  ACTIVE: '継続中',
  NEEDS_SUPPORT: '復習を支援',
  INACTIVE: '再開を支援',
  COMPLETED: '修了',
} as const;

type TrainingOperationsSettingsSource = Parameters<typeof parseAiTrainingOperationsSettings>[0];

type TrainingAdminDashboardProps = {
  serviceSlug: string;
  programs: Array<{ id: string; displayName: string; settings: TrainingOperationsSettingsSource }>;
  dashboard: ReturnType<typeof buildAiTrainingAdminDashboard>;
  analytics: ReturnType<typeof buildAiTrainingPilotAnalytics>;
  helpRequests: Array<{ id: string; participantName: string; occurredAt: Date }>;
  updateTrainingOperations: (formData: FormData) => Promise<void>;
  resolveTrainingHelp: (formData: FormData) => Promise<void>;
};

export function TrainingAdminDashboard({
  serviceSlug,
  programs,
  dashboard,
  analytics,
  helpRequests,
  updateTrainingOperations,
  resolveTrainingHelp,
}: TrainingAdminDashboardProps) {
  return (
    <PublicShell showPlatformBrand={false}>
      <main className="app-page training-admin">
        <header className="app-page__heading">
          <p className="eyebrow">サービス管理者</p>
          <h1>AI研修の進み具合</h1>
          <p>受講者が今どこまで進み、誰に声かけが必要かを確認できます。</p>
          <Link href={`/s/${serviceSlug}/manage` as Route}>← 管理メニューへ戻る</Link>
        </header>

        {programs.length === 0 ? (
          <section className="settings-card">
            <h2>AI研修はまだ設定されていません</h2>
            <p>先に「実践プログラム」でAI研修をこのサービスへ追加してください。</p>
            <Link className="button" href={`/s/${serviceSlug}/manage/programs` as Route}>
              実践プログラムを開く
            </Link>
          </section>
        ) : (
          <>
            <section className="settings-card training-admin__summary">
              <h2>全体の状況</h2>
              <div className="weekly-report__metrics">
                <article>
                  <strong>{dashboard.totals.active}</strong>
                  <span>受講中</span>
                </article>
                <article>
                  <strong>{dashboard.totals.continuationPercent}%</strong>
                  <span>7日以内の継続率</span>
                </article>
                <article>
                  <strong>{dashboard.totals.completedMissions}</strong>
                  <span>完了した課題</span>
                </article>
                <article>
                  <strong>{dashboard.totals.needsSupport}</strong>
                  <span>声かけが必要</span>
                </article>
              </div>
              <p>
                登録者 {dashboard.totals.participants}人のうち、受講中は
                {dashboard.totals.active}
                人です。継続率は、受講中で直近7日以内に研修を進めた人の割合です。
              </p>
            </section>

            <section className="settings-card">
              <h2>配信と受講支援の設定</h2>
              <p>時刻は日本時間です。「後でやる」の再通知は、受講者が押した時点から数えます。</p>
              {programs.map((program) => {
                const settings = parseAiTrainingOperationsSettings(program.settings);
                return (
                  <form
                    action={updateTrainingOperations}
                    key={program.id}
                    className="settings-form"
                  >
                    <input type="hidden" name="serviceSlug" value={serviceSlug} />
                    <input type="hidden" name="programId" value={program.id} />
                    <h3>{program.displayName}</h3>
                    <label>
                      <input
                        type="checkbox"
                        name="notificationsEnabled"
                        defaultChecked={settings.notificationsEnabled}
                      />{' '}
                      毎日のLINE通知を送る
                    </label>
                    <label>
                      通知時刻
                      <select
                        name="notificationHour"
                        defaultValue={String(settings.notificationHour)}
                      >
                        {Array.from({ length: 24 }, (_, hour) => (
                          <option value={hour} key={hour}>
                            {hour}:00
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        name="postponedReminderEnabled"
                        defaultChecked={settings.postponedReminderEnabled}
                      />{' '}
                      「後でやる」の人へ再通知する
                    </label>
                    <label>
                      再通知までの時間
                      <input
                        type="number"
                        name="postponedReminderHours"
                        min="1"
                        max="168"
                        defaultValue={settings.postponedReminderHours}
                      />
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        name="helpQueueEnabled"
                        defaultChecked={settings.helpQueueEnabled}
                      />{' '}
                      「困った」を支援一覧へ表示する
                    </label>
                    <button className="button" type="submit">
                      設定を保存
                    </button>
                  </form>
                );
              })}
            </section>

            <section className="settings-card">
              <h2>対応が必要な「困った」</h2>
              <p>受講者が支援を求めた課題だけを表示します。対応後に完了へ変更してください。</p>
              {helpRequests.length === 0 ? (
                <p>未対応の依頼はありません。</p>
              ) : (
                <div className="training-admin__participants">
                  {helpRequests.map((event) => (
                    <article className="training-admin__participant" key={event.id}>
                      <h3>{event.participantName}</h3>
                      <p>{dateTimeLabel(event.occurredAt)} に支援を依頼しました。</p>
                      <form action={resolveTrainingHelp}>
                        <input type="hidden" name="serviceSlug" value={serviceSlug} />
                        <input type="hidden" name="helpEventId" value={event.id} />
                        <button className="button button--secondary" type="submit">
                          対応済みにする
                        </button>
                      </form>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="settings-card training-admin__analytics">
              <h2>Pilotの利用状況</h2>
              <p>登録から実務成果物の保存まで、どこで止まっているかを確認できます。</p>
              <div className="training-analytics-grid">
                <article>
                  <strong>{analytics.assessmentCompletionPercent}%</strong>
                  <span>初期診断完了</span>
                  <small>
                    {analytics.assessmentCompleted} / {analytics.participants}人
                  </small>
                </article>
                <article>
                  <strong>{analytics.goalSelectionPercent}%</strong>
                  <span>Goal選択</span>
                  <small>
                    {analytics.goalSelected} / {analytics.assessmentCompleted}人
                  </small>
                </article>
                <article>
                  <strong>{analytics.missionStartPercent}%</strong>
                  <span>課題開始</span>
                  <small>
                    {analytics.missionStarted} / {analytics.assessmentCompleted}人
                  </small>
                </article>
                <article>
                  <strong>{analytics.answerPercent}%</strong>
                  <span>回答</span>
                  <small>
                    {analytics.answered} / {analytics.missionStarted}人
                  </small>
                </article>
              </div>
            </section>

            <section className="settings-card training-admin__analytics">
              <h2>学習品質と実務定着</h2>
              <p>評価後に復習できたか、Skillが改善したか、成果物を残せたかを確認します。</p>
              <div className="training-analytics-grid">
                <article>
                  <strong>{analytics.passPercent}%</strong>
                  <span>PASS率</span>
                  <small>
                    PASS {analytics.passedEvaluations}件 / REVIEW {analytics.reviewEvaluations}件
                  </small>
                </article>
                <article>
                  <strong>{analytics.retryPercent}%</strong>
                  <span>再回答率</span>
                  <small>
                    {analytics.retriedParticipants} / {analytics.reviewParticipants}人
                  </small>
                </article>
                <article>
                  <strong>{analytics.skillImprovementPercent}%</strong>
                  <span>Skill改善</span>
                  <small>
                    {analytics.skillImprovedParticipants} / {analytics.skillMeasuredParticipants}人
                  </small>
                </article>
                <article>
                  <strong>{analytics.toolkitSavePercent}%</strong>
                  <span>Toolkit保存</span>
                  <small>{analytics.toolkitSavedParticipants}人が保存</small>
                </article>
              </div>
            </section>

            <section className="settings-card">
              <h2>受講者ごとの状況</h2>
              <p>回答本文は表示せず、進捗とAI評価で見つかった苦手だけを表示しています。</p>
              {dashboard.participants.length === 0 ? (
                <p>AI研修へ登録された受講者はまだいません。</p>
              ) : (
                <div className="training-admin__participants">
                  {dashboard.participants.map((participant) => (
                    <article className="training-admin__participant" key={participant.enrollmentId}>
                      <div className="training-admin__participant-heading">
                        <div>
                          <h3>{participant.participantName}</h3>
                          <p>{participant.programName}</p>
                        </div>
                        <strong data-engagement={participant.engagement}>
                          {engagementLabel[participant.engagement]}
                        </strong>
                      </div>
                      <dl>
                        <div>
                          <dt>受講者の設定</dt>
                          <dd>
                            {participant.roleLabel}・{participant.aiLevelLabel}
                          </dd>
                        </div>
                        <div>
                          <dt>進捗</dt>
                          <dd>{participant.completedMissionCount}課題を完了</dd>
                        </div>
                        <div>
                          <dt>現在のテーマ</dt>
                          <dd>{participant.currentTopic}</dd>
                        </div>
                        <div>
                          <dt>直近の課題</dt>
                          <dd>{participant.currentMission}</dd>
                        </div>
                        <div>
                          <dt>苦手・確認点</dt>
                          <dd>{participant.weakArea}</dd>
                        </div>
                        <div>
                          <dt>最終実施</dt>
                          <dd>{dateTimeLabel(participant.lastActivityAt)}</dd>
                        </div>
                      </dl>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </PublicShell>
  );
}
