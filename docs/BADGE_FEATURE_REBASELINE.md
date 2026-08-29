# ワタシワークス バッジ機能 再基準化

## 1. 目的

バッジを、利用者が次の行動を理解し、開始・継続・挑戦を実感するための達成基盤として追加する。バッジは証明、ワタシポイントは利用可能報酬として別台帳にし、重要な達成だけを非同期の特典連携で接続する。

本書は`WATASHI_WORKS_BADGE_FEATURE_SPEC_V1_0.docx`と最新`main`の差分監査結果を記録する。B-0では実装コード、Prisma Schema、Migrationを変更しない。

## 2. 現在の実装

### 2.1 利用可能な基盤

- User、Workspace、Workspace Membership
- Group、Group Membership、Group管理者／参加者
- Platform Admin、SUPER_ADMIN、OPERATOR、AUDITOR
- Group Feature Definition／Policy／Member Assignment／Usage Event
- MissionActivity、MissionDecision、PostRecord、MissionFeedback
- SocialAccountStrategy、画像生成、動画Project
- Point Account、Rule Version、Transaction、Processing Event
- Point Reward Catalog、Redemption、予約／確定／解放／返却
- Job、再試行、Cron、監査・運用画面の共通パターン

### 2.2 既存の簡易バッジ

`AchievementBadge`とActivity Continuity Ruleにより、次の簡易バッジが存在する。

- はじめて確認
- はじめて準備
- はじめて投稿
- 3日活動

既存モデルは`workspaceId + userId + bunshinId + featureKey + badgeKey + ruleVersion`単位で、表示Snapshotと獲得日時だけを保持する。定義、版、進捗、公開範囲、取消、失効、企業所有、特典連携を独立管理できないため、新仕様の正本にはしない。

## 3. 採用する基本方針

1. 他人との順位ではなく、本人の開始・継続・挑戦を評価する。
2. AIに投稿品質、人格、優劣を採点させない。
3. 客観的な既存行動、本人回答、権限を持つ管理者の承認だけを根拠にする。
4. バッジ獲得台帳とポイント台帳を分離する。
5. バッジ条件、名称、画像、期間、特典は版管理し、過去獲得を上書きしない。
6. 一般公開は本人の明示操作だけで行い、初期値は非公開とする。
7. バッジ障害、通知障害、特典障害で企画確認、コピー、投稿完了を停止しない。
8. 同じ根拠イベント、同じ期間、同じ承認申請から二重獲得しない。
9. 企業独自バッジはWorkspace／Group境界、対象者、発行主体を固定する。
10. Feature Flagでテストグループだけに段階公開する。

## 4. 用語と所有境界

仕様書の`tenant`は新しい概念として追加せず、現在の境界へ次のように対応させる。

- 契約・データ分離の最上位: `workspaceId`
- 企業内の参加単位・施策単位: `groupId`
- 獲得者本人: `userId`
- 根拠となった分身: `sourceBunshinId`（任意）

バッジ獲得の主体はUserとする。同じUserが複数のBunshinを使用しても、生涯初回バッジを重複付与しない。Bunshinは口調や発信主体の根拠であり、バッジ所有者にはしない。

企業独自バッジの所有主体は初期MVPではGroupとする。将来Workspace全体の企業バッジが必要になった場合も、`ownerType + ownerId`で拡張できる構造にする。

## 5. 既存簡易バッジの扱い

既存`AchievementBadge`を新仕様へ直接拡張しない。

推奨移行は次のとおり。

1. 新しいBadge Coreを別テーブルで追加する。
2. 新Core稼働前の既存獲得を移行対象として読み取る。
3. 対応する新Badge Versionへ、移行元IDを根拠に一度だけAwardを作る。
4. 移行後も旧レコードは監査用に保持する。
5. UIを新Read Modelへ切り替えた後、旧判定処理を停止する。

二重表示・二重特典を防ぐため、新旧判定を同時に特典連携へ接続しない。

## 6. 初期共通バッジ

最初は次の10種類に限定する。

| コード          | 表示名           | 根拠                     | 条件型        |
| --------------- | ---------------- | ------------------------ | ------------- |
| FIRST_PERSONA   | はじめの一歩     | Bunshin作成              | FIRST         |
| STRATEGY_READY  | 発信準備完了     | SNS戦略承認              | FIRST         |
| FIRST_PLAN_VIEW | 初めての企画     | MissionActivity VIEWED   | FIRST         |
| FIRST_ADOPTION  | 初めての採用     | MissionDecision ACCEPTED | FIRST         |
| FIRST_POST      | 初投稿           | PostRecord               | FIRST         |
| FIRST_FEEDBACK  | 振り返り上手     | MissionFeedback          | FIRST         |
| VIEW_STREAK_3   | 3日続けて確認    | MissionActivity VIEWED   | STREAK_DAILY  |
| VIEW_STREAK_7   | 1週間続けて確認  | MissionActivity VIEWED   | STREAK_DAILY  |
| WEEKLY_POST_4   | 4週間継続        | PostRecord               | STREAK_WEEKLY |
| IMAGE_FIRST     | 画像づくりに挑戦 | 画像生成完了             | FIRST         |

以下は初期10種類の実績確認後に追加する。

- WEEKLY_POST_12、POST_10、POST_50、FEEDBACK_10
- FORMAT_2、PLATFORM_2、VIDEO_FIRST
- MONTHLY_POST_5、MONTHLY_POST_10
- LINE_READY
- NON_PROMO_10

`NON_PROMO_10`は非販促を説明可能に判定する正本属性が不足しているため、推測で実装しない。企業研修・認定は研修または承認Coreの追加後に扱う。

## 7. 条件定義

対応する条件型は次に限定し、管理画面から任意コードや任意JSON条件を実行しない。

- FIRST
- COUNT
- STREAK_DAILY
- STREAK_WEEKLY
- WINDOW
- COMPOSITE
- DISTINCT
- MANUAL_APPROVAL
- IMPORT

条件は型ごとのSchemaで検証し、イベント種別は許可済みCatalogから選択する。日時境界は利用者Timezoneを使い、未設定は`Asia/Tokyo`とする。週は月曜日開始とする。

## 8. データモデル候補

### BadgeDefinition

- id
- ownerType: SYSTEM／GROUP
- workspaceId nullable
- groupId nullable
- code
- category
- status
- currentVersion
- createdAt／updatedAt

### BadgeVersion

- id
- definitionId
- version
- title／description
- imageKey／lockedImageKey／altText／backgroundColor
- conditionType／conditionConfig
- visibilityPolicy
- rewardPolicy
- startsAt／endsAt
- publishedAt
- createdAt

### BadgeProgress

- workspaceId／userId／badgeVersionId
- currentValue／targetValue
- streakState
- state: NOT_STARTED／IN_PROGRESS／ELIGIBLE／AWARDED
- lastEventAt／revision／updatedAt

Progressは再構築可能なRead Modelとし、獲得の正本にはしない。

### BadgeAward

- workspaceId／userId／badgeVersionId
- groupId nullable
- sourceBunshinId nullable
- awardedAt
- sourceType／sourceId
- evidenceHash
- idempotencyKey
- status: ACTIVE／REVOKED／EXPIRED
- revokedAt／expiredAt

Awardは追記・状態遷移で保持し、物理削除や旧Versionへの付替えを行わない。

### 補助モデル

- BadgeVisibility
- BadgeApprovalRequest
- BadgeRewardLink
- BadgeProcessingEvent
- BadgeAdminAuditLog
- BadgeRewardEntitlement（専用特典が必要な場合）
- BadgeTenantFulfillment（企業による手動履行）

## 9. イベント処理

既存行動の保存処理へ同期依存を追加しない。Badge Processorが既存正本から候補を取得し、冪等に処理する。

```text
既存行動を保存
  ↓
Badge Processorが候補を取得
  ↓
対象Badge Versionと利用可否を検証
  ↓
Progress更新／Award追加
  ↓
通知・特典Outboxを追加
```

Badge Processing Eventは`workspaceId + eventType + sourceEventId`で一意にする。処理失敗時は安全なエラー分類だけを保持し、投稿本文、Knowledge、Memory、秘密値を保存しない。

## 10. ポイント・特典連携

バッジ判定処理からPointAccountを直接更新しない。

1. Badge Awardを先に確定する。
2. Badge Reward Linkを`PENDING`で作成する。
3. Outbox／JobがPoint CoreまたはEntitlement Coreへ依頼する。
4. 成功時は`COMPLETED`、失敗時は再試行する。
5. 特典失敗でもBadge Awardを取り消さない。

### 重複付与の注意

現在は投稿完了に対するポイントRuleが存在する。仕様書案の「初投稿で10 WP」をそのまま追加すると、既存の投稿ポイントと二重付与になる。

B-0の推奨初期値は、初期10バッジを`rewardType = NONE`で開始することとする。バッジ表示群とポイント群の継続効果を分けて検証した後、重要バッジだけに特典を設定する。

### 画像生成1回

「4週間継続で画像生成1回」を50 WP付与として実装すると、追加企画など別用途にも消費できる。このためB-5Aでは、画像専用特典をPointへ読み替えず、用途固定の`BadgeRewardEntitlement`として発行する方針を採用した。初期10バッジの`rewardType = NONE`は変更せず、実際の特典Catalog有効化と画像生成への消費接続はB-5Bで別途行う。

## 11. 権限とFeature Key

既存Group Feature階層を再利用し、初期候補を次とする。

- BADGES
- BADGES.COMMON
- BADGES.GROUP
- BADGES.PROGRESS
- BADGES.REWARDS
- BADGES.APPROVAL

上位のSYSTEMまたはGroup Policyが禁止した機能をMember Assignmentで有効化できない。対象外・境界不一致は非表示または404を基本とする。

### 利用者

- 自分の獲得、進捗、公開設定だけを操作
- 他UserのPRIVATE Badgeを参照不可
- 企業バッジへ任意申請できる場合も、許可されたBadge Versionだけを対象

### Group管理者

- 自Groupの定義下書き、公開申請、候補確認
- 個人の通常投稿本文、Personality、Knowledge、Memoryを参照不可
- 自分自身への承認は別の権限者を必要とする

### SUPER_ADMIN／AUDITOR

- SUPER_ADMINは共通定義、Group申請、停止、例外取消を管理
- AUDITORは監査証跡、集計、CSVのRead Only

## 12. 公開範囲

初期公開は`PRIVATE`と`GROUP`に限定する。一般公開プロフィール基盤が整うまで`PUBLIC`を実際の外部公開へ接続しない。

- 獲得直後の初期値はPRIVATE
- Group公開は本人が明示的に許可
- Group管理者は一般公開を強制不可
- Group離脱時はGroup公開を停止
- 公開取消はAward取消ではない

PUBLICと代表バッジは後続Phaseで、プロフィールの公開URL、同意、削除、検索Engine露出を確認して追加する。

## 13. 通知

初期はアプリ内通知を正とし、LINEはFeature FlagでテストGroupだけに限定する。

- 同一Awardの獲得通知は1回
- 進捗通知は1日最大1件
- 連続期限通知は週2回以内
- LINE本文に投稿本文、Knowledge、Memory、審査メモを含めない
- 詳細は短期署名付きWeb導線で本人確認後に表示
- 通知失敗でAwardを取り消さない

## 14. 実装フェーズとPR分割

### B-0: Badge Rebaseline

文書のみ。本書、Roadmap、Decision Logを更新する。

### B-1: Badge Core Persistence

- Definition／Version／Progress／Award
- Processing Event／Audit
- Repository／Use Case／Isolation Test
- 既存AchievementBadge移行方針

### B-2: Common Badge Processor

- 既存正本からの候補取得
- FIRST／STREAK_DAILY／STREAK_WEEKLY
- 初期10Badge seed
- 冪等、再試行、対象限定再計算

### B-3: User API／Mobile UI

- 獲得済み／挑戦中／次におすすめ
- 詳細、進捗、獲得理由
- PRIVATE／GROUP公開設定
- ポイント画面との別表示

### B-4: Group Badge

- Group管理者の下書き、申請
- SUPER_ADMIN承認
- 候補承認、自己付与防止
- Group境界、監査、CSV

### B-5: Reward Integration

- Reward Link／Outbox
- Point Grantまたは専用Entitlement
- 再試行、補償、原価上限
- 取消時回収方針

### B-6: Notification／Operations／Pilot

- アプリ内・LINE通知
- 監視、DLQ、整合性照合、緊急停止
- テストGroup30人・4週間検証

各PRをマージしてから次へ進み、B-0の人間確認前にSchema／Migrationへ進まない。

## 15. 必須テスト

- 同一イベント再送、Job再実行、同時処理で二重獲得しない
- 別User、別Workspace、別GroupのAward／Progressを参照できない
- Group管理者が個人の通常投稿、Personality、Knowledge、Memoryを取得できない
- 上位で禁止されたBadge機能を下位設定で有効化できない
- 版変更後も過去Awardは旧Versionを保持する
- PRIVATE Awardを本人以外が取得できない
- Group離脱時にGroup公開を停止する
- 特典失敗時もAwardを保持し、再試行で重複付与しない
- バッジ機能停止中も企画確認、コピー、投稿完了を利用できる
- Timezoneの日跨ぎ、週跨ぎ、変更後固定を検証する

## 16. P-4C監査結果

P-4C「追加企画生成への交換Core接続」の前提となる利用者向け別案生成処理は、最新`main`に存在しない。通常Daily Missionは同日一意であり、既存文書も別案生成を利用状況と原価境界の確認後に再判断する範囲としている。

このためP-4Cでは、ポイントだけを先行接続しない。次の設計が承認された後に、別案生成Coreと交換接続を同じGoal内で分割する。

- 同日通常Missionとの関係
- 元Mission／派生Missionの追記型履歴
- 1日当たり回数
- Provider受付・失敗・返却境界
- 生成原価とGroup／販売Plan上限
- 外部成果計測URLの再解決と過去Snapshot不変

Catalog Item `ALTERNATIVE_PLAN_GENERATION`はDRAFT／未接続のまま保持し、利用者へ表示しない。

## 17. 確定事項

2026-08-29に推奨初期値で進める方針を確認した。

1. 初投稿Badgeを含む初期10種類はPoint特典なしで開始する。
2. 4週間継続の画像専用特典はB-5まで保留し、WPへ読み替えない。
3. 初期共通Badgeは本書の10種類に限定する。
4. PUBLICプロフィールは初期MVPから外す。
5. 既存AchievementBadgeは新Coreへ一度だけ移行する。
6. Group独自BadgeはB-4でテストGroupへ追加する。
7. 取消時のPoint／Entitlement回収可否は、特典定義Versionごとに固定する。

## 18. 停止条件

本書の推奨初期値は確認済みである。B-0文書PRがマージされるまでは、次を実装しない。

- Badge Schema／Migration
- Badge Award／Progress Job
- Group Badge管理画面
- Point／Entitlement連携
- LINE Badge通知
- PUBLICプロフィール
- P-4C追加企画生成
