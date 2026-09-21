import type { CSSProperties } from 'react';
import { notFound } from 'next/navigation';
import { resolveAuthenticatedMemberServicePage } from '../../../../../../src/services/member-service-page';
import { PublicShell } from '../../../../../ui/public-shell';

export const dynamic = 'force-dynamic';

const skillStatusLabel = {
  MASTERED: 'できるようになりました',
  LEARNING: '練習中です',
  NOT_STARTED: 'これから学びます',
} as const;

export default async function TrainingGrowthPage({
  params,
}: {
  params: Promise<{ serviceSlug: string; programEnrollmentId: string }>;
}) {
  const { serviceSlug, programEnrollmentId } = await params;
  const { actor, service } = await resolveAuthenticatedMemberServicePage(
    serviceSlug,
    `/s/${serviceSlug}/programs/${programEnrollmentId}/growth`,
  );
  const db = await import('@bunshin/database');
  const growth = await new db.PrismaTrainingGrowthRepository(db.prisma).get({
    workspaceId: service.workspaceId,
    groupId: service.serviceId,
    actorUserId: actor.userId,
    programEnrollmentId,
    now: new Date(),
  });
  if (!growth) notFound();
  const style = {
    '--service-primary': service.configuration.brand.primaryColor,
    '--service-secondary': service.configuration.brand.secondaryColor,
    '--service-font': service.configuration.brand.fontFamily,
  } as CSSProperties;

  return (
    <PublicShell showPlatformBrand={false}>
      <main className="service-entry resale-action-page training-page" style={style}>
        <header className="service-entry__header">
          <p className="eyebrow">仕事で使える力を確認</p>
          <h1>あなたの成長</h1>
          <p>点数だけではなく、できるようになったことと次に伸ばす力を確認できます。</p>
        </header>

        <section className="service-entry__card training-growth-hero">
          <div>
            <p className="eyebrow">AI活用レベル</p>
            <strong className="training-growth-level">Lv.{growth.level}</strong>
            <span>{growth.levelLabel}</span>
          </div>
          <dl className="training-growth-stats">
            <div>
              <dt>今週の学習</dt>
              <dd>{growth.weeklyLearningDays}日</dd>
            </div>
            <div>
              <dt>完了した課題</dt>
              <dd>{growth.completedMissionCount}個</dd>
            </div>
            <div>
              <dt>習得した力</dt>
              <dd>{growth.masteredSkillCount}個</dd>
            </div>
            <div>
              <dt>連続学習</dt>
              <dd>{growth.streak}回</dd>
            </div>
          </dl>
          {growth.missionsUntilNextLevel !== null ? (
            <p className="training-growth-next">
              あと{growth.missionsUntilNextLevel}課題で、次のレベルです。
            </p>
          ) : (
            <p className="training-growth-next">継続して仕事で活用できています。</p>
          )}
        </section>

        <section className="service-entry__card training-card">
          <p className="eyebrow">今のあなた</p>
          <h2>得意と、次に伸ばす力</h2>
          <div className="training-growth-focus">
            <div>
              <span>今の得意</span>
              <strong>{growth.strongestSkill?.label ?? '最初の評価後に表示します'}</strong>
            </div>
            <div>
              <span>次に伸ばす力</span>
              <strong>{growth.focusSkill?.label ?? 'まず今日の課題を始めましょう'}</strong>
            </div>
          </div>
        </section>

        <section className="service-entry__card training-card">
          <p className="eyebrow">6つのAI活用スキル</p>
          <h2>できるようになった力</h2>
          <div className="training-growth-skills">
            {growth.skills.map((skill) => (
              <div className="training-growth-skill" key={skill.key}>
                <div>
                  <strong>{skill.label}</strong>
                  <span>{skillStatusLabel[skill.status]}</span>
                </div>
                <span
                  className="training-growth-skill__bar"
                  role="meter"
                  aria-label={`${skill.label} ${skill.score ?? 0}点`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={skill.score ?? 0}
                >
                  <span style={{ width: `${skill.score ?? 0}%` }} />
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="service-entry__card training-card">
          <p className="eyebrow">実務で身につけたこと</p>
          <h2>できるようになったこと</h2>
          {growth.achievements.length ? (
            <ul className="training-growth-achievements">
              {growth.achievements.map((achievement) => (
                <li key={achievement}>✓ {achievement}</li>
              ))}
            </ul>
          ) : (
            <p>課題を完了すると、ここにできるようになったことが増えていきます。</p>
          )}
        </section>

        <a
          className="button button--secondary button--full"
          href={`/s/${serviceSlug}/programs/${programEnrollmentId}`}
        >
          今日のトレーニングへ戻る
        </a>
      </main>
    </PublicShell>
  );
}
