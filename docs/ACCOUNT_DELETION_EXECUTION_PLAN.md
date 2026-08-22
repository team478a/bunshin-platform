# アカウント退会・匿名化実行計画

更新日: 2026-08-22

対象: Phase 7 Account Deletion Execution

状態: 人間レビュー待ち（本書ではコード、Prisma Schema、Migrationを変更しない）

## 1. 目的

本人が退会要求を行い、14日間の猶予が終了した後に、ログイン不能化、通知停止、個人情報削除、Personal Workspaceの利用停止を冪等に実行する。監査・法的保持が必要な最小履歴は、本人を直接識別できない状態にして保持する。

物理的な`User`行削除は採用しない。現行Schemaには監査目的の`Restrict`参照が多数あり、User行を消すと設定監査、AI利用、Job、Mission Activity、PostRecord、配信再送履歴等の整合性が失われるためである。

## 2. 実コード監査結果

- `User`には`ACTIVE | SUSPENDED | DELETED`があり、`email`はnullableである。
- `AuthIdentity.providerUserId`はSupabase Auth User ID等の外部識別子で、Userとは別resourceである。
- 退会要求は`REQUESTED | CANCELLED | COMPLETED`、`scheduledFor`、partial unique indexを持つ。
- `LineConnection.providerUserId`、Post URL、Knowledge、Memory、Mission Contentには個人情報またはユーザー生成情報が入り得る。
- `LineConfigurationAudit`、`AiUsageEvent`、`Job`、Mission Activity、PostRecord等はUserへ`Restrict`参照する。
- Personal / Organization Workspaceは同じtableであり、Organizationの唯一OWNERを自動削除すると管理不能になる。
- 現行JobはWorkspace/Bunshin中心で、User単位の不可逆処理をそのまま流用するには責務が合わない。
- Supabase Admin APIによるAuth User削除に必要なService Role Keyは現在のアプリ環境境界へ未追加である。

## 3. 採用する実行順序

### 3.1 Claim

猶予終了済み`REQUESTED`をDBでclaimし、`PROCESSING`、lease owner、lease expiry、attempt countを記録する。同一requestを並行実行しても一つのworkerだけが処理する。

### 3.2 実行前再検証

- Userが`ACTIVE`または退会処理中である
- requestが未取消で`scheduledFor <= now`
- Organization Workspaceの唯一のACTIVE OWNERではない
- Platform AdminがACTIVEではない
- legal holdが存在しない

一つでも満たさない場合は`BLOCKED`とし、固定分類だけを記録する。自由記述、メール、外部IDをerrorへ保存しない。

### 3.3 即時停止

- Userを`SUSPENDED`へ変更
- 全Membershipを`SUSPENDED`または`REVOKED`
- LINE通知設定を無効化して同意日時を消去
- LINE Connectionを切断し、未送信Delivery / Jobを取消
- Mission Deep Link stateを失効
- 新しいsession actor解決を拒否

この段階から本人操作・AI生成・LINE送信を許可しない。

### 3.4 外部認証削除

専用の`SupabaseAuthAdministrationPort`から対象Supabase Auth Userを削除する。Service Role KeyはProduction環境変数だけに置き、DB、管理画面、Job payload、logへ保存しない。

外部削除は「既に存在しない」を成功として扱う。timeout等はretry可能、認証・環境不一致は`BLOCKED`とする。Platform DBのIdentityを先に消すと再試行対象を解決できないため、外部削除成功後に`AuthIdentity`を削除する。

### 3.5 Platform匿名化

- `AuthIdentity`: 全件削除
- `User.email`: `null`
- `User.displayName`: 固定値`退会済みユーザー`
- `User.status`: `DELETED`
- `LineConnection`: providerUserIdを残さず削除
- `LineNotificationPreference`: 削除
- `MissionDeepLinkState`: 削除
- `PostRecord.postUrl`, `externalPostId`, `manualMetrics`: 消去
- 自由記述を含むMission Activity metadata: `null`
- Organization Workspace Membership: `REVOKED`で保持し、Organizationデータは削除しない
- Userが作成した監査行: actor User IDはpseudonymousな`DELETED` Userへの参照として保持

Organization内で本人が作成したKnowledge等は、組織資産として移管できる内容と本人情報を含む内容を機械的に判別できない。初回実装では自動移管・自動purgeを行わず、対象が存在する場合は`MANUAL_REVIEW_REQUIRED`としてBLOCKEDにする。

### 3.6 Personal Workspace

初回実装は物理削除ではなく、Userが唯一OWNERであるPersonal Workspaceを`ARCHIVED`にし、Bunshinを`ARCHIVED`、Capabilityを`SUSPENDED`へ変更する。Knowledge、Memory、Strategy、Mission Content等のユーザー生成本文は匿名化transactionで消去または専用purge処理へ渡す。

全tableの依存順が統合テストで確定するまではWorkspace物理削除を行わない。バックアップからの自然消滅はSupabaseの確定保持期間に従う。

### 3.7 Complete

すべて成功後だけrequestを`COMPLETED`にし、`completedAt`、処理version、集計件数を記録する。個々の削除値や外部Provider responseは記録しない。

## 4. Schema変更候補

`AccountDeletionRequestStatus`へ`PROCESSING | BLOCKED`を追加する。

`AccountDeletionRequest`へ以下を追加する。

- `attemptCount`
- `leaseOwner`, `leaseExpiresAt`
- `processingStartedAt`
- `blockedReason`
- `lastErrorCategory`
- `executionVersion`
- `summary`（table別件数だけのJSON）

`blockedReason`候補:

- `SOLE_ORGANIZATION_OWNER`
- `ACTIVE_PLATFORM_ADMIN`
- `LEGAL_HOLD`
- `AUTH_CONFIGURATION_UNAVAILABLE`
- `AUTH_ENVIRONMENT_MISMATCH`
- `MANUAL_REVIEW_REQUIRED`

User ID、email、providerUserId、本文をrequestのerror / summaryへ複製しない。

## 5. 実装分割

### PR A: Execution Core

- additive migration
- claim / lease / retry / block / complete
- 実行前Gate
- User停止、通知・Job取消
- repository/use case/integration test
- 外部Auth削除と本文purgeはPortで分離

### PR B: Supabase Auth Adapter

- Service Role Key環境変数
- Production/Preview環境分離
- delete idempotency、timeout、error分類
- Secret / provider response非記録テスト

### PR C: Personal Data Purge

- table別匿名化・本文purge
- Personal / Organization境界
- crash途中からの再実行
- COMPLETED確定

### PR D: Scheduler / Admin Operations

- CRON Secretで保護した少量batch実行
- Platform AdminのBLOCKED確認
- 理由付き再実行
- metrics、Runbook、Production dry-run

## 6. 必須テスト

- 14日未満とCANCELLED requestを処理しない
- 同一requestの並行claimは一つだけ成功
- crash後のlease回収と冪等再実行
- Cross User / Workspace isolation
- Organization唯一OWNERをBLOCKEDにする
- Organizationの他Member/Bunshin/Knowledgeを削除しない
- Platform Adminを自動処理しない
- 外部Auth削除前にIdentityを失わない
- 外部Auth timeoutをretryし、credential不正をBLOCKEDにする
- 未送信LINE通知、Job、Deep Linkを停止する
- email、LINE user ID、Post URL、自由記述metadataを残さない
- 監査行がpseudonymous User参照のまま整合する
- API、HTML、log、Job payloadへ削除対象値を出さない

## 7. Rollback

`SUSPENDED`までなら、外部Auth削除前に限り運用者が処理を止められる。外部Auth削除とPlatform匿名化開始後は復旧不能として扱い、通常rollbackを提供しない。code rollbackより先にScheduler停止とlease失効待ちを行う。

バックアップから単一Userを復元する運用は採用しない。法令・障害対応でバックアップ全体を復旧する場合も、削除済みUserを再有効化せず、削除tombstoneを再適用する手順が必要である。

## 8. 人間確認事項

実装前に次を確定する。

1. Organization唯一OWNERの退会要求をBLOCKEDにし、別OWNER指名を必須とするか。
2. ACTIVE Platform Adminは自動退会を禁止し、権限取消後に再要求させるか。
3. User、退会要求、監査、AI usage、配信attemptの保持期間。
4. Knowledge、Memory、Mission、Strategy、PostRecordの本文を猶予終了時に即時purgeするか。
5. Supabase Auth Userを猶予終了時に即時削除するか。
6. Supabase backup保持期間と削除tombstone再適用手順。
7. Service Role KeyをVercel Productionへ登録する権限者とrotation担当者。
8. legal holdが必要か。必要なら誰が設定・解除できるか。
9. Organization内の本人作成Knowledge等を別OWNERへ移管するか、本人情報部分をpurgeするか。

承認前にExecution Core、Migration、Supabase Admin API接続、不可逆匿名化を実装しない。
