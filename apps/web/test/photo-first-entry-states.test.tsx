import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  DailyActionSection,
  type DailyActionView,
} from '../app/s/[serviceSlug]/bunshins/[bunshinId]/daily-action-section';

const photo: DailyActionView = {
  id: 'photo-1',
  type: 'PHOTO',
  text: '店頭に今日の商品を並べた写真',
  label: '写真',
  hasPhoto: true,
  attachmentStatus: 'READY',
  useForAutomaticImages: false,
  createdAt: '2026-10-01T00:00:00.000Z',
};

function renderEntry(input: {
  todayMissionId?: string | null;
  photoFirstMissionSeed?: { missionDate: string; socialProfileId: string } | null;
}) {
  return renderToStaticMarkup(
    <DailyActionSection
      endpoint="/api/services/hassy/bunshins/bunshin-1/daily-actions"
      initialActions={[photo]}
      {...(input.todayMissionId === undefined ? {} : { todayMissionId: input.todayMissionId })}
      {...(input.photoFirstMissionSeed === undefined
        ? {}
        : { photoFirstMissionSeed: input.photoFirstMissionSeed })}
    />,
  );
}

describe('Photo First entry states', () => {
  it('offers Photo First when todays Mission already exists', () => {
    const html = renderEntry({ todayMissionId: 'mission-1' });

    expect(html).toContain('この写真から投稿を考える');
    expect(html).not.toContain('今日の投稿予定ができると');
  });

  it('offers Photo First when todays Mission can be created from a confirmed Plan', () => {
    const html = renderEntry({
      todayMissionId: null,
      photoFirstMissionSeed: {
        missionDate: '2026-10-01',
        socialProfileId: 'profile-1',
      },
    });

    expect(html).toContain('この写真から投稿を考える');
    expect(html).not.toContain('今日の投稿予定ができると');
  });

  it('explains why Photo First is unavailable when neither Mission nor Plan exists', () => {
    const html = renderEntry({ todayMissionId: null, photoFirstMissionSeed: null });

    expect(html).not.toContain('この写真から投稿を考える');
    expect(html).toContain('今日の投稿予定ができると、この写真から投稿を考えられます。');
    expect(html).toContain('daily-action__photo-first-waiting');
  });
});
