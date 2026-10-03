# SOCIAL Decision Context — Brief接続準備

> 2026-10-04 JST更新: 準備PR #1110をmainへ復旧したPR #1111はマージ済み。本書の接続条件に対する実装結果は `HASSY_DECISION_CONTEXT_BRIEF_CONNECTION.md` を参照する。本書の以下の内容は準備PR時点の調査記録として保持する。

## 準備PR時点の状態・ADR

2026-10-04 JST。mainは `e935172ceeba740b180ae1ee22843393668e2033`、先行PR #1109 headは `3f53dd4c28fdb901f7c2e57bfe66fb3692a41a48`。開始時に#1109は未マージ、verify/databaseはともに成功を確認した。

本PRは#1109のbranchをbaseにした積み重ねPR。先行PRの変更を本PRのレビュー差分へ混ぜない。mergeは実施しない。

**今回完了するのは接続アダプタとfake Provider通しテストまで。本番DailyMissionGenerationServiceからの呼出しはまだ追加しない。** 実ローダーの選択列／Goalの出所／Service対象判定／safetyLegalの確認条件に未確定部分があるため、未取得値の捏造やPASSEDの仮置きで本番接続しない。

## 調査で確認した接続上の差分

- `apps/web/src/services/service-generation-knowledge-loader.ts` は、最近のActivity/Feedback/Decision/Postをselectで部分取得する。createdAt、idempotencyKey等を取得していない。Phase 1のfull model入力へ合わせるためにダミー値を追加してはならない。
- 同loaderの既存要約だけでは、各PerformanceのGoalを正しく復元できない。旧要約を新Contextの同Goal観測として引き継がない。
- `daily-mission-planning-context.ts` は確定Weeklyに対応するSUPERSEDED Strategyも読み得る。一方、新Contextは現在Goal＋APPROVEDを要求する。互換判断なしに全サービスの生成を新gateへ切り替えない。
- boundaryのauthorization/capability/ownership/safetyLegalはpure関数の自己申告ではない。trusted callerの実検査が必要。法律上の安全保証や企業単位の法務承認を済ませたことを意味させない。

## 実装

- `social-decision-context.ts`：Historyの型を既存モデルのPick投影にする。認可検査に必要なworkspace/Bunshin/actor、実際の判断・時刻を残し、未取得の監査／保存列を要求しない。従来のfull modelも構造的に受け入れられる。
- `social-decision-planner.ts`：`prepareSocialDecisionPlannerInput` が既存DailyMissionPlannerInputと明示scope/boundary/currentGoalからContextを構築し、READY以外はProvider呼出し前に拒否する。
- 旧RECENT_ACTIVITY/FEEDBACK_HISTORY/POST_PERFORMANCE要約と旧instructionを引き継がず、認可済みの型付き観測から作る。その他の既存personality/profile等signalは維持する。Goal／Strategyの既存生成経路を置換しない。
- 履歴はwhitelistされた判断、行動、rating、投稿時刻、同Goalの観測のみ。内部ID、raw metadata、URL列、idempotency key、season参照IDを出さない。自由文内の個人情報やURLの除去を保証するものではなく、既存の安全処理は別途維持する。JSONは3000文字以下の完全な構造で、収まらない観測はomittedCountで明記する。
- 当日の利用可能時間が承認済み時間より短い場合は、生成入力のコピーにだけ下限capを適用する。元StrategyやDBは変更せず、予算を拡大しない。既存GenerateDailyMissionBriefのformat/estimatedMinutes検証を使う。
- `GenerateDailyMissionBrief` 本体とProviderは変更しない。新Agent/Memory/Analytics、DB、UI、課金、Mediaは追加しない。

## 次の接続PRの条件

1. #1109と本PRのレビュー／マージを先に確認する。自動mergeしない。
2. 既存Service runtime configからハッシー対象を特定する。千ノ国メディア等へ会社情報必須gateを一律適用しない。
3. owner認可・Capabilityを実行後、loaderで必要な実列を限定取得する。workspace/group/owner/Bunshinのwhereを維持し、scopeと実rowを照合する。
4. Postの元Snapshot等からGoal provenanceを取り出す。Goal不明はUNKNOWN、元のnullはUNKNOWN。集計済み0や旧summaryから推測で復元しない。
5. safetyLegalのPASSEDに対応する実precheckを確定する。post-generation品質検査だけをpre-generation確認済みと呼ばない。条件未確定なら有効化を停止する。
6. personalMaterials、Campaign/Trend、公式知識の既存安全・期限・権限検査は維持する。生ContextをPromptへdumpしない。
7. `daily-mission-generation.ts` のBrief直前でprepareを呼ぶ。READY以外の利用者向け応答／旧Weekly互換は別途レビューする。Snapshot保存と理由整合は後続課題として残す。

## 検証

Windows / Node 24.21.0 / pnpm 10.10.0。合成fixture、注入したfake Providerのみ。実AI、実DB、Storage、通知、課金は使っていない。

今回の実行結果（2026-10-04 JST）：

- `pnpm --filter @bunshin/capability-social test`：26ファイル、262件成功（本PRの新規13件を含む）。
- `pnpm --filter web exec vitest run test/daily-mission-planning-context-boundary.test.ts test/hassy-sns-goal-propagation-characterization.test.ts test/daily-mission-personalization.test.ts`：3ファイル、11件成功。
- `pnpm architecture:check`／`pnpm test:architecture`：境界検査成功、10件成功。
- SOCIAL packageのtypecheck／lint／build：成功。全体 `pnpm typecheck`：25タスク成功。
- 全体 `pnpm lint`：25タスク成功、エラー0。未変更の `apps/web/app/consent/page.tsx:61` に既存unused eslint-disable警告1件。
- `pnpm format:check`：成功。文書更新後の個別Prettier検査も成功。`git diff --cached --check`：成功。
- apps/webには新prepare関数の参照なし。変更はSOCIAL packageと本説明文書の6ファイルのみ。schema／lockfile／設定／本番入口の差分なし。

初回のpackage型チェックでPerformance topicのunion絞り込み不足を検出し、ガードを追加して再実行成功。失敗を未実行扱いにしていない。fakeの固定topicを実AIのGoal Differential合格とは扱わない。全体build／全体test／実Provider／本番E2E／実DB接続は未実行。Prisma Clientのローカル生成は型チェックに含まれるが、migrationやDB操作はしていない。

## 停止・切り戻し

本番呼出しがないため、準備モジュールとexportをrevertすれば旧生成経路は不変。実稼働の品質改善や本番反映は未確認。人間レビュー前に実生成へ接続しない。
