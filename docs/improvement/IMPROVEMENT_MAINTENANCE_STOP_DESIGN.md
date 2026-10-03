# Feedback maintenance: 起動経路と停止方式の設計

## 結論

2026-10-04 JST（Asia/Tokyo）の調査。**Cron無効化だけでは移行gateを満たさない。まず既存Vercelの入口遮断とCron停止を組み合わせる運用案を確認し、証明できない場合だけアプリ停止guardを別PRで検討する。** 新Worker・キュー・停止用schemaを先に追加しない。

コード上の入口と不足条件は確認できたが、旧deploymentを含む実際の全到達経路・現行Firewall設定・実行中処理の終了は未確認。本番NO-GOは維持する。本書は設計であり、本番停止、セキュリティ設定変更、migration、deployの承認ではない。

- 調査main/起点: `a2bc9c102102e44d4844bbc5f000702c15c25b5a`。調査ブランチ: `codex/improvement-maintenance-stop-design`。
- PR [#1106](https://github.com/team478a/bunshin-platform/pull/1106) head `ff45c83a16fe8ca19adff27699c45a71752504f8` はマージ済み。[CI 37134542961](https://github.com/team478a/bunshin-platform/actions/runs/37134542961) のverify/databaseはともに成功。今回の実行とは別。
- Windows、Node24.21.0、pnpm10.10.0。元のdirty作業ディレクトリを変更せずmanaged worktreeを使用。
- 指定Chromeプロファイルの既存ログインで、既知の `team478as-projects/bunshin-platform-web/settings/cron-jobs` を読み取り表示した結果は404。別アカウントへ切替/ログインせず確認用タブを閉じた。404は対象プロジェクトの不存在や機能非対応の証拠ではない。権限/URL/所属を環境ownerが確認する必要がある。

## 起動・書込の境界

```text
Vercel Cron / 管理画面Run / 認証済み手動HTTP / 外部scheduler（未確認）
  → 独自domain・production alias・旧deployment URL（実inventory未確認）
    → schedule GET: 各サービスのJob登録
    → run GET/POST: retention.schedule（先行cleanup）→ claim/execute → credit期限処理
ユーザー・管理者HTTP / LINE callback / 各サービス内部処理
  → Job登録・再試行・取消（Cron認証とは別）
```

| 経路・実コード                                                                                                                                                   | 確認した動作                                                                            | 停止対象/未確認                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `apps/web/app/api/internal/jobs/run/route.ts:1-12` → `job-worker.ts:186-254`                                                                                     | GET=POST、maxDuration300。認証後、claim前にretention.schedule。その後workerとcredit処理 | GETも遮断対象。run停止をclaimだけに置くとcleanupが残る                                        |
| `apps/web/app/api/internal/jobs/schedule/route.ts:1-8` → `mission-scheduler.ts:379-415`                                                                          | GETから既存schedulerを呼ぶ                                                              | runとは別入口。停止しないと新Jobが増える                                                      |
| `cron-security.ts:1-19`                                                                                                                                          | 設定済みBearer認証のみ                                                                  | 有効secretによる手動呼出しを禁止する仕組みではない。秘密の値は調査しない                      |
| `improvement-feedback-retention-jobs.ts:34-152` / `schedule`                                                                                                     | 履歴cleanupを別txでcommitしてから登録。最大100のcleanup                                 | worker未claimでも実行中になり得る                                                             |
| `automation-jobs.ts` / `PrismaJobRepository.claim`、`application/src/job-worker.ts` / `RunJobWorkerBatch.execute`                                                | 期限切れlease再claim、当該null claimでdrained                                           | 全requestの停止や取消を保証しない。[再現試験](IMPROVEMENT_MAINTENANCE_DRAIN_REHEARSAL.md)参照 |
| `apps/web/vercel.json` / crons、buildCommand、git                                                                                                                | 15 Cron定義、schedule/runは毎分。productionだけGit deploy許可、DB移行→Web build         | project Cron一括停止はハッシー以外にも影響する。手動deploy/別project/外部起動元は別inventory  |
| `src/http/video-project-render.ts`、`video-project-ai-scenes.ts`、`social-image-generation.ts`、`social-image-carousel-video.ts`、`group-knowledge-http-core.ts` | `EnqueueJob`による登録                                                                  | worker入口だけでは新規登録を止めない                                                          |
| `src/http/service-line-broadcasts.ts`、`service-automatic-delivery.ts`、`service-line-link.ts:342`                                                               | 通常enqueueまたは直接Job作成                                                            | LINE callback/設定変更もCron認証とは別                                                        |
| `/api/admin/line-deliveries/[deliveryId]/retry`、badge retry、video render retry、サービス別delivery/broadcast retry                                             | Route→実Application/Repositoryで再試行登録                                              | 管理者操作禁止の周知だけを技術的遮断の証拠としない                                            |
| `src/services/*-line-scheduler.ts`、automatic-daily-image/video、ai-training-evaluation-queue、oem-support-candidate-line-worker                                 | 内部enqueue callersが存在                                                               | scheduler/job以外の呼出し元も接続確認対象                                                     |
| `database/src/fortune-generation-jobs.ts:75`、`account-deletion.ts:235`、training停止/削除Repository                                                             | Job直接登録/更新。退会はJob取消も行う                                                   | 全種Jobと関連txのdrain対象。通常退会機能を無断で停止/書換しない                               |

この表は採用SHAのコードで確認した経路群であり、運用inventoryの完成ではない。`scripts`/`packages/database/scripts`の対象シンボル検索では直接worker起動を見つけなかったが、別repo・手動SQL・別project・旧版CLIの不存在は証明していない。旧公開SHAの入口差分も未確認。上記の全ユーザーAPIを将来常時停止する設計ではなく、非互換移行中に必要な停止範囲をownerが決めるための一覧である。

## 停止方式比較

公式資料の確認日: 2026-10-04 JST。検索snippetより取得した本文を優先する。公式機能の存在と、本projectで使用できること・全旧版への適用は別。

| 案                                                    | 確認済み/限界                                                                                                                                                                                                                                                                                                                           | 判断                                                                                                                                           |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Cron toggleだけ                                       | [公式Cron管理](https://vercel.com/docs/cron-jobs/manage-cron-jobs)に無効化機能あり。通常HTTP入口の停止や実行中処理終了は保証されていない。新deployも実行中Cronを中断しない                                                                                                                                                              | 単独案は不採用                                                                                                                                 |
| Deployment Protectionだけ                             | [公式保護方式](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments)はアクセス制御で、許可された利用者/automation/例外がある                                                                                                                                                                                    | 全停止と同一視しない                                                                                                                           |
| Cron停止＋既存project WAFのDeny＋全writer/処理のdrain | [Custom Rules](https://vercel.com/docs/vercel-firewall/vercel-waf/custom-rules)は再deploy不要でDeny可能。[rule定義](https://vercel.com/docs/vercel-firewall/vercel-waf/rule-configuration)でpath/method/hostname条件あり。[Firewall概念](https://vercel.com/docs/vercel-firewall/firewall-concepts)はDenyがアプリ前に拒否することを説明 | **最初に検証する最小運用候補**。現在のrules/precedence/bypass、旧URL・全domainへの適用、Cron/Runの実経路は未確認。保証が揃うまで採用確定しない |
| 新アプリのenv flag                                    | 新版の入口には置けるが、guardのない旧版と既に開始したrequestには効かない                                                                                                                                                                                                                                                                | 単独の初回移行解決策にしない                                                                                                                   |
| ライブ状態を読む最小guard                             | 認証後、副作用前にschedule/runを拒否。読取失敗はfail-closedが候補                                                                                                                                                                                                                                                                       | 既存運用案が不十分な場合の別設計。旧版遮断・進行中txはなお別課題。新DB/flag Providerを先に決めない                                             |

[System Bypass](https://vercel.com/docs/vercel-firewall/vercel-waf/system-bypass-rules)とCustom RuleのBypassは別。後者は後続Custom Rulesを回避し得るため、単にDenyを追加すれば十分とはしない。Vercel認証やautomation bypassがWAFまで回避するかは推測せず確認する。資料の即時反映を、全処理の即時終了へ読み替えない。

ユーザーの正常なJob登録/Server Action/GET callbackまで漏れなく分類できない場合、短時間のproject全入口遮断を候補とするが、全サービス停止の影響と許容時間の別承認が必要。pathをrun/scheduleだけに限定する案で全Job/schema writer停止を証明したことにはしない。別projectやVercelを通らない直接実行はWAFでは止まらない。

## owner確認の最小1タスク

**対象Vercel projectを閲覧できるアカウントで、停止候補の読取inventoryを完成させる。** 本番Denyの作成/公開やCron無効化ではなく、権限・現在rules・到達domain・外部起動元の確認だけ。

1. project/Production Branch/公開aliasと完全SHA、DBを共有する別project・旧deployment URL・独自domain・CLI/外部schedulerを確認。秘密情報/顧客ログ本文を取得しない。
2. Firewallの閲覧/変更権限、現在ruleの順序・bypass・適用environment/hostと元設定へ戻す手順を記録。設定値が秘密なら値を文書に載せない。
3. 非本番の副作用なし専用endpointと同じhost構成で、Cron/手動GET/POST/旧URL/正規認証/bypass/alias/path表記違いの拒否を検証する計画を承認。本番jobs/runを「確認GET」で呼ばない。今回そのendpointやルールは作らない。
4. 全writerを止められる範囲、request開始/終了・DB tx・全種LEASEDの終了を照合する手段を確定。ログだけ/LEASED0/5分経過/HTTP200を単独証拠にしない。確認できない経路はNO-GO。

成立した場合: 運用証跡/非本番検証→停止と復元の別承認→既存Runbook Gate0〜5。成立しない場合: 不足経路を明示した小さなguard設計PRの承認を依頼。読取の404を理由にguard実装へ飛ばない。

## 将来guardが必要な場合の受入契約（未実装）

- 本人/cron認証は維持し、副作用のあるfactory生成・retention.schedule・scheduler・claimより前に拒否。停止時は503/機械可読maintenance code/no-store。認証エラーに停止状態を漏らさない。
- 状態読取失敗時に実行しない。進行中処理をHTTP flagで取消したと見なさない。共有基盤全体の常設feature停止と、物理DB移行の短期停止を区別する。
- 未停止時の既存順序/正常挙動、停止時の全副作用0、GET/POST両方、不正認証、状態読取障害、停止直前に始まった別requestをbarrierで検証。fakeに本番未実装の安全対策を入れない。
- 先行guardリリースにも旧URL遮断が必要。今回mainには非互換migrationが既にあるため、最新mainをそのままguard先行版としてdeployしない。実公開SHAとの互換差分を専用releaseでレビューする。
- schema変更/外部flag依存が必要かはその設計時に判断。owner承認前に新しい状態保存先や広い管理APIを追加しない。

## 検証・未実施

今回: 実route/handler/Repositoryの読取、caller検索、公式資料本文確認、指定Chromeでのアクセス可否確認。01:05:21 JST開始の `pnpm --filter web exec vitest run test/improvement-maintenance-drain-characterization.test.ts test/job-worker.test.ts test/mission-scheduler.test.ts` は3ファイル13件成功、exit0、9.31秒。注入Port/fakeを使う既存unit回帰で、実Vercel遮断の試験ではない。対象文書のPrettier、`git diff --check`も確認する。Windowsのglob付きパス検索で失敗した検索はdirectory＋`-g`で再確認し、無結果の証拠に使わない。

過去: #1106 CIのverify/database成功と、[再現報告](IMPROVEMENT_MAINTENANCE_DRAIN_REHEARSAL.md)のローカル全DB86成功/研修timeout1件×2回は別結果。今回DB試験を実行したと扱わない。

未実施: 実公開SHA照合、実Vercel設定inventory、全起動元の確定、停止/再開、旧URL拒否、全process/DB drain、本番DB/backup/restore/preflight/migration、課金/生成/LINE/SNS、deploy。本番ソース/schema/設定/依存/lockfile変更なし。停止機能の実装もなし。
