'use client';

import { SocialInsightRecorderForm } from './social-insight-recorder-form';
import { SocialInsightRecorderResults } from './social-insight-recorder-results';
import type { SocialInsightRecorderProps } from './social-insight-recorder-types';
import { useSocialInsightRecorder } from './use-social-insight-recorder';

export function SocialInsightRecorder(props: SocialInsightRecorderProps) {
  const controller = useSocialInsightRecorder(props);

  return (
    <section className="service-entry__card social-insight-recorder" id="sns-numbers">
      <p className="eyebrow">投稿後に1分で記録</p>
      <h2>投稿の反応を次に生かす</h2>
      <p>
        Instagramなどの「インサイト」画面をスクリーンショットしてください。数字を比較し、次の投稿内容を改善します。画像自体は保存しません。
      </p>
      <SocialInsightRecorderForm
        profiles={props.profiles}
        postedMissions={props.postedMissions}
        controller={controller}
      />
      <SocialInsightRecorderResults
        mode={controller.mode}
        snapshots={controller.snapshots}
        postPerformances={controller.postPerformances}
      />
    </section>
  );
}
