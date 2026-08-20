'use client';
import type { BunshinAggregate } from '@bunshin/platform-domain';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { CapabilitySection } from './capability-section';
import type { SocialCapabilityStatus } from './capability-section';
import { MemorySection } from './memory-section';
import type { MemoryView } from './memory-section';
import { SocialProfileSection, type SocialProfileView } from './social-profile-section';
import { ContentPillarSection, type ContentPillarView } from './content-pillar-section';
import { WeeklyPlanSection, type WeeklyPlanView } from './weekly-plan-section';
import { AccountStrategySection, type StrategyView } from './account-strategy-section';
import { DailyMissionSection, type DailyMissionView } from './daily-mission-section';

export function BunshinEditor({
  workspaceId,
  bunshin,
  knowledge,
  memories,
  socialCapabilityStatus,
  socialProfiles,
  socialStrategies,
  contentPillars,
  weeklyPlans,
  dailyMissions,
}: {
  workspaceId: string;
  bunshin: BunshinAggregate;
  knowledge: Array<{ id: string; title: string; type: string; granted: boolean }>;
  memories: MemoryView[];
  socialCapabilityStatus: SocialCapabilityStatus;
  socialProfiles: SocialProfileView[];
  socialStrategies: StrategyView[];
  contentPillars: ContentPillarView[];
  weeklyPlans: WeeklyPlanView[];
  dailyMissions: DailyMissionView[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: bunshin.name,
    objectiveSummary: bunshin.objectiveSummary,
    audienceSummary: bunshin.audienceSummary,
    personalitySummary: bunshin.personalitySummary,
  });
  const endpoint = `/api/workspaces/${encodeURIComponent(workspaceId)}/bunshins/${encodeURIComponent(bunshin.id)}`;
  async function save(event: FormEvent) {
    event.preventDefault();
    const response = await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(form),
    });
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
    <main>
      <h1>{bunshin.name}</h1>
      <form
        onSubmit={(event) => {
          void save(event);
        }}
      >
        <label>
          名前
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label>
          目的
          <textarea
            value={form.objectiveSummary}
            onChange={(e) => setForm({ ...form, objectiveSummary: e.target.value })}
          />
        </label>
        <label>
          対象者
          <textarea
            value={form.audienceSummary}
            onChange={(e) => setForm({ ...form, audienceSummary: e.target.value })}
          />
        </label>
        <label>
          人格
          <textarea
            value={form.personalitySummary}
            onChange={(e) => setForm({ ...form, personalitySummary: e.target.value })}
          />
        </label>
        <p>
          <button type="submit">保存</button>
        </p>
      </form>
      <section>
        <h2>利用するKnowledge</h2>
        {knowledge.length === 0 ? (
          <p>利用可能なKnowledgeはありません。</p>
        ) : (
          <ul>
            {knowledge.map((item) => (
              <li key={item.id}>
                {item.title}（{item.type}）{' '}
                <button
                  type="button"
                  onClick={() => {
                    void setGrant(item.id, item.granted);
                  }}
                >
                  {item.granted ? '利用を解除' : '利用する'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <MemorySection workspaceId={workspaceId} bunshinId={bunshin.id} memories={memories} />
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
      <DailyMissionSection
        workspaceId={workspaceId}
        bunshinId={bunshin.id}
        capabilityStatus={socialCapabilityStatus}
        missions={dailyMissions}
      />
      <button
        type="button"
        onClick={() => {
          void archive();
        }}
      >
        アーカイブ
      </button>
    </main>
  );
}
