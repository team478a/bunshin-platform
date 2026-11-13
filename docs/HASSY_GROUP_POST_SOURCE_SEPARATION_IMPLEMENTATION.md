# ハッシー企業・グループ型SNS発信支援 PR-A 実装報告

更新日: 2026-11-13
対象: Phase 3「投稿画面で自分の投稿とグループの企画を分ける」
基準: `origin/main` `c30568c3`（PR #1523 merge後）

## 1. 調査した内容

- Service参加者の投稿画面は `/s/{slug}/bunshins/{bunshinId}` の `ServiceDailyMissionSection` が表示する。
- 日常投稿とCampaign投稿案は既存の `DailyMission.campaignId` で区別できる。新しい種別や保存先は不要。
- Campaign投稿案の計画対象は既存 `PrismaCampaignRepository.planningWhere()` が、Campaign、参加状態、Group所属、商品版・割当、Service境界を確認する。
- コピー可否は既存 `AuthorizeDailyMissionCopy` とPR #1516の再判定を使う。企業確認はPR #1518の既存経路を使う。
- 個人Workspaceは別の `DailyMissionSection`、業務日報型Serviceは `businessFree`、千ノ国メディア等の画像導線は `imageCreationBaseHref` で別処理になっている。

## 2. 実装した機能

- Campaign投稿案が1件以上ある通常Serviceでは、今日と過去の投稿案を「自分の投稿」「グループの企画」に分けて表示する。
- 「グループの企画」には、参加中・参加可能な企画を確認する既存画面への導線を出す。
- 採用後に「そのままコピー」「自分で編集」「Muse等のAIで制作」の3つの使い方を示す。外部AIは任意であり、コピー後にSNS側で編集するだけでも完結する。
- Campaign実績のないService、個人Workspace、業務日報型Serviceの従来表示は変更しない。

## 3. 主要な設計判断

- 新しいDB列、テーブル、設定項目、API、Campaign読取は追加せず、既存の `campaignId` を表示上の区分にだけ使う。
- 参加可否をUIで再実装しない。計画時の `planningWhere()` とコピー時のPR #1516の判定を正本とする。
- 「自分で編集」は企業確認済み本文を書き換えて保存する機能にはせず、本人がコピー後にSNS側で編集する案内とする。本人のSNS公開承認と企業の広告確認を統合しない。
- Phase 4の制作指示生成やMuse Connectorは本PRへ含めない。

## 4. 変更したファイル

- `apps/web/app/s/[serviceSlug]/bunshins/[bunshinId]/service-bunshin-detail-view.tsx`
- `apps/web/app/s/[serviceSlug]/bunshins/[bunshinId]/service-daily-mission-section.tsx`
- `apps/web/app/s/[serviceSlug]/bunshins/[bunshinId]/service-daily-mission-accepted.tsx`
- `apps/web/app/s/[serviceSlug]/bunshins/[bunshinId]/service-mission-date-filter.ts`
- `apps/web/app/styles.css`
- `apps/web/test/service-daily-missions-boundary.test.ts`
- `apps/web/test/service-mission-date-filter.test.ts`
- `docs/HASSY_GROUP_POST_SOURCE_SEPARATION_IMPLEMENTATION.md`

DB / migrationの変更はない。新しい `/s/{slug}/` ページも追加していないため、LINE戻り先許可リストの変更はない。

## 5. 検証

- `pnpm format:check`: 成功
- `pnpm typecheck`: 成功
- `pnpm lint`: 成功（architecture checkを含む）
- `pnpm test`: 関連テストを含む大半は成功。並列負荷時に既存の5秒タイムアウトが5件発生
  - `packages/database/test/apply-release-20261020.test.ts` 3件
  - `apps/web/test/daily-missions.test.ts` 2件
- 上記2ファイルの単独再実行: 22件すべて成功
- 対象テスト単独実行: 15件すべて成功
- `pnpm build`: 成功
- `git diff --check`: 成功

DB変更がないため、使い捨てPostgreSQLの統合テストは対象外とした。認証済み画面を開く非本番ログイン情報がないため、390px幅・LINE内ブラウザでの実画面確認は未実施。

## 6. 実際の操作フロー

1. 投稿パートナーが既存の「グループの企画」で参加を選ぶ。
2. 既存の計画条件を満たしたCampaign投稿案がDaily Missionとして作られる。
3. 投稿画面では日常投稿が「自分の投稿」、Campaign投稿案が「グループの企画」に分かれる。
4. 投稿案を採用すると、コピー、コピー後の本人編集、任意の外部AI利用の3方式を確認できる。
5. コピー時は既存のCampaign条件・企業確認を再判定する。SNSへの公開と投稿完了記録は従来どおり本人が行う。

## 7. 状態と未完成の機能

- 実装済み: 上記UI分離、利用方法表示、自動テスト。
- 検証済み: format / typecheck / lint / 対象テスト / build。全体testのタイムアウト5件は単独再実行で成功。
- 未検証: 非本番の実データ、スマホ実機、LINE内ブラウザ、1企業・5人・1Campaignの通し確認。
- 本番反映済み: いいえ。mainへのマージ、本番deploy、本番DB変更は行っていない。
- 未完成: 投稿頻度の本人設定（PR-B）、中立な外部AI制作指示の生成・共有（PR-C）、Muse Connector差分設計。

## 8. 次PRへ進める条件と先行テスト判定

- PR-AはDraftレビュー、CI `verify` / `database` 成功、最新mainへの追従が必要。
- PR-Bは既存の通知・配信頻度保存先を監査し、migration不要と確認できた場合だけ実装する。新しい保存先が必要なら作らず停止する。
- 先行テスト判定: **No-Go**。非本番環境・専用LINE検証チャネルでの1企業・5人・1Campaign通し確認と、本番反映の証拠がないため。
