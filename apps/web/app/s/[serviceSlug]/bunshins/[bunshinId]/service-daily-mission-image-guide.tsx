'use client';

import {
  copyOptions,
  imagePostHeadline,
  missionWithSelectedVariant,
  type DailyMissionView,
} from '../../../../(app)/bunshins/[bunshinId]/daily-mission-section';
import type { ServiceDailyMissionController } from './service-daily-mission-controller';

export function ServiceDailyMissionImageGuide({
  mission,
  imageCreationHref,
  controller,
}: {
  mission: DailyMissionView;
  imageCreationHref: string | null;
  controller: ServiceDailyMissionController;
}) {
  const preparedCopyOptions = copyOptions(missionWithSelectedVariant(mission));
  const imageInstruction = preparedCopyOptions.find(
    (option) => option.type === 'COPIED_IMAGE_INSTRUCTION',
  );
  const postCaption = preparedCopyOptions.find((option) => option.type === 'COPIED_TEXT');
  const imageHeadline = imagePostHeadline(missionWithSelectedVariant(mission));

  if (imageCreationHref) {
    return (
      <a className="button mission-create-image" href={imageCreationHref}>
        画像作成へ進む
      </a>
    );
  }

  return (
    <div className="mission-manual-image-flow">
      <section>
        <p className="mission-manual-image-flow__number">1</p>
        <div>
          <h4>画像を作る文章をコピー</h4>
          <p>投稿テーマが5枚で完結する、画像と文章を作るための指示です。</p>
          <p>
            <strong>1枚目の見出し：</strong>
            <br />「{imageHeadline}」
          </p>
          <ol>
            <li>表紙</li>
            <li>読者の悩み・共感</li>
            <li>理由・気づき</li>
            <li>今日できる解決策</li>
            <li>まとめ・次の行動</li>
          </ol>
          {imageInstruction ? (
            <button
              className="mission-copy-action"
              type="button"
              disabled={controller.pendingAction !== null}
              onClick={() =>
                void controller.copy(mission, imageInstruction.value, imageInstruction.type)
              }
            >
              画像用の文章をコピー
            </button>
          ) : (
            <p>画像用の文章を準備できませんでした。</p>
          )}
        </div>
      </section>
      <section>
        <p className="mission-manual-image-flow__number">2</p>
        <div>
          <h4>画像を作れるAIに貼り付ける</h4>
          <p>ChatGPTなど普段使っている画像AIを開き、入力欄を長押しして「ペースト」を押します。</p>
          <p>画像が1枚だけ出た場合は「次」と送ると、続きの画像を作れます。</p>
        </div>
      </section>
      <section>
        <p className="mission-manual-image-flow__number">3</p>
        <div>
          <h4>5枚の画像をスマホへ保存</h4>
          <p>できた画像を1枚ずつ長押しして「写真に保存」を押します。</p>
        </div>
      </section>
      <section>
        <p className="mission-manual-image-flow__number">4</p>
        <div>
          <h4>動画にする場合はCapCutへ</h4>
          <p>5枚を順番に並べ、1枚を2〜3秒ずつ表示すると短い解説動画として使えます。</p>
        </div>
      </section>
      <section>
        <p className="mission-manual-image-flow__number">5</p>
        <div>
          <h4>投稿文をコピー</h4>
          <p>画像と一緒に載せる文章です。コピーしてInstagramへ貼り付けます。</p>
          {postCaption ? (
            <button
              className="mission-copy-action"
              type="button"
              disabled={controller.pendingAction !== null}
              onClick={() => void controller.copy(mission, postCaption.value, postCaption.type)}
            >
              投稿文をコピー
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
