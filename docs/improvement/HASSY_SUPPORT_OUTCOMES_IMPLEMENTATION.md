# Hassy Goal別支援結果読取Adapter

実装基準: `83b14defaf75f6e965abf00e9366560a20e20a0b`（PR #1082 merge）。2026-10-03 JST。コード/架空Prismaの契約試験と本番確認は別。

## 実装と接続範囲

- SOCIAL: `HASSY_SUPPORT_IMPROVEMENT_DEFINITION`、`supportGoalAtOffer`、`summarizeHassySupportOutcomes`。
- database: `PrismaHassySupportImprovementAdapter.readObservations/summarize`。既存`SocialActivitySupportIntervention`を実Prisma queryで読む。共通`CollectImprovementObservations`へ接続しscope/期間/metadata/重複を検査する。
- applicationの既存入力validationを`validateImprovementReadRequest`として公開し、直接Adapterを呼んでも不正期間/件数をDB読取前に拒否する。認可の代用ではない。
- 全packageの公開入口からexport。HTTP/API、管理画面、定期Jobへのcompositionは未接続。schema/migration/依存関係変更なし、既存の支援提供/遷移処理を変更しない。

## 認可・個票・Privacy

固定scopeはtrusted compositionがtenant/Workspace/Service/Package/Adapter/環境の正本から解決する。本Adapterはそれとの一致と、DBのACTIVE SERVICE_OWNER/SERVICE_ADMIN・ACTIVE User/Service/Workspaceを同一RepeatableRead Transactionで確認する。拒否はNOT_FOUND、支援読取を行わない。Platform Admin/OEM staffへの権限拡張やブランド名からのtenant推定をしない。

queryはWorkspace/Serviceと、指定時User/Bunshinで限定し、取得後にも検証する。CaseのBunshin ID/Workspace/ServiceとBunshin本人のownerUserIdを照合し、別UserのBunshinが関連づいた行を拒否する。支援提供時点の参加者cohortを読むため退会者をACTIVEフィルタで消さない。原本削除済みの行は復元できない。本番削除前履歴を含む全期間の完全な記録率は未確認。

DBからJSON Snapshotを読む必要はあるが、返却はselectionの許可Goal/mode/fallbackReasonと実時刻由来のbooleanのみ。title/reason/steps、最新Goal、Evidence/Memory、本文/写真/Tokenを返さない。個票のuserRef/bunshinRef/sourceは内部認可用途であり匿名化済みではない。集計は直接個人参照を返さないが、少数セルの再識別抑止は未実装。UI/指示案へ公開する前に方針・テストが必要。

## 指標定義 v1

- 提供cohort: `fromInclusive <= offeredAt < toExclusive`。結果の締切も`toExclusive`（排他的）。提供日の異なる支援を分母へ混ぜない。
- offered: 当該bucketの支援行件数。ユーザー人数とは異なる。
- accepted/completed/skipped: 対応する実時刻が提供時刻以降かつ締切未満の件数。COMPLETEDでもacceptedAtがnullならacceptしたと推測しない。終端statusから過去の状態を再現しない。
- 現在statusは原本の情報として観測Envelopeにあるが期間集計の代用にしない。記録後の時刻訂正、原本削除、状態競合の全履歴は復元しない。
- timestampMissing: 現在statusの対応時刻が欠損、提供前の時刻、完了と見送りの両立、完了後のaccept等の矛盾。欠損bucketはPARTIAL、完了率null。欠損行は分母から黙って除外しない。
- completionRate: 完全なcohortだけcompleted/offered。空cohortは空bucket一覧（架空の0%は作らない）。accepted/completed/skippedは相互排他的な合計ではない。
- limit+1で打切り検知。最大1,000件/90日。打切りはPARTIAL/missingCount=null/truncated=true、返却件数は母集団総数ではない。全bucketの率をnullにする。cursor/全件集計は未実装。
- 返却直下のcoverageは読取の完全性、各bucketのmetric.coverageは時刻欠損/矛盾も加えた指標の完全性。COMPLETEは当該queryが打ち切られなかった意味であり、計測されなかった支援や削除前原本まで揃っている意味ではない。
- 原価はestimated/confirmed/unresolvedともnull。本経路で費用台帳を読まない。無料支援という名称だけで費用0としない。

## Goal分類

`definitionSnapshot.selection`だけを正本にする。GOAL_SPECIFICの既知GoalをそのGoal bucketへ、COMMONはfallbackReasonでCOMMON/MIXED/UNATTRIBUTEDへ分け、eligibleGoalを別codeに保持する。selectionなしはLEGACY、未知/壊れたselectionはINVALID。その他OTHERも既知Goalとして保持する。Goalの合成・現在Goalでの補完はしない。

COMMONの完了率は共通支援cohortの率で、eligibleGoalがあってもGoal固有支援の効果へ合算しない。再発回数を支援効果の失敗数としない。障害日除外/完了後観測期間/事業KPI/Goal変更後効果は本PR外。

## 検証と残タスク

対象テスト: `packages/database/test/hassy-improvement-support-adapter.test.ts`、`packages/capability-social/test/improvement-support-outcomes.test.ts`。fake Prismaで実Adapterメソッドとquery条件・射影・集計を確認する。本番DB/実ユーザー素材/実Provider/LINEは使用しない。

検証（2026-10-03 JST、既存Node v24.21.0）:

- `pnpm --filter @bunshin/database exec vitest run test/hassy-improvement-support-adapter.test.ts test/social-activity-barrier-confirmation-repository.test.ts test/social-activity-barrier-summary.test.ts test/ai-training-barrier-boundary.test.ts`: 4ファイル33件成功（新規Adapter24件を含む）。最終assertion強化後も新規Adapter単独24件成功。
- `pnpm --filter @bunshin/capability-social test`: 23ファイル193件成功（新規projection12件を含む）。
- `pnpm --filter @bunshin/application test`: 120ファイル581件成功。共通validation公開前後の契約回帰を確認。
- `pnpm --filter @bunshin/database test`: 177ファイル700件成功。この実行後に所有者/矛盾時刻の2ケースを追加し、上記対象試験で確認した。全体の最終headは通常PR CIで再検証する。
- database/application/capability-social型チェック、対象ESLint、対象Prettier、architecture:check、test:architecture（10件）、3packageのbuild成功。全体の最終CI結果はPRで確認する。
- 初回database型チェックはfixtureのJSON型castで失敗し、fixtureをPrisma.JsonValueとして修正後に成功。初回lintの不要cast/require-awaitを修正して再検証。失敗は本番DB/APIの実行ではない。

実DB query/権限/スマートフォン/本番E2Eは未実行。新Adapterの接続は明示的な呼出しが必要で、mergeだけで収集が開始しない。本番DB、課金、実生成、LINE送信、merge、deployは実施しない。

次の最小作業: Photo First品質の独立読取Adapter。既存100件制限を母集団と誤認せず、検査未実行・修正後PASS・最終不合格を分ける。並行して残る段階は相関不足確認、共通Feedback、Detection/Evidence、Candidate承認/Center、指示案コピー、修正前後比較、モニター、第2Adapter。管理画面/少数セル公開方針は公開前に別途承認が必要。
