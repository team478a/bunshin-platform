'use client';

import { useState } from 'react';

import {
  copyOptions,
  missionWithSelectedVariant,
  type DailyMissionView,
} from '../../../../(app)/bunshins/[bunshinId]/daily-mission-section';
import type { ServiceDailyMissionController } from './service-daily-mission-controller';

export function ServiceDailyMissionImageGuide({
  mission,
  serviceSlug,
  imageCreationHref,
  controller,
}: {
  mission: DailyMissionView;
  serviceSlug: string;
  imageCreationHref: string | null;
  controller: ServiceDailyMissionController;
}) {
  const [copiedSlides, setCopiedSlides] = useState<number[]>([]);
  const preparedCopyOptions = copyOptions(missionWithSelectedVariant(mission), serviceSlug);
  const imageInstructions = preparedCopyOptions.filter(
    (option) =>
      option.type === 'COPIED_IMAGE_INSTRUCTION' &&
      'metadata' in option &&
      option.metadata.slideIndex >= 1 &&
      option.metadata.slideIndex <= 5,
  );
  const bulkImageInstruction = preparedCopyOptions.find(
    (option) =>
      option.type === 'COPIED_IMAGE_INSTRUCTION' &&
      'metadata' in option &&
      option.metadata.slideIndex === 0,
  );
  const postCaption = preparedCopyOptions.find((option) => option.type === 'COPIED_TEXT');
  const nextSlideIndex = [1, 2, 3, 4, 5].find((index) => !copiedSlides.includes(index)) ?? null;

  return (
    <div className="mission-manual-image-flow">
      {imageCreationHref ? (
        <a className="button mission-create-image" href={imageCreationHref}>
          画像作成へ進む
        </a>
      ) : null}
      <section>
        <p className="mission-manual-image-flow__number">1</p>
        <div>
          <h4>画像を1枚ずつ作る</h4>
          <p>
            ChatGPTなどの画像AIで、同じ会話の中に1枚目から順番に貼り付けてください。1回貼り付けると1枚できます
          </p>
          {imageInstructions.length === 5 ? (
            <ol className="mission-image-instruction-list">
              {imageInstructions.map((option) => {
                const slideIndex = 'metadata' in option ? option.metadata.slideIndex : 0;
                const copied = copiedSlides.includes(slideIndex);
                const isNext = nextSlideIndex === slideIndex;
                const role = 'role' in option ? option.role : '';
                const headline = 'headline' in option ? option.headline : '';
                return (
                  <li
                    key={slideIndex}
                    className={isNext ? 'mission-image-instruction-list__next' : undefined}
                    aria-current={isNext ? 'step' : undefined}
                  >
                    <div>
                      <strong>{option.label}</strong>
                      {copied ? <span aria-label="コピー済み"> ✓ コピー済み</span> : null}
                      {isNext ? <span> 次にコピー</span> : null}
                    </div>
                    <button
                      className="mission-copy-action"
                      type="button"
                      disabled={controller.pendingAction !== null}
                      onClick={() =>
                        void controller
                          .copy(
                            mission,
                            option.value,
                            option.type,
                            'metadata' in option ? option.metadata : undefined,
                          )
                          .then((recorded) => {
                            if (recorded) {
                              setCopiedSlides((current) =>
                                current.includes(slideIndex) ? current : [...current, slideIndex],
                              );
                            }
                          })
                      }
                    >
                      {option.label}
                      <small>
                        {role} — 「{headline}」
                      </small>
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p>画像用の文章を準備できませんでした。</p>
          )}
          {bulkImageInstruction && 'metadata' in bulkImageInstruction ? (
            <button
              className="mission-copy-action mission-copy-action--subtle"
              type="button"
              disabled={controller.pendingAction !== null}
              onClick={() =>
                void controller.copy(
                  mission,
                  bulkImageInstruction.value,
                  bulkImageInstruction.type,
                  bulkImageInstruction.metadata,
                )
              }
            >
              5枚まとめてコピー（慣れた方向け）
            </button>
          ) : null}
        </div>
      </section>
      <section>
        <p className="mission-manual-image-flow__number">2</p>
        <div>
          <h4>画像を作れるAIに貼り付ける</h4>
          <p>コピーしたページを貼り付け、できた画像を確認してから次のページを貼り付けます。</p>
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
