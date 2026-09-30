# fal/Kling 発注障害の現行挙動調査（characterization）

## 結論と調査範囲

2026-09-30 JST、`origin/main` の `29f0f92b056870ccb895692ac8c33873d2d818f2` を基点に、架空素材・ダミーキー・通信fakeで現行コードを実行した。OpenMontageは導入しない。F2（fakeが受付後に応答を失う）とF3（ID受信後、保存前に失敗）では、次回実行が新しいPOSTを送る。fakeは受付POSTごとに別注文として数えるという**検証用の仮定**なので、実際のfalで二重注文・二重請求が起きた証拠ではない。ただし、ローカルの保存状態から元のrequest IDを照会できず、無条件再送を止める安全条件はこの範囲で未達である。

本番DB、実fal、実課金、実動画生成、Storage、LINEは使用していない。テスト成功は安全化完了を意味しない。今回の変更はテストと本報告のみであり、本番ロジック修正は別PRとする。

## 基点・経路・限界

- 環境: Windows / PowerShell、Node.js 24.19.0、pnpm 10系、Vitest 4.1.11。実Provider、実Prisma DB、実Job worker、実Storage、実利用枠残高は未接続。
- 実コード: `apps/web/src/providers/fal-kling-video.ts` の `FalKlingVideoAdapter.submit/inspect`、`packages/application/src/video-ai-scene-generation.ts` の `ExecuteVideoSceneGenerationStep`、`packages/application/src/video-ai-scene-generation-job.ts` の `ExecuteVideoAiSceneGenerationJob`、`packages/database/src/video-render-operations.ts` の `PrismaVideoRenderOperationsRepository.requestSceneRetry`。接続経路として `apps/web/src/jobs/video-ai-scene-generation-job-handler.ts`、`apps/web/src/http/job-worker.ts`、`packages/database/src/video-scene-generation-repository.ts`、`packages/database/src/video-media-quota.ts` を読んだ。
- F0–F7は本番Adapterとuse caseに、独立したfake Provider受付台帳とfake Repository保存状態を注入する。毎回、新しいRepository/use case/Adapterインスタンスから実行し、前回のプロセスメモリに依存しない。未注入のglobal `fetch` は即失敗させ、各テスト後に復元する。fake Providerは各受付POSTを別注文とみなすが、これはfalの保証ではない。
- F2追加ケースは実際の `ExecuteVideoAiSceneGenerationJob` を通すが、Web側handlerと `FailJob` の永続化実装はfakeであり、実workerの自動配送全体の証明ではない。その他のF0–F7はuse caseの再呼出しであって、Jobの自動再試行ではない。
- F8は実 `requestSceneRetry` メソッドを、Prisma transactionのfakeで呼ぶ。fakeが勝手に旧IDや原価を消しているのではなく、実メソッドの更新指示とretry履歴作成引数をassertする。実DBの制約、トランザクション分離、別原価台帳の全範囲は未検証。

## 公式fal資料（2026-09-30 JST確認）

対象は `fal-ai/kling-video/o1/reference-to-video` のqueue submit/status/resultである。[Kling O1 API](https://fal.ai/models/fal-ai/kling-video/o1/reference-to-video/api) と [Queue API](https://fal.ai/docs/documentation/model-apis/inference/queue)、[JS QueueClient](https://fal-ai.github.io/fal-js/reference/interfaces/QueueClient.html) では、submit後の `request_id` を使う状態・結果照会およびcancelを確認した。Queue APIは、処理中にクライアント側の待機が切れても処理が続き得ることを説明する。cancelは待機中と処理中で効き方が異なり、処理中の完了を常に阻止する保証とは読めない。[falのサーバー側リトライ資料](https://fal.ai/docs/documentation/serverless/reliability/retries) の同一queued request内の再試行と、クライアントが新しいPOSTを送ることは別である。

確認した資料では、submitに渡すクライアント発行の重複抑止キーとその保証範囲、**request ID自体を失ったときの注文照合手段**、timeout/5xx後に新しいPOSTをした場合の受付・課金保証は確認できなかった。これは「非対応」の断定ではなく**未確認**である。`hint` 等を推測でidempotency keyとして扱わない。5xxやtimeoutだけで「受付前」と判断できず、cancel後も請求が必ず発生しないとは確認していない。

## ケース別観測

`POST / fake受付 / GET` は各ケース内の合計。GETはstatusとresult取得を含む。原価欄の `null` は0ドルの実績ではなく未確定として読む。F0–F7の利用枠はuse case単独テストのため観測対象外である。判定は実施した層・模擬条件に限る。

| ケース・注入箇所                      | 実行層とイベント順序、回数、保存状態                                                                                                                                                                                                                                                                                                                                                                   | 将来の安全条件                                                                  | 判定・根拠テスト                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| F0 正常                               | Adapter→use case。POST→ID保存→status/result→私有保存→成功。`1 / 1 / 2`、`externalJobId=fake_request_1`、generation `SUCCEEDED`、原価 `null`。                                                                                                                                                                                                                                                          | IDと成果物を保存し、重複発注しない。                                            | `SAFE_WITHIN_TESTED_SCOPE`、Web F0。                                                                        |
| F1 受付前の通信失敗                   | fake内部では受付前に切断。初回 `QUEUED/id=null`、次の別実行でPOST。`2 / 1 / 0`、最終 `SUBMITTED/id=fake_request_1`。                                                                                                                                                                                                                                                                                   | 通信例外だけで受付前を断定しない。受付前と確定できる場合だけ安全に再送する。    | `INCONCLUSIVE`、Web F1。受付前という事実はfake内部だけが知る。                                              |
| F2 受付後の応答喪失                   | fake受付→応答喪失→保存は`QUEUED/id=null`→別実行がPOST。`2 / 2 / 0`、最終 `SUBMITTED/id=fake_request_2`、旧IDはローカルで不明。Jobクラス経由でも初回はretryable failure、次のdeliveryで再POST。                                                                                                                                                                                                         | 成否不明時は元注文を照合するか保留し、盲目的な再発注を防ぐ。                    | `RISK_REPRODUCED`、Web F2・F2 Job。fakeの2注文は実falの2請求を示さない。                                    |
| F3 ID受信後・DB保存前の失敗           | submitでID受信→`markSubmitted`保存前例外→次回POST。`2 / 2 / 0`、保存は新ID `fake_request_2` のみ。                                                                                                                                                                                                                                                                                                     | IDと論理発注を確実に結び、保存失敗後も成否不明として再発注しない。              | `RISK_REPRODUCED`、Web F3。                                                                                 |
| F4 DB保存済み・確認応答喪失           | IDと `SUBMITTED` は永続fake状態へ書込済み→確認応答のみ例外→次回は既存IDを照会。`1 / 1 / 2`、最終 `SUCCEEDED/id=fake_request_1`。                                                                                                                                                                                                                                                                       | 永続IDを再読込し再発注せず照会する。                                            | `SAFE_WITHIN_TESTED_SCOPE`、Web F4。実DBのcommit/応答喪失そのものは未検証。                                 |
| F5 保存競合                           | 勝者なし: `markSubmitted`がnull、`QUEUED/id=null`、次回再POST、`2 / 2 / 0`。勝者あり: barrierで競合を固定し、勝者のID保存後に初回がCONFLICT、次回はGET、`1 / 1 / 2`。                                                                                                                                                                                                                                  | 競合時は勝者の永続状態を読み、勝者なし・成否不明なら新規POSTを保留する。        | 勝者なし `RISK_REPRODUCED`、勝者あり `SAFE_WITHIN_TESTED_SCOPE`、Web F5×2。                                 |
| F6 ID保存後の状態照会・成果物保存失敗 | ID保存→GET通信失敗→再GET成功後Storage失敗→再GETとStorage成功。`1 / 1 / 5`、Storage試行2、最終 `SUCCEEDED/id=fake_request_1`、原価 `null`。                                                                                                                                                                                                                                                             | 成果物保存や照会失敗で新規発注せず同IDを使う。                                  | `SAFE_WITHIN_TESTED_SCOPE`、Web F6。実Storageの冪等性は未確認。                                             |
| F7 成功済みgenerationの再実行         | `SUCCEEDED` を再呼出し。合計 `1 / 1 / 2`、Storage試行1、追加POSTなし。                                                                                                                                                                                                                                                                                                                                 | 完了済みgenerationを再発注しない。                                              | `SAFE_WITHIN_TESTED_SCOPE`、Web F7。LINE重複通知は対象外。                                                  |
| F8 管理者再試行                       | 実RepositoryメソッドをPrisma fakeで実行。FAILED fixtureの旧ID `old_fake_request_1` と架空確定原価 `123000` microsを設定。実メソッドは同generationをQUEUEDへ戻し、`externalJobId=null`、`actualCostUsdMicros=null` を更新指示。新JobとretryRequestを作り、利用枠予約upsertを呼ぶ。retryRequest作成引数に旧ID・旧原価なし。`POST/GET=0`。input snapshot、model、provider、Project/Scene/Revisionは維持。 | 旧外部ID・発生済み原価を履歴に残し、利用枠解放/再予約と原価取消しを混同しない。 | `RISK_REPRODUCED`（メソッドの更新指示・履歴payloadに限る）、DB F8。別台帳の有無・実DB挙動・実請求は未確認。 |

F2/F3のPOST再送は現行use caseの挙動である。一方、Jobがいつ何回deliveryするか、再試行上限、Providerの独自重複抑止、実請求はこのテストからは確定できない。F8の架空原価を実請求とみなさない。`actualCostUsdMicros=null` への更新は過去費用が実際に取り消された証拠ではなく、generation欄での追跡が消えるという観測である。利用枠はF8で予約メソッド呼出しを観測しただけで、実残高の増減は未確認。

## テスト・再実行

テストは `apps/web/test/video-fal-submission-characterization.test.ts`（F0–F7およびF2 Job、F5を2条件に分けた計10件）と `packages/database/test/video-fal-admin-retry-characterization.test.ts`（F8、1件）。いずれも `characterization` と明示した。Node.js 24系と既存lockfileの依存関係、生成済みPrisma Clientが必要。以下のコマンドは実課金APIや本番DBに接続しないテストに限定する。

```powershell
pnpm --filter @bunshin/database db:generate
pnpm --filter web exec vitest run test/video-fal-submission-characterization.test.ts
pnpm --filter @bunshin/database exec vitest run test/video-fal-admin-retry-characterization.test.ts
pnpm --filter web typecheck
pnpm --filter @bunshin/database typecheck
pnpm --filter web lint
pnpm --filter @bunshin/database lint
pnpm exec prettier --check apps/web/test/video-fal-submission-characterization.test.ts packages/database/test/video-fal-admin-retry-characterization.test.ts docs/VIDEO_FAL_SUBMISSION_CHARACTERIZATION_REPORT.md
git diff --check
```

今回の結果（2026-09-30 JST、最終確認時点）：Webの新規10件成功、Databaseの新規F8と既存`video-media-quota.test.ts`の計11件成功、Applicationの既存`video-ai-scene-generation.test.ts`・`video-ai-scene-generation-job.test.ts`・`video-render-operations.test.ts`の計12件成功。`web`と`@bunshin/database`のtypecheck、lint、対象3ファイルのPrettier確認、`git diff --check`を実行した。開発中の初回typecheck/lintでは追加テストの型・規約違反を検出して修正し、最終実行の結果と混同しない。通常PR CIの結果はPR作成後に確認する。未実行の実Provider、実DB、実Job worker、実Storage、本番E2Eを「成功」と扱わない。

## 後続の最小修正PR

まずfal発注の**成否不明状態の永続化と再照合/保留**を1つの変更単位で設計・実装する。論理発注キー、Job delivery attempt、Provider request IDを区別し、同一論理注文の通信再試行で新規注文を無条件に作らない。公式fal側の重複抑止・ID喪失時照合の保証を権利者資料または問い合わせで確認し、保証がなければ自動再送を停止して管理者照合へ回す。F2/F3/F5の現行挙動を固定したcharacterization assertionは、そのPRで安全条件の回帰assertionへ置き換える。F4/F6/F7は安全範囲を保つ回帰テストとして維持する。原価履歴の保存と管理者再試行時の旧ID保持（F8）は別途設計判断が必要であり、未確定原価を0と扱わない。
