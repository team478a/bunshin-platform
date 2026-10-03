# SOCIAL Decision Context — Brief直前接続

## 状態

2026-10-04 JST。PR #1111のmain反映（merge commit `6d14655b12ee123de4e14bcbdbbc605d999fabd7`）を確認後、そのmainから作業を開始した。本変更は、本番Daily Mission生成のうち既存Service設定で対象となる経路だけにDecision ContextをBrief生成直前で接続する小さな変更である。

新Agent、Memory、Analytics、テーブル、migration、UI、課金、画像・動画生成、SNS自動投稿は追加しない。merge、本番deploy、実課金API呼出しは実施しない。

## 1. 調査した内容

- 対象判定はservice slugや運営会社名ではなく、既存Service onboarding runtime configの `businessProfileEnabled && dailyIdeaDelivery.enabled` とする。対象外Serviceは従来のplanner inputをそのまま使う。
- Daily Mission生成は接続地点より前に `RequireActiveBunshinCapability`、scope付きのMission取得、Bunshin・Social Profile・Strategy・Weekly Plan取得を完了している。このtrusted caller境界をauthorization、capability、ownershipの根拠とする。
- `safetyLegal` の具体的なprecheckは、対象Serviceが有効で、actorのGroup MembershipがACTIVEかつconsentedであり、現在有効な各種法的文書のlatest版をすべてaccept済みであることとする。これは生成内容に対する法律上の安全保証ではない。
- Post PerformanceのGoal provenanceは各Daily Missionの `GenerationContextSnapshot.payload.strategy.goal` だけを正本とする。Snapshotがない、または不正な場合は `null` / UNKNOWNのままとし、現在Goal、旧summary、集計値から推測しない。
- 旧Weekly Planの `strategyId` / `strategyGoal` がともにnullの場合は、その生成リクエスト内のコピーに限って現在のAPPROVED Strategyを投影する。DBを更新しない。
- Strategy snapshotを持つ確定Weeklyは、新版承認後に元StrategyがSUPERSEDEDでも、そのIDとGoalが一致する場合だけ残りのDaily Missionを完走できる。snapshot不一致のSUPERSEDED Strategyは拒否する。

## 2. 変更したファイル

- `apps/web/src/services/daily-mission-decision-context.ts`: 対象判定後のboundary、Goal outcome、旧Weekly互換をplanner接続用に構成するadapterを追加。
- `apps/web/src/services/service-generation-knowledge-loader.ts`: scope付きの型付き観測、Snapshot由来Goal、Service法的同意precheckを限定列から構成。
- `apps/web/src/services/daily-mission-generation.ts`: 既存Brief runtimeの直前へadapterを接続。
- `packages/capability-social/src/social-decision-context.ts`: Weekly snapshotと一致するSUPERSEDED Strategyを正規化時に許可。
- `packages/capability-social/src/mission-generation.ts`: Brief本体でも同じSUPERSEDED互換条件を適用。
- 対応するweb / capability-socialテストと本書を追加・更新。

## 3. 主要な設計判断

- ハッシーという文字列やslugをコードへ埋め込まず、既存runtime configをfeature boundaryにする。これにより他Serviceへ一律に会社情報必須gateを掛けない。
- authorization、capability、ownershipをpure normalizer自身に判定させない。既存の実repository検査が成功した後の接続adapterだけがPASSEDを渡す。
- `safetyLegal` は同意状態が確認できた場合だけPASSEDとし、membership不在・未同意・最新文書未acceptはUNKNOWNとしてBrief生成前に停止する。品質検査や推測でPASSEDにしない。
- Performanceは型付きmanual metricsが読める投稿だけを観測化し、同Goal比較への採用はSnapshot Goalが現在Goalと一致する場合に限定する。未取得のengagement集計値はnullのままにする。
- 旧Weekly互換は生成入力のコピーだけに閉じ、永続化データやStrategy状態を変更しない。SUPERSEDED許可もWeekly snapshotとのID・Goal完全一致に限定する。
- 既存のCampaign / Trend / 公式知識 / personal materials / Memory選択と、Brief後の品質・保存処理は変更しない。

## 4. 実行した検証

- `pnpm architecture:check` / `pnpm test:architecture`: 成功、architectureテスト10件成功。
- `pnpm typecheck`: 25 tasks成功。
- `pnpm lint`: 25 tasks成功、error 0。未変更の `apps/web/app/consent/page.tsx` に既存warning 1件。
- `pnpm format:check`: 成功。
- `pnpm test`: 25 tasks成功。web 429 files / 2769 tests成功、live test 2件skip。capability-social 26 files / 265 tests成功を含む。
- `pnpm build`: 13 tasks成功、Next.js production build成功。
- `git diff --check`: 成功。

初回の全体testでは、Brief入力を呼出し箇所のinline objectに固定していた既存source boundary test 1件が、型付き変数とadapterを導入した構造変更を検出した。Provider配線の責務境界は維持したまま、現在のruntime contractを検査するようテストを更新し、対象testと全体testを再実行して成功した。

実AI、実DB接続、Storage、通知、課金、本番deployは使用しない。

## 5. 未解決事項

- Decision Contextの最小metadataとpersonalization理由のGenerationContextSnapshot保存は、後続の `HASSY_DECISION_METADATA_SNAPSHOT.md` で扱う。本文品質repair後の理由整合は引き続き未解決。
- `safetyLegal` はService参加・法的文書同意のprecondition名であり、個別投稿内容の法令適合を保証しない。別の実安全検査が導入される場合は境界条件を拡張する。
- Snapshotを持たない過去Post PerformanceはGoal不明のためGoal別最適化に使わない。データを推測補完しない。
- 本番での品質改善、実Provider出力、運用時のUNKNOWN発生率は未確認。

## 6. 次Phaseへ進める条件

1. 本PRの人間レビューとCI成功を確認する。自動mergeしない。
2. 実Service設定・membership・法的同意が期待どおり整備され、UNKNOWNをPASSEDへ読み替えずに運用できることを確認する。
3. 本番品質評価が必要な場合は、実課金APIやdeployについて別途明示的な承認を得る。
4. Snapshot保存や追加安全検査は、本PRへ混ぜず独立した小さな設計・実装単位にする。

## 停止・切り戻し

runtime configの対象条件を満たさないServiceは旧経路のまま。接続を止める場合はDaily Mission生成直前のadapter呼出しとloaderのDecision Context構成をrevertすればよく、schemaや永続データの切り戻しは不要である。
