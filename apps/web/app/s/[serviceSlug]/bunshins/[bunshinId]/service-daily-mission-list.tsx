'use client';

import type { DailyMissionView } from '../../../../(app)/bunshins/[bunshinId]/daily-mission-section';
import type { ServiceDailyMissionController } from './service-daily-mission-controller';
import { ServiceDailyMissionCard } from './service-daily-mission-card';

export type ServiceDailyMissionListProps = {
  missions: DailyMissionView[];
  controller: ServiceDailyMissionController;
  variantPointCost: number | null;
  pointWorkspaceId: string;
  serviceSlug: string;
  active: boolean;
  videos: Record<string, { href: string; status: string }>;
  imageCreationBaseHref?: string;
  businessFree: boolean;
};

export function ServiceDailyMissionList({
  missions,
  controller,
  variantPointCost,
  pointWorkspaceId,
  serviceSlug,
  active,
  videos,
  imageCreationBaseHref,
  businessFree,
}: ServiceDailyMissionListProps) {
  return (
    <ul className="mission-list">
      {missions.map((mission) => (
        <ServiceDailyMissionCard
          key={mission.id}
          mission={mission}
          controller={controller}
          variantPointCost={variantPointCost}
          pointWorkspaceId={pointWorkspaceId}
          serviceSlug={serviceSlug}
          active={active}
          video={videos[mission.id]}
          imageCreationBaseHref={imageCreationBaseHref}
          businessFree={businessFree}
        />
      ))}
    </ul>
  );
}
