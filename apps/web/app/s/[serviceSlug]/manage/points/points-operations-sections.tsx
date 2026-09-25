import type { PointSettingsData } from './points-data';
import { PointsAdjustmentSections } from './points-adjustment-sections';
import { PointsOverviewSections } from './points-overview-sections';
import { PointsRuleSections } from './points-rule-sections';

export function PointsOperationsSections({
  data,
  serviceSlug,
}: {
  data: PointSettingsData;
  serviceSlug: string;
}) {
  return (
    <>
      <PointsOverviewSections data={data} serviceSlug={serviceSlug} />
      <PointsRuleSections data={data} serviceSlug={serviceSlug} />
      <PointsAdjustmentSections data={data} serviceSlug={serviceSlug} />
    </>
  );
}
