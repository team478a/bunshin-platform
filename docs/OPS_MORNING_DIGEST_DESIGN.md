# 毎朝の運用まとめメール 設計案

作成日: 2026-10-20

対象: ワタシワークス全体の運用状況

状態: 段階2 PR-1をDraftで確認待ち。読み取り集計・文面生成は実装済み。本番送信・Cron・HTTP・管理画面は未実施。

## 1. 目的と境界

毎朝1通で前日の運用状況を確認できるようにする。異常なしの日は件名と本文1行にし、注意・異常がある日はその項目を先頭にして管理画面へつなぐ。異常なしの日も送信し、「未着」と「異常なし」を区別する。

本機能は既存記録の読み取り集計とメール送信を行う。集計時に利用者データ、設定、既存Job状態を変更しない。本文には氏名、LINE ID、メールアドレス、利用者ID、投稿・会話・問い合わせ本文、金額、取引先名、生のエラー文を含めず、件数・サービス名・処理名・エラー分類だけを使う。OEM請求は請求書の状態ごとの件数だけとする。AIによる要約・分析、LINE通知、新しい外部サービスの導入は対象外。

## 2. 現行実装の調査

### 2.1 メール、定期実行、運用通知センター

| 項目       | 現行実装                                                                                                                                                                                                                                                                                        | 設計への反映                                                                                                                                                                                                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| メール送信 | `apps/web/src/line/operational-alert-resend.ts` の `LineOperationalAlertResend` がResend APIを使う。運用設定は `RESEND_ADMIN_ALERT_API_KEY` / `RESEND_ADMIN_ALERT_FROM` / `RESEND_ADMIN_ALERT_TO`。管理画面DB設定がある環境では暗号化された管理設定を優先し、legacy環境変数への復帰を制限する。 | 新しいメール事業者・宛先設定を加えず、既存Resend送信と管理画面のDB設定優先順位を共用する。宛先は既存 `RESEND_ADMIN_ALERT_TO` と同じ。送信設定がない場合は失敗記録を残し、無送信を明示する。                                                                                             |
| 二重送信   | LINE運用通知は `idempotency-key` にfingerprintを入れる。Resend側のキーだけでは日次の送信済み状態をアプリ側から確実に照会できない。                                                                                                                                                              | `ops_morning_digest_runs` の環境・日付一意制約と期限付きclaimに加え、Resend側でも環境・対象日固定のidempotency-keyを使う。                                                                                                                                                              |
| Cron       | `apps/web/vercel.json` のUTC cronから `/api/internal/...` を起動し、`CRON_SECRET` で認証する。LINE監視は毎時、他の処理は日次・分次など既存スケジュールを持つ。                                                                                                                                  | Cron受け口は既存の内部API・cron認証方式を踏襲し、他のcronの時刻・動作を変更しない。毎朝7:30 JST（前日22:30 UTC）の固定scheduleとする。時刻変更が必要になった場合は `vercel.json` を変更して再デプロイする。                                                                             |
| 通知判定   | `GetAdminAlerts` と `buildAdminAlerts`（`packages/application/src/admin-alert-center.ts`）、`PrismaAdminAlertRepository`（`packages/database/src/admin-alerts.ts`）が、正本データを読み画面表示時に判定する。通知専用の複製状態は持たない。                                                     | `GetAdminAlerts` の判定結果をそのまま利用し、しきい値や同じカテゴリの判定をメール用に複製しない。既存カテゴリには `/admin/ai`、`/admin/line`、`/admin/guide`、`/admin/rewards`、`/admin/deletions`、`/admin/support`、`/admin/commercial-billing?status=REFUND_REVIEW` のリンクがある。 |
| プレビュー | 管理者専用の確認画面・読み取りAPIは未実装。                                                                                                                                                                                                                                                     | 送信処理を呼ばないドライランを実装し、同じ集計・文面生成を使ってプレビューする。                                                                                                                                                                                                        |

### 2.2 取得元の棚卸し

「候補」は該当テーブル等の記録はあるものの、依頼された集計粒度の専用集計・共通スナップショットが確認できていない状態。「取得元なし」は現在の確認範囲に、実行結果を確定できる永続データまたは読み取りAPIが見つからない状態。ログに数値を出すだけのものは、日次レポートの正本とはみなさない。

| 対象                                 | 確認できた取得元                                                                                                                                                                                                                                                                        | 現状・不足                                                                                                                                                                                                                                                                 | 管理画面リンク案                                                            |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 運用通知センター各カテゴリ           | `GetAdminAlerts` / `PrismaAdminAlertRepository`。AI設定・予算・Provider失敗・stale admission、LINE設定・失敗・retry・dead job、他のdead job、ポイント/バッジ処理、停止サービス、blocked退会、返金要照合、open/urgent問い合わせ。AI予算は設定上限に対して日/月の実績と未精算予約を加算。 | 既存ロジックを再利用する。管理通知センターは現在状態のスナップショットであり、前日イベント件数とは別の値として表示する。                                                                                                                                                   | `/admin/alerts`。詳細は各 `alert.href` を使う。                             |
| SNSサポート：投稿案生成              | `MissionContentVariantGeneration`、mission生成関連のJob・日次mission等の状態記録。                                                                                                                                                                                                      | 投稿案生成の成功/失敗を前日・サービス別に一貫して数える共通集計関数は確認できず。Jobと生成状態の重複・再試行をどう数えるか、段階2で定義が必要。                                                                                                                            | `/admin/services` または対象サービスの管理画面。                            |
| SNSサポート：LINE配信                | `ServiceLineBroadcast` / recipient・audit、`LineMessageDelivery` / attempt、LINE関連Job。既存のLINEアラートはdead/retry状態を集計。                                                                                                                                                     | 成功/失敗件数は「配信（broadcast）単位」で数える。前日・サービス別の統一済み集計関数は未確認。再試行で回復した配信も、最終状態をbroadcast単位で数える。                                                                                                                    | `/admin/line`、サービス単位はサービス管理画面。                             |
| SNS品質チェック・自動修正            | Social image generation request/mediaと品質review記録。`apps/web/src/jobs/social-image-generation-job-handler.ts` で品質判定・再試行を実行。                                                                                                                                            | 前日・サービス別の品質合格、修正、最終失敗をまとめる運用集計は確認できず。画像生成の品質処理を投稿案全般の品質件数と混同しない。                                                                                                                                           | `/admin/images` またはサービス管理画面。                                    |
| トレンド調査の結果                   | Trend research scheduler/operations、`MissionTrendContext` 等の記録。定期処理は共通Job scheduler経由。                                                                                                                                                                                  | 調査実行の成功/失敗をサービス別に確定する単一の日次集計口は確認できず。Jobの完了状態と結果レコードの対応を段階2で調べる。                                                                                                                                                  | `/admin/trends`。                                                           |
| 週間計画・週次レポート（実行日のみ） | `WeeklyPlan` / `WeeklyPlanItem`、週次レポートLINE schedulerと配信記録。                                                                                                                                                                                                                 | 実行日を判定するサービス時間帯と、準備・配信結果を分ける必要がある。日次横断の成功/失敗集計は未確認。実行日でない日は「対象外」とし、未実行異常にしない。                                                                                                                  | `/admin/services`、LINE配信は `/admin/line`。                               |
| ハッシー：投稿停止検知・支援         | `SocialActivityBarrierCase` / evidence / confirmation / support intervention。Improvement EngineにHassy support adapterあり。                                                                                                                                                           | 候補・支援記録はあるが、前日新規検知数と支援実行/完了数の単一レポートは未確認。個人を識別せず件数だけにする。                                                                                                                                                              | サービス管理画面。専用の管理一覧URLがなければ「リンクなし」と表示。         |
| 占い：週1通知（実行日のみ）          | `scheduleFortuneWeeklyLineDeliveries` は曜日・時間・timezoneを使い、`ServiceLineBroadcast` と `SERVICE_LINE_BROADCAST_DELIVER` Jobで配信を管理する。                                                                                                                                    | 配信結果は既存配信記録から読める見込みだが、週次通知だけを安全に切り出す集計関数は未確認。`fortune-weekly:` automation keyと対象日・timezoneで切り分けを検証する。                                                                                                         | `/admin/fortune` または `/admin/line`。                                     |
| マナベルスタイル：LINE学習           | `PersonalLearningLineInbox` / `PersonalLearningLinePush` と `PERSONAL_LEARNING_LINE_PROCESS` Job。                                                                                                                                                                                      | 送信・失敗状態の記録はあるが、前日サービス別件数の集計APIは未確認。本文・画像は一切読まず状態列のみ集計する。                                                                                                                                                              | 対象サービスの管理画面、または `/admin/line`。                              |
| マナベルスタイル：保持削除Preview    | `/api/internal/ai-training/retention-cron` が設定対象を限定してPreview/Executeし、Previewでは対象Enrollment数と種類別件数を構造化ログへ出す。管理者向けPreview APIもある。                                                                                                              | Cronは実行結果を専用の履歴テーブルに保存しない。既存ログの保持・検索可否を確認し、日次確定記録が必要なら段階2で保存先を選ぶ。Previewの対象件数のみ、本文を含めず出す。                                                                                                     | AI研修の管理画面（サービス別Preview）。内部運用の詳細は `/admin/guide` 案。 |
| 毎時LINE監視：失敗・回復             | `CheckLineOperationalReadiness`、`/api/internal/line/monitor`、fingerprint付きResend/Webhook通知。サービスbroadcastの通知記録は保存される。                                                                                                                                             | 現在状態のアラートは取得可能。毎時の過去失敗数・自動復旧数・回復しなかった数を完全に再現するチェック履歴は確認できず、通知fingerprintだけを履歴全体とみなせない。                                                                                                          | `/admin/line` と `/admin/alerts`。                                          |
| 期限切れデータ自動削除               | Account deletion、assets/fortune/support retention、training retentionのCron・対象データ・一部の実行ログ/結果。AI研修retentionはPreview/Execute前後の件数照合を実施する。                                                                                                               | すべての削除Cronで件数・失敗を共通形式で永続化する仕組みは確認できず。削除数は実行結果ログまたは該当Job結果が読める処理に限り報告し、取得不能は「取得失敗/取得元なし」とする。                                                                                             | `/admin/deletions`、`/admin/guide`、対象サービスの管理画面。                |
| AI予算：サービス別消化率・自動停止   | AI利用記録・Admission、Provider設定、Program設定。Alert CenterはProvider全体の日次/月次使用率を判定し、80%以上をWARNING、100%以上をCRITICAL。                                                                                                                                           | Alert Centerの既存値はProvider単位であり、依頼されたサービス別比率をそのまま得られない。AI usageのservice/program scopeで集計できるか、未精算予約との整合とサービス別上限の正本を段階2で確認する。自動停止イベントの明示記録は確認できず、停止状態と理由を分けて調査する。 | `/admin/ai`、サービス別設定は対象サービス管理画面。                         |
| OEM：請求書状態別件数                | Commercial billing invoice、audit/webhook、reminder schedulerの処理記録。画面 `/admin/commercial-billing` はOVERDUE等で絞込可能。                                                                                                                                                       | 請求書の状態ごとの件数を数える。金額・Workspace名・取引先名は使用しない。催促済み等の内訳を足す場合は、請求書状態と混同せず別欄にする。                                                                                                                                    | `/admin/commercial-billing`。未回収は `?status=OVERDUE`。                   |
| 支援が必要な利用者候補               | Social activity barrier / OEM support candidateと支援記録、改善Overview adapter。                                                                                                                                                                                                       | 全サービス横断の候補件数・サポート導線は未確認。利用者IDを含む候補リストはメールへ出さず、既存の認可されたサービス管理画面へのリンクのみとする。                                                                                                                           | サービス管理画面。共通一覧がなければ「リンクなし」。                        |
| Improvement Engine Phase 1-B週次集計 | `PrismaServiceImprovementOverviewReader` / `BuildServiceImprovementOverview`、`/api/services/[serviceSlug]/improvement-overview`。SOCIAL/TRAININGの範囲限定adapterと少数件保護を持つ。                                                                                                  | 既存の集計結果を認可済みservice scopeで読むことは可能。ただし定義上の週次期間・完了週の選択がdigestの前日範囲と異なる。週1実行時にそのAPIを再利用し、保護された集計のみ出す。                                                                                              | 対象サービスの管理画面。管理者Previewの具体URLは段階2で確認。               |

#### 現時点で取得元・確定手段が不足するもの

- サービス別に重複なく数える投稿案生成、SNS品質チェック/自動修正、トレンド調査、LINE学習の前日成功/失敗集計。
- 投稿停止検知と支援実施を全対象サービスでまとめる共通の件数API。
- LINE毎時監視の再試行回復数・回復しなかった数を再構成できる完全なチェック履歴。
- すべての保持削除Cronについて、Preview/削除件数と実行失敗を統一して参照できる日次履歴。
- サービス単位のAI予算比率と、自動停止イベントの明示的な履歴。
- Improvement Engine週次集計の管理者が使えるURLと、digestが実行日に選ぶ週の確定ルール。

以上は無理に0件へ置き換えない。段階2で専用の読み取り集計がない場合は「取得元なし」、既存情報を読めなかった場合は「取得失敗」と出す。別の台帳へ複製するのではなく、元記録から読み取れる場合はその場で集計する。

### 2.3 PR-1で確定した初版Collectorの意味

- 運用通知センターは既存 `GetAdminAlerts` の返すalertをそのまま使用する。重大度を複製判定せず、CRITICAL/WARNING/INFOをそれぞれ異常/注意/一覧だけへ振り分ける。
- サービスLINE一斉配信は `ServiceLineBroadcast` をサービス（`groupId`に対応する既存 `ServiceConfiguration.displayName`）と状態で集計する。`SCHEDULED` は `scheduledAt`、`COMPLETED` は `completedAt`、`CANCELLED` は `cancelledAt` が前日JSTの半開区間に入る記録を1 broadcastとして数える。`DRAFT` は含めない。
- `automationKey` が `fortune-weekly:` で始まるbroadcastは通常配信と分ける。該当日が週次配信日でなく、対象日のbroadcastもない場合は `NOT_APPLICABLE` とする。
- `SCHEDULED` / `COMPLETED` / `CANCELLED` なのに対応する状態日時が未設定の記録は、前日件数から除外し、取得状況へ「日時未設定の配信記録：N件（全期間）」として件数のみを示す。これはseverityを持たず、「異常なし」の判定も妨げない。
- OEM請求は `TenantInvoice.status` の送信時点のgroup count（`DRAFT` / `ISSUED` / `PAID` / `VOID`）のみ。金額・請求書番号・契約名・連絡先・Workspace列は取得しない。
- DBの配信集計はbroadcastの `groupId` / `status` と状態に応じた日時列をgroup-byし、サービス表示名を別 query で付与する。本文 `title` / `message`、recipient、個人識別子はselectしない。

## 3. 提案する基本フロー

1. Vercel Cronが内部routeを呼び、`CRON_SECRET` を検証する。環境はproductionだけを対象にし、環境変数 `OPS_DIGEST_ENABLED` が文字列 `true` でなければ集計・送信せず、機能OFFとして安全に終了する。
2. JST日付を基準に対象日を一意に決める。集計対象は前日JST 00:00以上・当日00:00未満の半開区間とし、UTCへ変換して各DB queryへ渡す。日時境界テストを置く。
3. `GetAdminAlerts` を呼び出し、既存アラート判定と `alert.href` をそのまま使う。前日イベント集計は別Collector群で追加し、各Collectorは `OK` / `UNAVAILABLE` / `NOT_APPLICABLE` の状態を返して0件・未実行・取得失敗を区別する。
4. 既存の `RESEND_ADMIN_ALERT_TO`（現行の管理メール設定取得の優先順位を含む）へテキストメールを送信する。専用宛先の `OPS_DIGEST_TO` は追加しない。異常なしでも必ず送信する。有効化されていない場合や宛先設定が不完全な場合は送信しない。
5. 送信結果を日付・環境単位で永続化する。claim前にすでに送信済みならskip。処理中claimはlease/期限を持たせる。Resendの `idempotency-key` も併用するが、プロバイダーの重複抑止だけに依存しない。

### 二重実行・永続記録の設計候補

| 候補                          | 長所                                                                                                          | 制約・確認点                                                                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 既存Jobを送信台帳として再利用 | `Job` は `environment + idempotencyKey` 一意制約、lease、retry、terminal status、`lastErrorCategory` を持つ。 | 必須 `workspaceId` の意味付けが困難で、汎用workerがdigest以外のexecutorへ渡すため流用しない。PR-1の追加調査で不適合を確認した。                        |
| 専用送信記録テーブル          | 状態遷移、日付一意性、期限付きlease、attempt数、固定エラー分類、送信時刻を小さく明確に保持できる。            | PR-2指示により追加型migration 1件が許可された。本文、件名、宛先、個人情報、生エラーは記録しない。RLSを有効にし、アプリからはserver-side Prismaで扱う。 |
| Resend idempotency-keyのみ    | DB変更不要でprovider呼び出しに重複キーを付けられる。                                                          | アプリが送信済み/失敗を照会できず、Cron再実行時の1日1通保証・前日未送信検出・運用通知センターでの失敗確認には不足。単独採用しない。                    |

PR-1で必須 `Job.workspaceId`・汎用worker・retryの調査を完了した。安全な全体向けworkspace scopeを割り当てられず汎用workerとの混同も避けられないため、Jobを流用せず専用台帳を使う。PR-2指示はこの送信台帳用migrationの作成を許可するが、本番適用は田中の別承認が必要。

## 4. 送信時刻・判定・文面

### 4.1 時刻・対象日

- 送信時刻は毎朝07:30 JST（前日22:30 UTC）の固定とする。`apps/web/vercel.json` に `30 22 * * *` のCronを追加する。
- 時刻を変更する頻度は低いため、変更が必要な場合は `vercel.json` のscheduleを変更して再デプロイする。時刻用環境変数、短周期Cron、時刻gateは設けない。
- 対象期間は前日JST 00:00:00以上、当日JST 00:00:00未満。境界はUTCに変換してqueryする。毎時LINE監視などは前日件数と送信時点の状態を分ける。
- weekly/monthly等の実行日でない集計は0件扱いにせず「本日対象外」とする。実行予定日の記録を確認できない場合は実行状況一覧に記載し、独自重大度を付けず、既存Alert Centerが返した重大度がある場合だけその分類に数える。

### 4.2 判定基準

判定基準は運用通知センターの既存重大度だけを使い、独自のしきい値や別判定表を設けない。

| 既存重大度 | まとめメールでの扱い                                 |
| ---------- | ---------------------------------------------------- |
| `CRITICAL` | 「異常」として先に表示し、異常件数へ加える           |
| `WARNING`  | 「注意」として異常の次に表示し、注意件数へ加える     |
| `INFO`     | 異常・注意件数には加えず、参考項目として一覧に載せる |

`GetAdminAlerts` の返却値を使い、しきい値やseverity判定を複製しない。個別collectorの成功/失敗、対象外、未実装は取得状況欄で区別し、Alert Centerの重大度へ変換しない。Alert Centerに `CRITICAL` / `WARNING` がなく、取得失敗もなく、実装済みcollectorがすべて正常または対象外で、前日のまとめが未送信でなければ「異常なし」とする。digest自身の送信・集計障害は運用記録で確認できるようにし、失敗した日の送信を成功扱いにしない。

### 4.3 メール文面

テキストメールを使い、本文は既存の許可されたラベル・数値・固定リンクで組み立てる。生のerror message、利用者由来の文字列、任意のDB本文をテンプレートへ渡さない。

**異常なし**

- 件名例: `【ワタシワークス運用】10/19 異常なし`
- 本文の先頭行: `前日の定期処理・配信・通知はすべて正常でした。管理画面：<管理画面URL>`。末尾に、この版で未対応の項目を示す固定の1行を付ける。

**注意・異常あり**

- 件名例: `【ワタシワークス運用】10/19 異常2件・注意1件`
- 本文順: 1) CRITICALの異常、2) WARNINGの注意、3) INFOおよびサービス別件数一覧（正常含む）、4) 取得元なし/取得失敗、5) 送信時点の状態。
- 取得元なし、取得失敗、対象外、未実行はそれぞれ表示を分ける。Alert Centerで重大度が付かないcollectorの情報はseverity件数に足さない。
- LINE配信件数は配信（broadcast）単位で数える。再試行があっても最終状態を1 broadcastとして数え、recipient単位で重複計上しない。
- OEMは請求書状態ごとのinvoice件数として表示する。金額・取引先名・Workspace名は載せない。
- その他の表示件数にも、対象テーブルの単位（record / job / invoice等）を明示する。

### 4.4 管理画面リンク

運用通知センターのリンクは `AdminAlert.href` を再利用する。その他は下記の既存URLを使い、サービス固有URLはslugから認可済みの管理画面リンクを組み立てる。確認できない専用画面へのリンクは捏造せず、`/admin/guide` またはリンクなしとする。

| カテゴリ                   | リンク                                                                       |
| -------------------------- | ---------------------------------------------------------------------------- |
| 全体アラート               | `/admin/alerts`                                                              |
| AI設定・予算               | `/admin/ai`                                                                  |
| LINE設定・配信             | `/admin/line`                                                                |
| 定期処理・取得元なしの調査 | `/admin/guide`                                                               |
| 退会                       | `/admin/deletions`                                                           |
| 問い合わせ                 | `/admin/support`                                                             |
| OEM請求                    | `/admin/commercial-billing?status=OVERDUE`、失敗は `?status=REMINDER_FAILED` |
| トレンド                   | `/admin/trends`                                                              |
| 占い                       | `/admin/fortune`                                                             |
| 画像品質                   | `/admin/images`                                                              |
| 研修の保持Preview          | 対象AI研修サービスの管理画面。固定URLは段階2で解決                           |
| 週次改善Overview・支援候補 | サービス管理画面。共通管理者URLは確認できておらず、段階2で認可とリンクを確認 |

### 4.5 集計失敗・送信失敗・前日未送信

- Collectorまたはメール送信の失敗は、例外内容を保存せず、固定されたerror category、日時、対象日、環境、処理段階だけを運用記録へ残す。
- Alert Centerは正本を表示時に読むため、それだけではdigest処理自身の失敗履歴を記録できない。専用台帳に固定エラー分類だけを残し、運用通知センターへの新規統合はこのPRでは行わない。
- 送信失敗が発生した日は `FAILED` と固定エラー分類を記録し、同日の自動再送はしない。lease切れの `CLAIMED` だけは同じResend idempotency-keyで再claimできるため、provider応答が不明のクラッシュでも重複送信を抑える。
- 当日のメールで前日のJST日付に送信済みrecordがなければ「前日のまとめが送信されていません」と表示する。初回導入前の履歴がない期間は「履歴開始前」とし、未送信異常と誤判定しない。
- 外部死活監視サービスは追加しない。毎朝の定期メールが届かないことを田中が検知する前提とする。

### 4.6 ドライラン

管理者限定の「今日のまとめをプレビュー」を用意する。Cronと同じcollector・判定・テンプレートを使い、メール送信・送信台帳の状態変更は行わず、本文・件名・状態・数値・リンクだけを画面へ返す。プレビュー時刻とJST対象日を明示する。個人情報が返らないテストを通し、本番での送信開始前に田中が内容を確認できるようにする。

## 5. 段階2の実装範囲とPR分割案

PR-2では送信記録テーブルを追加するmigration 1件だけを許可する。既存テーブル・列・制約は変更しない。本番へのmigration適用はPRマージ後も田中の別承認を要する。

1. **PR-1 読み取り集計**: applicationにJST対象日の契約・Collector結果型・重大度だけを使う判定・件名/本文の純粋関数と未対応項目一覧の定数を追加し、databaseに通知センター連携用入力に加えてLINE broadcast/OEM invoiceの読み取りadapterを追加。個人情報・本文・金額をCollector出力へ出さない。
2. **PR-2 送信・Cron・記録**: `apps/web/src/email/` に既存Resend設定を使うdigest送信adapter、`apps/web/app/api/internal/` にCRON_SECRET保護route、`vercel.json`にCron追加。Jobではなく専用台帳の追加型migrationを1件作る。`OPS_DIGEST_ENABLED` の未設定/falseおよびproduction以外では集計も送信もしない。
3. **PR-3 管理者Preview**: 管理者権限のPreview画面とAPIを追加し、送信・状態書込なしで件名と判定済み文面を表示する。

PRは個別Draftと日本語報告で提出し、前PRのマージ・田中確認後に次へ進む。Secretsや本番の宛先値はコード・報告へ記載しない。

## 6. 段階2の受入テスト

- 全対象正常時は件名が「異常なし」、本文が1行。
- 異常・注意が混在すると、件名の件数、異常→注意→サービス別一覧→取得状況の順が正しい。
- Collector成功の0件、取得失敗、取得元なし、対象外、予定実行日の未実行を区別する。
- JST前日境界・UTC変換・夏時間を持たないAsia/Tokyoの対象日を確認する。
- 同じ日付で同時/連続2回起動しても送信は1通。送信前失敗、Resend timeout、送信応答不明、lease切れを含む競合を確認する。
- 件名/本文にemail、LINE ID、UUID等の利用者ID形式、投稿・会話・問い合わせ本文、生エラー文字列を含めない。
- `OPS_DIGEST_ENABLED` 未設定/falseではメールproviderを呼ばず、集計対象の利用者データ・設定・Job状態を変えない。
- Previewは同じ結果を使うがメール送信・送信済みrecord更新を行わない。
- 既存Alert Centerの判定・画面、既存メール/LINE通知、cronの実行・送信動作に回帰がない。

## 7. 田中に確認してほしい点

1. 本PRで決定済み: 宛先は既存 `RESEND_ADMIN_ALERT_TO` と共用し、`OPS_DIGEST_TO` は作らない。
2. 本PRで決定済み: 毎朝7:30 JST / 22:30 UTCの固定Cron。時刻変更は `vercel.json` の変更・再デプロイで行う。
3. 本PRで決定済み: Alert Center重大度をそのまま集計し、CRITICAL=異常、WARNING=注意、INFOは件数に加えず一覧表示のみ。
4. 送信記録には専用の追加型migrationを使用する。本番適用は田中の確認・承認後に行う。
5. 本PRで決定済み: 外部死活監視は追加しない。毎朝メールの未着を田中が検知する。
6. 本PRで決定済み: LINE配信はbroadcast単位、OEMは請求書状態別の件数で数える。
7. `OPS_DIGEST_ENABLED` は未設定/falseを安全側とし、送信有効化は田中がproductionで行う。

## 8. 段階1の変更範囲と影響（当時の記録）

段階1当時の変更対象は本設計書、Decision Log末尾の設計開始記録、Roadmapの本タスク1行だけだった。コード、テスト、schema、migration、`vercel.json`、環境変数、Provider設定、本番設定は変更しておらず、既存の画面・メール・LINE・cronの動作へ影響しなかった。段階2 PR-1の実装対象と影響は次章に記録する。

## 9. PR-1 実装報告

### 9.1 実装済み

- `packages/application/src/ops-morning-digest.ts` にJST前日の日付窓（UTC半開区間）、`OK` / `UNAVAILABLE` / `NOT_APPLICABLE` の結果型、Alert Center重大度集計、件名・本文生成、未対応項目の単一定数を追加した。送信関数は含まない。
- `packages/database/src/ops-morning-digest.ts` に読み取り専用Collectorを追加した。配信は状態に対応する日時と `groupId` / `status` で集計し、サービス表示名だけを別取得する。占い週次配信は `automationKey` で分離する。請求はstatusだけをgroup-byする。
- Alert Centerは既存 `GetAdminAlerts` の結果を呼出し側から受け取る設計とし、閾値やseverity判定を複製しない。PR-2の送信実装が既存 `GetAdminAlerts` を直接利用する。
- DB読み取り例外は固定カテゴリ `DATABASE_READ_FAILED` にし、生の例外内容を出力しない。

### 9.2 Job送信台帳の調査（PR-2準備、調査時点）

- `Job.workspaceId` は必須で、全体向けdigestに意味のあるWorkspaceを割り当てる既存の専用system workspaceを確認できなかった。任意のWorkspaceに紐付ける設計にはしない。
- Jobは `(environment, idempotencyKey)` で一意化されるが、汎用workerは未知の `jobType` をMission Automation executorへ渡す。digest送信記録を新しいJob種別として単純追加すると、送信workerではなく既存の汎用workerがclaimする危険があるため、そのままでは適合しない。
- Jobは自動claim、lease失効後の再claim、`FailJob` によるretry/DEAD遷移を持つ。汎用workerが自動再試行するため、digest送信を独立した日次台帳として安全に扱うには明示的な専用経路が必要。
- 一般Job全体を消すretention処理は見つからなかった。実装されているJob掃除は改善フィードバック保持処理自身の終端Jobを180日後に削除する限定処理。
- PR-1作成時点ではmigrationは未承認としていた。その後、田中のPR-2指示により送信記録の追加型migration 1件が許可された。実装と検証の報告は次のPR-2節を参照する。

### 9.3 検証・未実施事項

- 自動テストで正常時短文、CRITICAL/WARNING/INFOの分類と順序、取得失敗、前日送信状態、占い対象外、JST境界、秘匿情報を含めないことを確認する。
- database unit testでgroup-by条件・状態日時・サービス別分離・請求書statusだけの問い合わせ形を確認する。隔離DBのintegration caseで別サービスが混ざらず、配信本文・請求額・契約名/連絡先列をSELECTしないことを確認する。
- PR-1は集計・判定・文面生成のみ。送信、Cron、HTTP route、管理画面、環境変数、schema、migration、本番変更は行わない。

## 10. PR-2 実装報告

PR-2の変更範囲・設計判断・検証、本番適用前に田中が実行する手順は、PR本文の日本語報告に記載する。PR-2はDraftのまま確認待ちとし、マージ・本番migration適用・環境変数設定・送信有効化は行わない。
