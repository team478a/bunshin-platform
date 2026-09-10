import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../src/http/service-daily-missions.ts', import.meta.url),
  'utf8',
);
const generation = readFileSync(
  new URL('../src/services/daily-mission-generation.ts', import.meta.url),
  'utf8',
);
const detailPage = readFileSync(
  new URL('../app/s/[serviceSlug]/bunshins/[bunshinId]/page.tsx', import.meta.url),
  'utf8',
);
const experience = readFileSync(
  new URL(
    '../app/s/[serviceSlug]/bunshins/[bunshinId]/service-daily-mission-section.tsx',
    import.meta.url,
  ),
  'utf8',
);
const imageWorkspace = readFileSync(
  new URL('../app/ui/social-image-workspace.tsx', import.meta.url),
  'utf8',
);

describe('service daily mission boundary', () => {
  it('derives service authority on the server', () => {
    expect(source).toContain('resolvePublicServiceContext(serviceSlug)');
    expect(source).toContain('groupId: service.serviceId');
    expect(source).not.toContain('groupId: z.');
    expect(source).not.toContain('workspaceId: z.');
  });

  it('uses safe service generation without personal context, while retaining own trend candidates', () => {
    expect(source).toContain('serviceSafeMode: true');
    expect(generation).toMatch(/input\.serviceSafeMode\s*\?\s*null/);
    expect(generation).toMatch(/input\.serviceSafeMode\s*\?\s*\[\]/);
    expect(generation).toContain('new ListActiveTrendIdeas(');
    expect(generation).not.toMatch(/const trendIdeas = input\.serviceSafeMode\s*\?\s*\[\]/);
    expect(generation).toContain('campaign.productPack.groupId !== input.groupId');
    expect(generation).toContain("'service campaign unavailable'");
  });

  it('connects the service mission view and endpoint', () => {
    expect(detailPage).toContain('<ServiceDailyMissionSection');
    expect(detailPage).toContain('/daily-missions`}');
    expect(detailPage).toContain('trendContext: mission.trendContext');
    expect(detailPage).toContain('copyAuthorization: missionStates[index]!.copyAuthorization');
    expect(experience).toContain('<MissionTrendContext mission={mission} />');
  });

  it('gives image users one clear mobile action and hides technical directions by default', () => {
    expect(detailPage).toContain('imageCreationBaseHref');
    expect(detailPage).toContain("featureKey: 'SOCIAL.IMAGE_GENERATION'");
    expect(experience).toContain('やることは3つだけです');
    expect(experience).toContain('この5枚のテーマ');
    expect(experience).toContain('className="button mission-create-image"');
    expect(experience).toContain('画像を作る');
    expect(experience).toContain('<details className="mission-advanced-content">');
    expect(experience).toContain('企画の理由や自分で作る方法を見る');
    expect(imageWorkspace).toContain('青いボタンを押してください');
    expect(imageWorkspace).toContain('<summary>別の投稿案を選ぶ</summary>');
    expect(imageWorkspace).toContain('<summary>商品や本人の写真を使いたい方</summary>');
    expect(imageWorkspace).toContain('iPhoneで保存する方法');
    expect(imageWorkspace).toContain('開いた画像を長押しする');
    expect(imageWorkspace).toContain('枚目を開いて保存');
    expect(imageWorkspace).toContain('href={media.downloadPath}');
    expect(imageWorkspace).toContain('この1枚を直す');
    expect(imageWorkspace).toContain("['TEXT', '文章だけ']");
    expect(imageWorkspace).toContain("['PHOTO', '写真だけ']");
    expect(imageWorkspace).toContain("['BOTH', '文章と写真']");
    expect(imageWorkspace).toContain('他の4枚は変えていません');
    expect(imageWorkspace).not.toContain('download={`watashi-works-post-');
  });

  it('guides free users through copying the prompt and caption themselves', () => {
    expect(experience).toContain("imageCreationBaseHref ? '投稿画像を作りましょう'");
    expect(experience).toContain('画像用の文章をコピー');
    expect(experience).toContain('画像を作れるAIに貼り付ける');
    expect(experience).toContain('5枚の画像をスマホへ保存');
    expect(experience).toContain('動画にする場合はCapCutへ');
    expect(experience).toContain('投稿文をコピー');
    expect(experience).not.toContain('画像作成機能を準備しています');
  });

  it('supports LINE browsers that block the modern clipboard API', () => {
    expect(experience).toContain("document.execCommand('copy')");
    expect(experience).toContain('mission.copyAuthorization');
    expect(experience).toContain('もう一度コピーする');
    expect(experience).toContain('iPhoneの共有メニューを開く');
    expect(experience).toContain('navigator.share');
    expect(experience).toContain('下の枠内を長押しし');
    expect(experience).toContain('onFocus={(event) => event.currentTarget.select()}');
  });

  it('keeps automatic delivery while allowing variants only for delivered missions', () => {
    expect(experience).not.toContain('/daily-missions/generate');
    expect(experience).toContain('async function generateVariant');
    expect(experience).toContain('むずかしい設定は必要ありません');
    expect(experience).toContain('aria-live="polite"');
  });

  it('connects decisions, copies, posting and feedback through service routes', () => {
    expect(source).toContain('decideServiceDailyMissionResponse');
    expect(source).toContain('recordServiceMissionActivityResponse');
    expect(source).toContain('recordServicePostResponse');
    expect(source).toContain('recordServiceMissionFeedbackResponse');
    expect(source).toContain('authorizeServiceDailyMissionCopyResponse');
    expect(experience).toContain('採用する');
    expect(experience).toContain('今回は使わない');
    expect(experience).toContain('copyOptions(missionWithSelectedVariant(mission))');
    expect(experience).toContain('投稿しました');
    expect(experience).toContain('この投稿は、あなたらしかったですか？');
    expect(detailPage).toContain('new AuthorizeDailyMissionCopy(missionRepository)');
  });
});
