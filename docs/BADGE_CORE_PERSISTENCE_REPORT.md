# バッジ Core Persistence 実装報告

## 1. ゴール

B-1として、既存`AchievementBadge`を変更せず、新しいBadge Definition／Version／Progress／Award／Processing Event／Auditの永続化基盤を追加した。共通バッジの判定、初期Catalog、API、UI、通知、Point特典はB-2以降へ分離する。

## 2. 追加したデータ

- `BadgeDefinition`: SYSTEMまたはGROUPが所有する論理バッジ
- `BadgeVersion`: 表示、条件、公開範囲、特典方針、期間の不変Version
- `BadgeProgress`: 再構築可能な利用者別進捗
- `BadgeAward`: 利用者別の追記型獲得記録と根拠Snapshot
- `BadgeProcessingEvent`: 元行動の冪等な処理状態
- `BadgeAdminAuditLog`: 定義・版・獲得に対する管理操作

## 3. 境界

- SYSTEM定義は`workspaceId`と`groupId`を持たない。
- GROUP定義は同じWorkspaceのGroupを必須とする。
- Awardの所有者はUserで、Bunshinは任意の根拠参照に限定する。
- Group Badgeの進捗と獲得は、対象GroupのACTIVE参加者だけに限定する。
- SYSTEM BadgeへGroup帰属を混ぜない。
- Group、Bunshinの参照は`workspaceId`を含む複合外部キーで別Workspace混入を防ぐ。

## 4. 冪等性と履歴

- Definitionは所有ScopeとCodeで一意にする。
- VersionはDefinition内の連番で一意にする。
- Awardは`workspaceId + userId + idempotencyKey`およびBadge Versionで一意にする。
- Processing Eventは`workspaceId + eventType + sourceEventId`で一意にする。
- AwardはBadge Versionを参照し、後から定義内容が変わっても過去の獲得根拠を変更しない。
- 獲得根拠はSHA-256 Hash、元種別、元IDだけを保持し、投稿本文、Knowledge、Memoryを複製しない。

## 5. 権限

- SYSTEM Definitionの作成、版追加、公開はACTIVEなSUPER_ADMINだけに限定する。
- GROUP Definitionの操作はACTIVEなWorkspace MembershipとGroup MANAGERを両方持つUserだけに限定する。
- すべての定義・版操作は理由付きAuditを残す。
- Progress、Award、Processing EventはACTIVE User／Workspace Membershipを再確認する。

## 6. 既存簡易バッジ

既存`AchievementBadge`と旧判定処理は、このPRでは変更しない。B-2で初期10種類のDefinition／Versionを作成し、対応可能な旧獲得だけを新Awardへ一度だけ移行してから旧判定を停止する。新旧処理を同時にPointやEntitlementへ接続しない。

## 7. 対象外

- 初期10バッジのSeedと判定Processor
- 利用者向け一覧、進捗、公開設定
- Group独自バッジ申請・承認画面
- Point、画像専用Entitlement、企業履行
- LINE／アプリ内通知
- PUBLICプロフィール、ランキング、AI品質評価

## 8. 検証

- Prisma Schema validation
- Application TypeScript typecheck
- Database TypeScript typecheck
- Use Case validation test
- Migration invariant test
- Prettier、ESLint、全体Test／Build

## 9. 次のPhase

B-1のマージ後、B-2でFIRST／STREAK_DAILY／STREAK_WEEKLYだけを扱う共通Badge Processor、初期10種類のSeed、旧簡易バッジ移行、再試行可能な冪等処理を追加する。
