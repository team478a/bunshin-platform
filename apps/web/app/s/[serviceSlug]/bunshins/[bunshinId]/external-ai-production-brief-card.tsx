'use client';

import type { DailyMissionView } from '../../../../(app)/bunshins/[bunshinId]/daily-mission-section';
import { createExternalAiProductionBrief } from './external-ai-production-brief';
import type { ServiceDailyMissionController } from './service-daily-mission-controller';

export function ExternalAiProductionBriefCard({
  mission,
  controller,
}: {
  mission: DailyMissionView;
  controller: ServiceDailyMissionController;
}) {
  const brief = createExternalAiProductionBrief(mission);
  const disabled = controller.pendingAction !== null;

  return (
    <details className="external-ai-production-brief">
      <summary>Muse等のAIで制作する</summary>
      <p>Muse専用ではありません。ChatGPTなど、文章・画像・動画を作れるAIへ同じ指示を渡せます。</p>
      <p>
        この画面から外部へ自動送信しません。内容を確認し、ご自身でコピーまたは共有したときだけ端末へ渡します。個人情報が含まれていないか、送る前に確認してください。
      </p>
      <div className="external-ai-production-brief__actions">
        <button
          className="button button--primary"
          type="button"
          disabled={disabled}
          onClick={() => void controller.handOffProductionBrief(mission, brief, 'COPY')}
        >
          制作指示をコピー
        </button>
        <button
          className="button button--secondary"
          type="button"
          disabled={disabled}
          onClick={() => void controller.handOffProductionBrief(mission, brief, 'SHARE')}
        >
          スマホで共有
        </button>
      </div>
      <details>
        <summary>渡す制作指示を確認する</summary>
        <textarea
          aria-label="外部AIへ渡す制作指示"
          readOnly
          rows={18}
          value={brief}
          onFocus={(event) => event.currentTarget.select()}
        />
      </details>
    </details>
  );
}
