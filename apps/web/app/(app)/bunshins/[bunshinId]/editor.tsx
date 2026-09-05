'use client';
import type { BunshinAggregate } from '@bunshin/platform-domain';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { CapabilitySection } from './capability-section';
import type { SocialCapabilityStatus } from './capability-section';
import { MemorySection } from './memory-section';
import type { MemoryView } from './memory-section';
import {
  PersonalitySection,
  type PersonalityLearningProposalView,
  type PersonalityVersionView,
} from './personality-section';
import { SocialProfileSection, type SocialProfileView } from './social-profile-section';
import { ContentPillarSection, type ContentPillarView } from './content-pillar-section';
import { WeeklyPlanSection, type WeeklyPlanView } from './weekly-plan-section';
import { AccountStrategySection, type StrategyView } from './account-strategy-section';
import { DailyMissionSection, type DailyMissionView } from './daily-mission-section';
import type {
  ActivityMotivationView,
  MissionProgressView,
} from '../../../../src/activity-progress';
import {
  LineNotificationPreferenceSection,
  type LineNotificationPreferenceView,
} from './line-notification-preference-section';

export function BunshinEditor({
  workspaceId,
  bunshin,
  personalityVersions,
  personalityLearningProposals,
  knowledge,
  memories,
  socialCapabilityStatus,
  socialProfiles,
  socialStrategies,
  contentPillars,
  weeklyPlans,
  dailyMissions,
  progress,
  motivation,
  localDate,
  lineNotificationPreference,
}: {
  workspaceId: string;
  bunshin: BunshinAggregate;
  personalityVersions: PersonalityVersionView[];
  personalityLearningProposals: PersonalityLearningProposalView[];
  knowledge: Array<{ id: string; title: string; type: string; granted: boolean }>;
  memories: MemoryView[];
  socialCapabilityStatus: SocialCapabilityStatus;
  socialProfiles: SocialProfileView[];
  socialStrategies: StrategyView[];
  contentPillars: ContentPillarView[];
  weeklyPlans: WeeklyPlanView[];
  dailyMissions: DailyMissionView[];
  progress: MissionProgressView;
  motivation: ActivityMotivationView;
  localDate: string;
  lineNotificationPreference: LineNotificationPreferenceView;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: bunshin.name,
    objectiveSummary: bunshin.objectiveSummary,
    audienceSummary: bunshin.audienceSummary,
    personalitySummary: bunshin.personalitySummary,
  });
  const [overviewMessage, setOverviewMessage] = useState<string | null>(null);
  const endpoint = `/api/workspaces/${encodeURIComponent(workspaceId)}/bunshins/${encodeURIComponent(bunshin.id)}`;
  async function save(event: FormEvent) {
    event.preventDefault();
    setOverviewMessage(null);
    const response = await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(form),
    });
    setOverviewMessage(
      response.ok
        ? '基本情報を保存しました。'
        : '保存できませんでした。入力内容を確認して、もう一度お試しください。',
    );
    if (response.ok) router.refresh();
  }
  async function archive() {
    const response = await fetch(`${endpoint}/archive`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    if (response.ok) router.push('/bunshins');
  }
  async function setGrant(knowledgeId: string, granted: boolean) {
    const response = await fetch(
      `${endpoint}/knowledge/${encodeURIComponent(knowledgeId)}/${granted ? 'revoke' : 'grant'}`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
    );
    if (response.ok) router.refresh();
  }
  return (
    <main className="app-page bunshin-detail-page">
      <header className="bunshin-detail-header">
        <p className="eyebrow">あなたのBUNSHIN</p>
        <h1>{bunshin.name}</h1>
      </header>
      <section id="daily-mission">
        <DailyMissionSection
          workspaceId={workspaceId}
          bunshinId={bunshin.id}
          capabilityStatus={socialCapabilityStatus}
          profiles={socialProfiles.map(({ id, platform, status }) => ({ id, platform, status }))}
          missions={dailyMissions}
          progress={progress}
          motivation={motivation}
          localDate={localDate}
        />
      </section>
      <nav className="bunshin-section-nav" aria-label="BUNSHIN設定">
        <a href="#overview">概要</a>
        <a href="#social-strategy">SNS戦略</a>
        <a href="#content-planning">発信テーマ</a>
        <a href="#knowledge-memory">知識</a>
        <a href="#notification-settings">設定</a>
      </nav>

      <section className="settings-group" id="overview">
        <header>
          <span className="settings-group__icon" aria-hidden="true">
            分
          </span>
          <span>
            <h2>概要</h2>
            <p>名前・目的・届けたい相手・話し方</p>
          </span>
        </header>
        <details className="settings-disclosure">
          <summary>基本情報を編集</summary>
          <p className="settings-disclosure__intro">
            分身の名前と、何のために・誰へ向けて発信するかを短い言葉で設定します。
          </p>
          <form
            onSubmit={(event) => {
              void save(event);
            }}
          >
            <label>
              <span>分身の名前</span>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              <span>発信の目的</span>
              <textarea
                value={form.objectiveSummary}
                onChange={(e) => setForm({ ...form, objectiveSummary: e.target.value })}
              />
            </label>
            <label>
              <span>届けたい相手</span>
              <textarea
                value={form.audienceSummary}
                onChange={(e) => setForm({ ...form, audienceSummary: e.target.value })}
              />
            </label>
            <label>
              <span>ひとことで表す話し方</span>
              <textarea
                value={form.personalitySummary}
                onChange={(e) => setForm({ ...form, personalitySummary: e.target.value })}
              />
            </label>
            <button className="button button--primary" type="submit">
              変更を保存
            </button>
          </form>
          {overviewMessage ? (
            <p className="form-feedback" role="status">
              {overviewMessage}
            </p>
          ) : null}
        </details>
        <details className="settings-disclosure">
          <summary>話し方をくわしく決める</summary>
          <div className="settings-disclosure__content">
            <PersonalitySection
              workspaceId={workspaceId}
              bunshinId={bunshin.id}
              versions={personalityVersions}
              learningProposals={personalityLearningProposals}
            />
          </div>
        </details>
      </section>

      <section className="settings-group" id="social-strategy">
        <header>
          <span className="settings-group__icon" aria-hidden="true">
            SNS
          </span>
          <span>
            <h2>SNS戦略</h2>
            <p>どのSNSで、だれに、何を伝えるかを決めます</p>
          </span>
        </header>
        <details className="settings-disclosure">
          <summary>SNS戦略を確認・編集</summary>
          <div className="settings-disclosure__content">
            <CapabilitySection
              workspaceId={workspaceId}
              bunshinId={bunshin.id}
              socialStatus={socialCapabilityStatus}
            />
            <SocialProfileSection
              workspaceId={workspaceId}
              bunshinId={bunshin.id}
              capabilityStatus={socialCapabilityStatus}
              profiles={socialProfiles}
            />
            <AccountStrategySection
              workspaceId={workspaceId}
              bunshinId={bunshin.id}
              profiles={socialProfiles.map(({ id, platform }) => ({ id, platform }))}
              strategies={socialStrategies}
              active={socialCapabilityStatus === 'ACTIVE'}
            />
          </div>
        </details>
      </section>

      <section className="settings-group" id="content-planning">
        <header>
          <span className="settings-group__icon" aria-hidden="true">
            企
          </span>
          <span>
            <h2>発信テーマ</h2>
            <p>どんなことを投稿するかと、1週間の予定を決めます</p>
          </span>
        </header>
        <details className="settings-disclosure">
          <summary>発信テーマと計画を確認・編集</summary>
          <div className="settings-disclosure__content">
            <ContentPillarSection
              workspaceId={workspaceId}
              bunshinId={bunshin.id}
              capabilityStatus={socialCapabilityStatus}
              pillars={contentPillars}
            />
            <WeeklyPlanSection
              workspaceId={workspaceId}
              bunshinId={bunshin.id}
              capabilityStatus={socialCapabilityStatus}
              profiles={socialProfiles}
              pillars={contentPillars}
              plans={weeklyPlans}
            />
          </div>
        </details>
      </section>

      <section className="settings-group" id="knowledge-memory">
        <header>
          <span className="settings-group__icon" aria-hidden="true">
            知
          </span>
          <span>
            <h2>知識</h2>
            <p>BUNSHINに教えることと、覚えていること</p>
          </span>
        </header>
        <details className="settings-disclosure">
          <summary>知識と記憶を確認・編集</summary>
          <div className="settings-disclosure__content">
            <section>
              <h2>BUNSHINに教えること</h2>
              {knowledge.length === 0 ? (
                <p>教えられる内容はまだありません。</p>
              ) : (
                <ul className="knowledge-grant-list">
                  {knowledge.map((item) => (
                    <li key={item.id}>
                      <span>
                        {item.title}
                        <small>{item.type}</small>
                      </span>
                      <button type="button" onClick={() => void setGrant(item.id, item.granted)}>
                        {item.granted ? '利用を解除' : '利用する'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <MemorySection workspaceId={workspaceId} bunshinId={bunshin.id} memories={memories} />
          </div>
        </details>
      </section>

      <section className="settings-group" id="notification-settings">
        <header>
          <span className="settings-group__icon" aria-hidden="true">
            設
          </span>
          <span>
            <h2>通知と設定</h2>
            <p>LINE通知とBUNSHINの管理</p>
          </span>
        </header>
        <details className="settings-disclosure">
          <summary>通知と管理設定を開く</summary>
          <div className="settings-disclosure__content">
            <LineNotificationPreferenceSection
              workspaceId={workspaceId}
              bunshinId={bunshin.id}
              preference={lineNotificationPreference}
            />
            <div className="bunshin-archive">
              <h2>このBUNSHINを停止する</h2>
              <p>停止後もデータは保持されます。</p>
              <button
                className="button button--danger"
                type="button"
                onClick={() => void archive()}
              >
                アーカイブ
              </button>
            </div>
          </div>
        </details>
      </section>
    </main>
  );
}
