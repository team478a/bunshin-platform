# SOCIAL Decision ReBrief Provider Adapter

## 状態

2026-10-04 JST。PR #1116のmain反映（merge commit `5b6e7d99a85d93941bffeded42e2b067b012b5b4`）を確認後、そのmainから開始した。reBrief入力契約を既存Planner Provider形式へ安全に投影する未接続adapterを追加する。

新しいAgent、Memory、Analytics、テーブル、migration、UI、課金、画像・動画生成、SNS自動投稿は追加しない。本番Daily Mission経路への接続、quota／Usage消費、保存、merge、本番deploy、実課金API、実AIは実施しない。

## 1. 調査した内容

- 通常Brief用のOpenAI adapterは `DailyMissionPlannerProviderInput` を直接送信し、通常生成に必要なCampaign、Product Pack、Personality等の内部参照を含む。
- reBriefは前Briefと固定条件を持つため、通常Promptへrepair指示を足すだけでは、固定値の変更と内部ID混入をadapter境界で検出できない。
- OpenAI Structured Outputsのschemaだけでは利用可能時間、提供済みpersonalization source、重複sourceを完全には保証できないため、応答後のruntime validationも必要。
- 既存Daily Mission生成は `runDailyMissionBriefGeneration` だけをcompositionしており、新adapterを追加しても明示接続しなければ本番挙動は変わらない。

## 2. 変更したファイル

- `apps/web/src/providers/openai-daily-mission-rebrief-planner.ts`: 未接続のProvider adapter、入力投影、strict schema、runtime validation。
- `apps/web/test/openai-daily-mission-rebrief-planner.test.ts`: fake fetchによるadapter fixture。
- `packages/capability-social/src/social-decision-rebrief.ts`: trend利用有無を固定条件へ追加。
- capability fixture、Decision Log、本書を更新。

## 3. 主要な設計判断

- Prompt Versionは通常Briefと分離し、`daily-mission-rebrief-v1` とする。
- Provider入力前に日付、timezone、platform、Goal、Weekly goal/angle、format、利用可能時間、Campaign有無、classificationを再照合する。
- Provider入力からCampaign／Product Pack／Group／Personalityの内部IDとasset URLを除外する。承認済みfacts、rules、asset label／usage termsは維持する。
- strict schemaはtopic、angle、reason、estimatedMinutes、personalization source/reasonの6項目だけを許可する。
- 応答後に余分なfield、時間超過、未提供／重複personalization source、空文字、長さ超過を拒否する。
- trend利用有無は固定し、reBrief Providerの変更可能fieldへ含めない。
- adapterは本番compositionから参照しない。実接続、quota／Usage、revision保存、再失敗処理は後続PRとする。

## 4. 実行した検証

- reBrief契約対象test: 11件成功。
- OpenAI reBrief adapter対象test: 4件成功。fake fetchのみを使用し、context drift時にProviderを呼ばないこと、内部ID／asset URLを送らないこと、応答検証、エラー秘匿を確認。
- architecture boundary test: 10件成功。architecture checkも成功。
- `pnpm typecheck`: 25/25 tasks成功。
- `pnpm lint`: 25/25 tasks成功。既存の `apps/web/app/consent/page.tsx` のunused eslint-disable warning 1件のみ。
- `pnpm format:check`: 成功。
- `pnpm test`: 25/25 tasks成功。主要件数はcapability-social 284件、database 828件、web 2775件成功。webのlive test 2件は既定どおりskip。
- `pnpm build`: 13/13 tasks成功。

実装中、Provider応答のpersonalization source配列に対してlintがunsafe argumentを検出したため、unknownからの明示type guardへ修正し、上記全体検証を再実行した。

実AI、実DB接続、Storage、通知、課金、本番deployは使用しない。

## 5. 未解決事項

- adapterを呼ぶ最大1回のorchestrationとquota／Usage idempotency suffix。
- reBrief結果を元の内部ID付きBriefへ戻す検証とrevision metadata。
- reBrief後の本文がREVISE／REJECT／重複となった場合の最終失敗状態と運用通知。
- revision参照を既存Generation Context Snapshotへ保存する方法。

## 6. 次Phaseへ進める条件

1. 本PRの人間レビューとCI成功を確認する。自動mergeしない。
2. adapter結果を元Briefへ戻す際、固定fieldとtrend参照が変化しないpure finalize契約を先に追加する。
3. 実接続は最大1回、明示quota／Usage、再失敗fail-closedを同じテストで証明できる場合だけ別PRで行う。

## 停止・切り戻し

未接続adapter、fixture、trend固定metadata、文書だけをrevertできる。既存Daily Mission生成、本番データ、DB schemaへの影響はない。
