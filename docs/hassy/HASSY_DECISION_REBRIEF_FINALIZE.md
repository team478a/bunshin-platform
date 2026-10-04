# SOCIAL Decision ReBrief Finalize Contract

## 状態

2026-10-04 JST。PR #1117のmain反映（merge commit `4105190f36451637a7eba06c47fdcbbd4380a0c1`）とCI成功を確認し、そのmainから開始した。未接続reBrief adapterの出力を元の内部参照付きBriefへ戻すpure finalize契約を追加する。

新しいAgent、Memory、Analytics、テーブル、migration、UI、課金、画像・動画生成、SNS自動投稿は追加しない。本番Daily Mission経路への接続、Provider呼出し、quota／Usage消費、保存、merge、本番deploy、実課金API、実AIは実施しない。

## 1. 調査した内容

- Provider安全なreBrief準備結果は内部IDとCampaign IDを持たず、adapter出力は変更可能な6項目だけを返す。
- 元の `DailyMissionBrief` はsocialProfile、Weekly item、Campaign、trendの内部参照を持つため、Provider出力のspreadで復元すると余分なruntime fieldによる固定値上書きを許し得る。
- preparationと別の元Briefを組み合わせると、型が正しくてもCampaignやtrend参照を別判断へ誤接続し得る。
- Goal、Strategy、Weekly goal/angle等はBrief出力fieldではないため、finalizeで新たに生成せず、準備時のlocked constraintsとして保持する。

## 2. 変更したファイル

- `packages/capability-social/src/social-decision-rebrief.ts`: Provider出力契約、preparation再照合、pure finalize関数。
- `packages/capability-social/test/social-decision-rebrief.test.ts`: 固定参照保持、取り違え、drift、余分なfield、時間、source validationのfixture。
- `apps/web/src/providers/openai-daily-mission-rebrief-planner.ts`: adapter出力型をdomain finalize契約へ一致させるtype-only変更。
- `docs/DECISION_LOG.md`: 明示投影と固定参照復元の判断を記録。
- 本書: 検証結果と後続条件を記録。

## 3. 主要な設計判断

- finalizeはProvider出力をspreadせず、変更可能な6項目を個別にコピーする。
- mission date、socialProfile ID、Weekly item ID、format、Campaign ID、classification、trend candidate IDは元Briefからだけ復元する。
- preparationのpolicy／stage／attempt、mutable field一覧、元判断、Briefに表現されるlocked constraintsを元Briefと再照合する。
- 余分なoutput field、空文字、長さ超過、時間超過、空・未知・重複personalization sourceをdomain境界でも拒否する。
- 関数は入力を変更せず、新しいBrief値を返す。保存、revision metadata生成、Provider呼出しは行わない。

## 4. 実行した検証

- reBrief契約対象test: 21件成功。
- OpenAI reBrief adapter対象test: 4件成功。adapter出力型とdomain finalize入力型の一致を確認。
- architecture boundary test: 10件成功。architecture checkも成功。
- `pnpm typecheck`: 25/25 tasks成功。
- `pnpm lint`: 25/25 tasks成功。既存の `apps/web/app/consent/page.tsx` のunused eslint-disable warning 1件のみ。
- `pnpm format:check`: 成功。
- `pnpm test`: 25/25 tasks成功。主要件数はcapability-social 294件、database 828件、web 2775件成功。webのlive test 2件は既定どおりskip。
- `pnpm build`: 13/13 tasks成功。

対象fixtureでは、6項目だけの変更、元の内部ID／Campaign ID／trend candidate ID／format／classificationの保持、別Briefとの取り違え、locked constraintsのdrift、余分なfield、時間超過、未知personalization sourceの拒否を確認した。

実AI、実DB接続、Storage、通知、課金、本番deployは使用しない。

## 5. 未解決事項

- adapterを最大1回だけ呼び、finalizeするorchestration。
- quota／Usageのidempotency suffixと失敗時の扱い。
- revision参照を既存Generation Context Snapshotへ保存する方法。
- reBrief後の品質再検査がREVISE／REJECT／重複となった場合の最終失敗状態と運用通知。

## 6. 次Phaseへ進める条件

1. 本PRの人間レビューとCI成功を確認する。自動mergeしない。
2. 実接続前に最大1回、quota／Usage、再品質検査、fail-closedの責務と既存orchestrationへの最小接続点を確定する。
3. UNKNOWNのauthorization／Capability／ownership／safetyLegalをPASSEDへ補完せず、既存のtrusted precheck結果だけを使用する。

## 停止・切り戻し

pure finalize関数、fixture、文書だけをrevertできる。既存Daily Mission生成、本番データ、DB schemaへの影響はない。
