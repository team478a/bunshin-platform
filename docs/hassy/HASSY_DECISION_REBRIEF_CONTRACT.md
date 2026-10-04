# SOCIAL Decision ReBrief Contract

## 状態

2026-10-04 JST。PR #1114のmain反映（merge commit `75f540456ea0319d6a8a00d0fc68dfc2e2a231ae`）を確認後、そのmainから開始した。Decision Context対象の品質結果を、同じ判断の維持、reBrief要求、内容拒否へ分類する版付きpure contractを追加する。

新しいAgent、Memory、Analytics、テーブル、migration、UI、課金、画像・動画生成、SNS自動投稿は追加しない。自動reBrief、追加Provider呼出し、merge、本番deploy、実課金API、実AIは実施しない。

## 1. 調査した内容

- PR #1114のguardはREVISEまたは本文検査issueを保存前に停止するが、次に必要なdecision stageを型として持たなかった。
- 品質REJECTは内容自体を拒否すべきで、reBrief可能と暗黙判断してはいけない。
- 既存本文検査issueは作成指示露出、完全重複、実質重複の3種で、いずれも本文だけのvariant retryより先にreBriefを要求する。
- pure contractならProvider、DB、認可、課金を起動せず、合成fixtureで順序を固定できる。

## 2. 変更したファイル

- `packages/capability-social/src/social-decision-repair.ts`: 版付きrepair disposition契約とpure policyを追加。
- `packages/capability-social/src/index.ts`: public exportを追加。
- `apps/web/src/services/daily-mission-quality-pipeline.ts`: 既存guardの分岐をpure policy結果へ接続。
- capability-socialとwebの対応テスト、Decision Log、既存guard文書、本書を更新。

## 3. 主要な設計判断

- `PASS + inspection issueなし` は `KEEP_DECISION`。現在stageは `DAILY`、次stageはない。
- `REVISE` または本文検査issueは `REBRIEF_REQUIRED`。次stageは `REVISED_BRIEF`。
- `REJECT` は `REJECT_CONTENT`。安全に修正可能と推測せず、次stageを付けない。
- policy入力と出力に本文、自由入力、Memory、識別子を含めない。issue codeは80文字以内・最大20種へ正規化する。
- 本契約は再実行を行わない。quota、Usage、idempotency、revision参照、保存atomicityは実接続PRのレビュー事項として残す。

## 4. 実行した検証

- pure contract fixture: PASS、REVISE、3種の本文検査issue、REJECT、重複issue code、契約外inspection issue。
- web guard: 従来repair、bounded failure、REVISE fail-closed、重複fail-closed。
- 初回のweb対象testでpure policyをtype-only importへ含めたため実行時ReferenceErrorを検出した。value importへ修正し、対象testと型検査を再実行して成功した。
- `pnpm architecture:check`: 成功。
- `pnpm test:architecture`: 10件成功。
- `pnpm typecheck`: 25/25 tasks成功。
- `pnpm lint`: 25/25 tasks成功（既存の `apps/web/app/consent/page.tsx:61` のunused eslint-disable warningのみ）。
- `pnpm format:check`: 成功。
- `pnpm test`: 25/25 tasks成功（application 693件、capability-social 273件、database 828件、web 2771件成功・2件skip）。
- `pnpm build`: Node.js 24.19.0で13/13 tasks成功。

実AI、実DB接続、Storage、通知、課金、本番deployは使用しない。

## 5. 未解決事項

- `REBRIEF_REQUIRED` を実際に再Brief生成へ接続する際の最大試行数、quota、Usage、idempotency。
- 元decisionとのrevision参照を既存Snapshotへどう保存するか。
- reBriefもREVISE／重複となった場合の最終失敗状態と運用通知。

## 6. 次Phaseへ進める条件

1. 本PRの人間レビューとCI成功を確認する。自動mergeしない。
2. reBrief入力で維持する境界、変更を許可する項目、最大1回の試行条件を合成fixtureで合意する。
3. 自動reBrief、UI、Photo First、別案へ進む場合は本PRへ混ぜず独立した小PRにする。

## 停止・切り戻し

web guardを従来の直接条件へ戻し、pure contractとexportをrevertできる。DB migrationや保存済みSnapshotの切り戻しは発生しない。
