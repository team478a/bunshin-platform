# Phase 6 LINE Daily Experience 実装計画

更新日: 2026-08-22
基準commit: `164c12aa6618361e7b43b254e0a942994c45e5a0`

## 1. 目的

LINEを大量配信や販促自動化の基盤ではなく、BUNSHINが用意した「今日やること」へ利用者を戻す通知と入口として実装する。

Phase 6の完了状態は次とする。

```text
LINE連携
-> 通知設定
-> Weekly Plan確認
-> Daily Mission自動生成
-> LINEへ1回だけ通知
-> 対象Missionを開く
-> 採用・コピー
-> 本人がSNSへ投稿
-> 投稿完了・Feedback
-> KPIへ反映
```

## 2. 現状

- `AuthIdentity`は`LINE | EMAIL`を扱えるが、LINE Login AdapterとLINE起点sessionは未実装。
- Platform Adminは`SUPER_ADMIN | OPERATOR | SUPPORT | READ_ONLY`を持つ。
- Weekly / Daily生成は認証済みScheduler / WorkerとVercel Cronへ接続済み。
- PostgreSQL Job、lease、retry、配信履歴、Mission Deep Link、Messaging Adapter、quota Gateは実装済み。
- 通知設定とWebhook / Connection Coreは実装済み。Mission生成後の配信Job接続も完了したが、実ユーザーPushはLINE Login接続とProduction Gate通過まで停止する。
- Phase 0〜5のコードは完了しているが、FREE MVP Production GateはNO-GO。

## 3. 絶対境界

- User、Workspace、BunshinをLINE user IDだけで解決しない。verified actorから所有境界を再検証する。
- LINE Login、Messaging API、WebhookのSDK型とraw responseをCoreへ持ち込まない。
- Channel SecretとChannel Access Tokenは暗号化してDBへ保存し、平文再取得APIを作らない。
- `ENCRYPTION_KEY`、`SESSION_SECRET`、`CRON_SECRET`、DB接続情報は環境変数に残す。
- Mission生成成功後だけ通知Jobを作成し、生成失敗時に完成通知を送らない。
- DB一意制約とJob leaseの両方で二重生成・二重送信を防止する。
- Provider payload、Webhook本文、秘密値、生成本文、Knowledgeをログへ保存しない。
- LINE通知と将来の`LINE_MARKETING` Capabilityを同じモデルへ混在させない。

## 4. PR分割

### 6-0: 設計確定（本PR）

- 本実装計画
- LINE認証と既存sessionのADR
- Decision LogとRoadmapの更新
- schema候補、秘密値境界、migration・rollback方針
- コード、Prisma schema、migrationは変更しない

### 6-A: Secure Configuration

- `LineChannelConfiguration`とversion履歴
- AES-256-GCMによるSecret暗号化、mask、key version
- DEVELOPMENT、STAGING、PRODUCTIONごとの単一ACTIVE設定
- 配備環境と設定環境のサーバー側一致検証
- Supabase project URLから生成するLINE Provider Callbackと、配備環境から生成するApplication Callback、Webhook、LIFF、Deep Link URL
- 設定管理画面、権限、接続テスト、rotation
- 設定変更Audit Log
- Migration、rollback、unit・integration test

このPRではLogin、Webhook、通知、Jobを実装しない。

### 6-B: LINE Identity / Login

- OAuth Authorization Code、`state`、`nonce`、PKCE S256
- Supabase Custom OIDC Providerを利用し、Provider CallbackとApplication Callbackを分離
- ID tokenのsignature、issuer、audience、nonce検証
- `AuthIdentity(provider=LINE)`との接続
- 新規User作成と既存Userへの明示連携
- 連携解除、再連携、Identity競合
- LINE内ブラウザと通常ブラウザ
- Login後の元Mission復帰

### 6-C: Webhook / Connection

- `LineConnection`（完了）
- raw bodyに対するHMAC-SHA256署名検証（完了）
- follow / unfollow（完了）。message / postback業務処理は後続へ分離
- `webhookEventId`による環境別冪等処理（完了）
- 友だち状態と未送信配信取消（完了）
- LINE user IDやraw payloadを含まない最小Webhook Event記録（完了）
- 公開WebhookのProduction利用は環境別ACTIVE設定と外部Console設定後に行う

### 6-D: Notification Preferences

- `LineNotificationPreference`
- 通知同意、ON/OFF、local time、IANA timezone、頻度
- quiet hours、一時停止、再開日、Reminder
- verified-session APIとmobile-first設定画面
- 設定変更時の未実行Job再計算

### 6-E: Job / Mission Automation

- PostgreSQL Job、Scheduler trigger、Worker lease
- idempotency、retry、指数バックオフ、dead、cancel、manual retry
- Weekly Plan準備と確認通知
- Daily Mission生成と通知Job登録
- 実行時のWorkspace、Bunshin、SOCIAL、Strategy、Plan再検証
- 全体緊急停止

Vercel Cronはtriggerだけに使用し、長い処理やretry状態をHTTP request lifecycleへ保持しない。

### 6-F: Messaging / Deep Link

- Messaging Provider PortとLINE Adapter（完了）
- Daily Mission生成成功後の環境別・冪等な配信Job登録（完了）
- 配信JobからConnection resolver、quota Gate、Push Adapterへの接続（完了）
- `LineMessageDelivery`、`LineMessageDeliveryAttempt`、短期lease（完了）
- timeout、rate limit、blocked、invalid recipient、credential、quotaの分類とJob retry接続（完了）
- 環境別の用途分離鍵で署名したsingle-use短期stateを使うMission Deep Link（発行・消費Coreと送信時発行まで完了）
- Mission Deep LinkのApplication Callback、click記録、理由付き手動再送、集計ベースの外部管理者警告は完了
- 未ログインでMission Deep Linkを開いた利用者は、LINE認証と必要な規約同意の後に元のMissionへ復帰する。戻り先は短時間のHttpOnly Cookieで保持し、`/today?state=...`以外を拒否する。復帰後も署名、single-use、環境、User／Workspace／Bunshin／Mission所有権を再検証する

### 6-G: Admin / KPI / Production Gate

- 設定、友だち状態、通知可能数、生成・送信・失敗・Deadの管理画面
- ユーザー単位停止、全体停止、理由付き限定再送（再試行可能なFAILED配信のみ完了）
- 友だち追加から投稿完了までの環境別LINE Funnel（完了）
- 送信数、Open率、解除・ブロック相当率、通知から投稿完了率（完了）。LINE原価はProvider契約・課金データ未接続のため後続
- 環境別の重大状態判定、allowlist済み外部Webhookへの管理者警告、毎時監視（コード完了）
- 非送信LINE Readiness、Production LINE Go/No-Go workflow、Runbook（コード・文書完了）
- Vercel/GitHub Secret登録、外部Webhook疎通、Production LINE Go/No-Go実行（人間作業として未完了）

## 5. DB変更候補

候補は実装前レビュー用であり、6-0ではschemaへ追加しない。

### LineChannelConfiguration

- `id`, `environment`, `version`, `status`
- Login Channel ID、暗号化Login Secret
- Messaging Channel ID、暗号化Messaging Secret、暗号化Access Token
- LIFF ID、通知既定値、全体停止、月間配信上限制御
- Callback URL、Webhook URL、LIFF Endpoint URL、Deep Link Base URLは配備環境から導出し、検証済みoverrideだけを保持する
- `keyVersion`, `lastVerifiedAt`, `lastErrorCategory`
- `createdByUserId`, `updatedByUserId`, timestamps
- DEVELOPMENT、STAGING、PRODUCTIONごとにACTIVE設定は最大1件とする。実行環境と設定環境の一致をサーバー側で検証し、異なる環境の設定は利用しない。
- DB一意制約で環境ごとの重複ACTIVEを防止し、更新はversion追加とatomic切替で行う。
- 環境をまたいだ設定コピーを許可せず、Production SecretをPreview、Development、Stagingの接続テストへ渡さない。

### LineConfigurationAudit

- configuration、environment、actor、action、reason、changed fields、occurredAt
- Secretの値、復号結果、Provider responseを保存しない。

### LineConnection

- `workspaceId`, `userId`, `providerUserId`
- `status`, `friendshipStatus`, `notificationConsentAt`
- `followedAt`, `unfollowedAt`, `lastWebhookAt`
- LINE IdentityとUserを解決した後もWorkspace所有境界を再検証する。

### LineNotificationPreference

- `workspaceId`, `userId`, `bunshinId`
- enabled、local time、IANA timezone、frequency
- quiet hours、pausedUntil、reminderEnabled
- FREEでは対象Bunshinは1体だが、内部modelは複数Bunshinを妨げない。

### Job

- type、payload reference、idempotency key、status、priority
- scheduledAt、lease owner、lease expiresAt、attempt count
- nextRetryAt、error category、completedAt、cancelledAt
- payloadへ秘密値、生成本文、Knowledgeを入れない。

### LineNotification / LineDeliveryAttempt / LineWebhookEvent

- 通知はMission、User、Workspace、Bunshinへ防御的にscopeする。
- idempotency keyを一意にし、試行履歴と論理通知を分離する。
- Webhookはevent ID、type、時刻、結果、最小metadataだけを保存する。

### LineDeliveryRetryRequest

- environment、delivery、失敗時attempt count、actor、理由、生成Job、createdAtを保存する。
- `deliveryId + deliveryAttemptCount`を一意にし、同じ失敗回への二重再送操作をDBで拒否する。次の配信試行が失敗した場合は、新しいattemptとして再判断できる。
- 対象は`CONFIGURATION_UNAVAILABLE`、`RATE_LIMITED`、`TIMEOUT`、`PROVIDER_UNAVAILABLE`に限定する。停止、quota、認証情報不正、受信者不在、blockedは管理者再送で回避しない。
- runtime environmentとDelivery environmentを一致させ、SUPER_ADMIN / OPERATORだけが3〜500文字の理由付きで作成できる。
- JobにはopaqueなDelivery IDだけを渡す。受信Userを`requestedBy`として既存所有権検証を維持し、管理操作actorはRetryRequestへ分離する。
- APIと画面へUser ID、Workspace ID、Bunshin ID、Mission ID、LINE user ID、Secret、Provider responseを返さない。

### LINE Funnel Read Model

- runtime environmentと期間を必須条件にし、ACTIVE Platform Adminだけが集計値を閲覧できる。
- 期間内に送信成功したDeliveryをコホートとし、同一環境のsingle-use Deep Link stateを期間終了までに消費した場合だけOpenとする。
- 採用、Copy、投稿完了は、同一環境のOpenを通過し、かつ送信後・期間終了前に記録された行動だけを数える。別環境の同一Missionへ行動を誤帰属しない。
- API/UIには集計値だけを返し、User、Workspace、Bunshin、Mission、Delivery、LINE user IDを返さない。
- 1回の集計コホートは5,000 Deliveryまでとし、超過時は`truncated`を返して不完全な率を表示しない。
- 解除・ブロック相当率は期間内のfollow / unfollow記録を母集団とする。LINE Provider上の厳密なブロック理由とは扱わない。

## 6. 採用方針

- LINE LoginではPKCE S256を必須とする。
- LINE新規Userの作成を許可する。既存Userとの統合はログイン済み画面からの明示連携だけとし、メール一致で自動統合しない。
- LINE設定、LINE Loginチャネル、Messaging APIチャネルはDEVELOPMENT、STAGING、PRODUCTIONで分離し、環境ごとに単一ACTIVEとversion履歴を採用する。
- Production用とStaging用のLINE公式アカウント・チャネルを分離し、LoginチャネルとMessaging APIチャネルは同一Provider配下で連携する。
- Secret暗号化親鍵は環境ごとのVercel環境変数に置き、DB・管理画面へ保存しない。
- Weekly Planは自動CONFIRMEDにせず、利用者の承認を必須とする。
- 初期Job基盤はVercel Cron + PostgreSQL Jobとし、独立Workerへ移せるPortを維持する。
- 通知はMissionへの入口とし、投稿本文、Prompt、KnowledgeをPushしない。
- LIFFはMission Deep LinkとLINE内ブラウザに必要な最小範囲に限定する。
- `LINE_MARKETING`、販促ステップ配信、AI自動返信、リッチメニュー高度化は対象外とする。

## 7. 6-A開始前に人間確認する事項

1. DEVELOPMENT、STAGING、PRODUCTIONそれぞれのアプリURLと許可ドメイン。
2. 環境ごとの`ENCRYPTION_KEY`とDeep Link署名鍵のkey version、rotation、復旧責任者。
3. 退会・連携解除時に即時削除する情報と、監査目的で一定期間保持する情報の期間。
4. Messaging API契約上の月間上限と、警告・停止通知の送信先。

6-0の人間レビューが完了するまで6-Aのコードへ進まない。本番チャネル準備が未完了でも6-Aのローカル実装は可能だが、本番Secret登録とACTIVE化は行わない。

## 8. 権限案

| 操作                                 | SUPER_ADMIN | OPERATOR | SUPPORT | READ_ONLY |
| ------------------------------------ | ----------- | -------- | ------- | --------- |
| 状態・非機密KPI閲覧                  | 可          | 可       | 可      | 可        |
| Secret末尾・接続エラー閲覧           | 可          | 可       | 不可    | 不可      |
| Secret登録・更新・無効化             | 可          | 不可     | 不可    | 不可      |
| 接続テスト・管理者本人へのテスト送信 | 可          | 可       | 不可    | 不可      |
| 限定再送                             | 可          | 可       | 不可    | 不可      |
| 全体緊急停止・再開                   | 可          | 原則不可 | 不可    | 不可      |

OPERATORへ緊急停止だけを例外的に許可する場合は、変更理由を必須にし、再開はSUPER_ADMINだけに限定する。

## 9. 通知初期値案

- timezone: 未設定時`Asia/Tokyo`
- local time: `08:00`
- frequency: `DAILY`
- quiet hours: `21:00`〜`07:00`
- Reminder: 初期OFF、利用者がONにした場合も1日最大1回
- 優先順位: Daily Mission本通知、Weekly Plan確認、Reminder、その他案内
- 月間使用率80%: 管理者へ警告
- 月間使用率90%: Reminderなど低優先通知を停止
- 月間上限到達: 新規送信を停止
- 停止と優先制御の判断・実行履歴を保存する

## 10. 環境分離

- `environment`は`DEVELOPMENT | STAGING | PRODUCTION`の閉じた値とする。
- application runtimeの信頼済み環境値とconfigurationの`environment`をサーバー側で比較する。
- 不一致時はLogin開始、callback処理、Webhook処理、接続テスト、Push、再送をfail closedで停止する。
- Preview deploymentはProduction configurationを解決できない。Previewを外部LINE連携に使う場合も専用の非Production設定を明示的に割り当てる。
- 環境ごとのACTIVEはDB一意制約で最大1件とし、application checkだけに依存しない。
- 管理画面の全画面で現在の対象環境を表示する。Production変更は確認画面と変更理由を必須にする。
- 設定複製APIを作らず、環境をまたいだSecret、URL override、接続結果のコピーを禁止する。

## 11. URL生成・検証

Callback URL、Webhook URL、LIFF Endpoint URL、Mission Deep Link Base URLは管理画面からの自由入力にしない。

- 信頼済みの配備環境アプリURLと固定pathからサーバー側で自動生成する。
- 管理画面では読み取り専用で表示し、LINE Developers Consoleへ登録する値としてコピーできるようにする。
- 例外的な変更はSUPER_ADMINだけに許可し、確認画面、変更理由、Audit Logを必須にする。
- URLはHTTPS必須とし、localhostはDEVELOPMENTだけで許可する。
- hostは環境別allowlistと完全一致させ、ProductionではProductionドメイン以外を拒否する。
- username、password、任意query、fragmentを拒否し、固定されたscheme、host、port、pathだけを許可する。
- callback後の復帰先は相対pathまたは環境別allowlistへ限定し、外部URLへのopen redirectを許可しない。
- DBにoverrideが存在しても、利用直前にサーバー側で再検証する。

## 12. Mission Deep Link署名鍵

- LINE Channel SecretとMessaging API Channel Access Tokenを署名鍵へ流用しない。
- 署名親鍵を管理画面・DBへ保存しない。
- 環境ごとのVercel環境変数に置く親鍵から、HKDF-SHA-256等で`environment + purpose + keyVersion`をcontextとして用途別鍵を導出する。
- 既存`ENCRYPTION_KEY`のraw valueを署名処理へ直接渡さない。暗号化とDeep Link署名で異なるinfo/contextの導出鍵を使用する。
- 安全な鍵分離を実装・運用できない場合は、専用`LINE_DEEP_LINK_SIGNING_KEY`を環境ごとに追加する別ADRを先に承認する。
- stateは`keyVersion`、purpose、expiresAt、single-use identifierと必要最小のresource referenceだけを持つ。
- Mission本文、個人情報、Secret、Token、Knowledgeをstateへ含めない。
- stateは短時間有効かつ一回限りとし、使用済みidentifierを再利用できないようサーバー側で消費を記録する。
- 署名検証後もverified User、Workspace、Bunshin、Mission ownershipを再検証する。

## 13. 管理画面の設定境界

### 設定可能

- LINE Login Channel ID / Channel Secret
- Messaging API Channel ID / Channel Secret / Channel Access Token
- LIFF ID
- 通知初期時刻、標準timezone、quiet hours
- 通知機能の全体停止
- 月間配信上限へ近づいた場合の停止基準

### 読み取り専用

- Callback URL、Webhook URL、LIFF Endpoint URL、Mission Deep Link Base URL
- 現在の実行環境
- Secret登録有無と末尾mask
- 最終接続確認日時、最終エラー分類、ACTIVE version

### 管理画面・DBへ保存しない

- `ENCRYPTION_KEY`, `SESSION_SECRET`, `CRON_SECRET`
- DB接続情報、Supabase Service Role Key、Vercel認証情報
- Deep Link署名親鍵

## 14. 接続テスト

入力有無だけで成功とせず、用途ごとに外部疎通と設定整合性を検証する。

### LINE Login

- Channel ID形式、Channel Secretによる検証可否
- Callback URLとruntime environmentの一致
- Login Channel、Messaging Channel、Provider構成の一致
- ID tokenのissuer、audience、signature、nonce検証に必要な設定

### Messaging API

- Channel Access Tokenの有効性とBot情報取得
- TokenとMessaging Channelの一致、利用可能な配信状態
- 認証エラー、失効、権限不足、quotaの分類

### Webhook

- Webhook URLとruntime environmentの一致、HTTPS、host allowlist
- Messaging Channel Secretによる署名検証
- ProductionとStagingのWebhook混在拒否

Provider response、Token、Secret、LINE user IDをlogやAudit Logへ保存しない。成功日時、用途、環境、結果、error categoryだけを保存する。

## 15. データ保持区分

実装前に次を個別設定として確定し、退会・連携解除時の即時削除または匿名化と、監査目的の期間保持を分離する。

- LINE Identity
- LINE Connection
- 通知設定
- 配信履歴
- 配信試行履歴
- Webhook処理履歴
- 設定変更Audit Log

保持期間中もproviderUserIdなどの直接識別子を不要な履歴へ複製しない。法令・不正防止・運用監査に不要な情報は猶予期間終了後に削除または不可逆匿名化する。

## 16. Migration / Rollback方針

- PRごとにadditive migrationを作成し、複数領域を1 migrationへまとめない。
- 6-Aは既存認証・Mission routeから参照しないtable追加とし、未設定時の既存Web動作を変えない。
- 環境ごとのACTIVE切替はtransactionとDB一意制約で守り、接続検証失敗時は同じ環境の旧versionを維持する。
- rollbackは機能flagまたは設定DISABLEDを先に行い、送信停止後にcode rollbackする。
- 配信済み履歴とAudit Logをrollback時に物理削除しない。
- destructive migrationはPhase 6では行わない。

## 17. 必須テスト

- Cross User / Workspace / Bunshin isolation
- Secret暗号化、復号、改ざん検知、mask、key version
- SecretやproviderUserIdがAPI、HTML、client bundle、logへ漏れないこと
- OAuth state、nonce、PKCE、ID token、Identity競合
- Webhook raw body署名、redelivery、未知event、空events
- timezone、曜日、quiet hours、停止中判定
- Job lease、idempotency、retry、dead、cancel
- Mission生成失敗時に通知されないこと
- 同一Mission通知を並行実行しても1件だけ送られること
- unfollow、通知OFF、退会要求、SUSPENDED時に送信されないこと
- runtime environmentとconfiguration environmentの不一致拒否
- 環境ごとの重複ACTIVE拒否と環境間設定コピー拒否
- Production URLへのStaging/Previewアクセス拒否、URL allowlist、open redirect拒否
- Deep Link stateのexpiry、single-use、keyVersion、環境・用途分離、再利用拒否

## 18. 停止条件

6-0承認前に6-Aのコードを実装しない。6-Aの暗号化境界、schema、migration、権限が承認される前に本番LINE SecretをDBへ登録しない。各PRは実装報告と検証結果を含め、次のPRへ自動的に進まない。
