# Phase 3 Slice 3.1-A Core Persistence 実装報告

## 1. 実装範囲

手動Social ProfileのCore Persistenceだけを実装した。認証HTTP API、Production API、UI、Knowledge、Memory、Capability管理画面、SNS Provider、AI、LINE、BLOG、Mission、Content、Jobは実装していない。

## 2. 変更内容

- `@bunshin/capability-social`を追加し、Social Profile型、validation、repository port、use caseを配置した。
- platform、投稿頻度、希望形式、Profile状態を閉じた型として定義した。
- create/update/状態変更に既存の`RequireActiveBunshinCapability`を接続した。
- Prismaへ`SocialProfile`、enum、複合一意制約、Workspace/Bunshin複合外部キーを追加した。
- database packageへWorkspace/Bunshin scopeと既存管理policyを強制するrepository adapterを追加した。
- unit testとPostgreSQL integration testを追加した。

## 3. 境界と設計判断

- `workspaceId + bunshinId + platform`を一意とし、platformは更新対象にしない。
- `preferredFormats`はDBでJSON配列として保持し、読み書き時に1〜4件・重複なし・既知値だけを許可する。
- mutationはACTIVEなSOCIAL Assignmentだけを許可する。停止中でもWorkspace Memberによるreadは可能とする。
- ProfileのACTIVE/INACTIVEとAssignmentのACTIVE/SUSPENDED/LOCKEDを独立した状態として扱う。
- MEMBERは自分が所有するBunshinだけを変更でき、OWNER/ADMINは既存policyに従って管理できる。
- 複合外部キーにより、Social ProfileのWorkspaceとBunshinのWorkspace不一致をDBでも拒否する。

## 4. 検証項目

- 入力正規化、HTTPS URL、希望形式のvalidation
- SOCIAL未割当、SUSPENDED、LOCKEDでのmutation拒否
- ACTIVE SOCIAL Assignmentでのcreate/update/状態変更
- Workspace/Bunshin分離、MEMBER/ADMIN/OWNER policy
- Profile重複、複合外部キー、破損JSONの拒否
- archive済みBunshinの非公開化
- Prisma generate / validate、format、typecheck、lint、unit、PostgreSQL integration、build

## 5. Rollback

本番適用後に戻す場合はSocial Profileデータを退避し、外部キー、index、`social_profiles`、追加enum、Bunshin複合unique indexの順に削除するforward-fix migrationを作成する。適用済みmigrationは編集しない。

## 6. 次のSlice

本PRをレビュー・mergeした後、Slice 3.1-B authenticated API/UIのHTTP contractを別指示書としてレビューする。本PRではAPI/UIを公開しない。
