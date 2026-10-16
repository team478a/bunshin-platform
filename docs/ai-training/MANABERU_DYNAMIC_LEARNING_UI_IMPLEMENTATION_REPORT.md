# マナベルスタイル 動的学習ホーム・導線 実装報告

- 対象: DYNAMIC_V1の受講者ホーム、学習希望画面、個人LINEリッチメニュー導線
- 基準: Mainline v3 PR-B。PR-A（#1323）のmainマージ後に実装
- 公開範囲: Draft PRでレビュー中。本番デプロイ・受講者への有効化は未実施

## 1. 調査した内容

- AI研修Enrollmentページが、動的モードでも固定Pilot用の`AiTrainingCard`へ到達し得ることを確認。
- サービスホームの「今日の学習」がプログラム一覧止まりで、参加資格のある動的Enrollmentへ直接戻れないことを確認。
- LINE個人リッチメニューの課題名が固定Pilotの`currentAssignment`を参照しており、動的実践を反映しないことを確認。
- 固定研修と他サービスの既存経路を維持することを変更条件とした。

## 2. 変更したファイル

- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/page.tsx`
- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/learning-request/page.tsx`
- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/learning-request/card.tsx`
- `apps/web/app/s/[serviceSlug]/home/page.tsx`
- `apps/web/app/s/[serviceSlug]/home/service-home-overview-sections.tsx`
- `apps/web/src/http/personal-learning-pilot.ts`
- `apps/web/src/services/personal-learning-line-rich-menu.ts`
- `apps/web/src/services/personal-learning-pilot-access.ts`
- `apps/web/test/manaberu-dynamic-ui.test.tsx`
- `apps/web/test/service-home-module-boundary.test.ts`
- `apps/web/test/personal-learning-line-rich-menu.test.ts`
- `apps/web/test/personal-learning-pilot-http.test.ts`

## 3. 主要な設計判断

- DYNAMIC_V1判定はサーバー側で行い、固定Pilot画面を表示せず、学習希望・動的実践画面へredirectする。
- ホームの直接リンクは、サービス・Enrollment・参加期間・本人の参加枠・AI利用同意をサーバーで確認できた場合だけ設定する。該当しない利用者は既存のプログラム一覧経路を通る。
- 動的モードにのみ「内部テスト中」と学習希望に沿った案内を表示し、固定研修の検証表示は維持する。
- LINEメニュー名は、認可済みサーバーActorが持つProgram設定を基に動的モードを判定し、動的な現在実践から取得する。固定モードは従来どおりPilot assignmentを使う。未開始なら動的実践名を推測・生成せず、メニュー有効化を拒否する。
- 新しいDB schema・migration・AI呼び出し・Production設定変更は行わない。

## 4. 実行した検証

- `pnpm format:check` — 成功
- `pnpm lint` — 成功（既存の未使用eslint-disable警告2件のみ）
- `pnpm typecheck` — 成功
- `pnpm test` — 498 test files passed、3,587 tests passed、2 skipped
- `pnpm build` — 成功
- 関連する4テストファイル — 37 tests passed
- `git diff --check` — 成功

## 5. 未解決事項

- 実LINEアカウント・実受講者でリッチメニュー表示と最新実践名の更新を通し確認していない。
- 本番でのFeature/Gate、Program設定、AI利用同意・参加枠の現状は変更・確認していない。
- 学習希望の保存後、動的課題の提案から開始・記録までを一連の受講者運用として検証する作業が残る。

## 6. 次Phaseへ進める条件

- このPRのレビューとmainへのマージ。
- 実LINE確認を含む次の作業単位について、Pilotの有効化条件・参加者範囲・AI呼び出しの上限を別途確認する。
- Productionデプロイや受講者への公開は、明示的なリリース確認と本番設定・migration差分の別レビュー後に行う。
