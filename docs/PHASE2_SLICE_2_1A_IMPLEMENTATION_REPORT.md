# Phase 2 Slice 2.1-A Core Persistence Implementation Report

## 実装範囲

Slice 2.1-Aとして、Bunshin Identityのdomain model、application use case/port、Prisma schema/migration、Workspace境界を強制するrepository、unit/integration testだけを追加した。

認証、Production API、UI、Knowledge、Memory、Capability、SOCIAL、AI、LINE、BLOG、Jobは実装していない。Production環境へのmigration適用もこのPRでは行わない。

## Domain / Application

- Bunshin、Objective、Audience、Personalityのprovider非依存型
- Bunshin type/status、Objective status、Face policyの列挙値
- slug正規化・検証とOWNER/ADMIN/MEMBERの管理権限policy
- Create、List、Get、Update profile、Archive use case
- name、slug、summary、JSON文字列配列、Objective priorityの入力検証
- inaccessible entityを`NOT_FOUND`として扱う境界

## Persistence

- `Bunshin`、`BunshinObjective`、`BunshinAudience`、`BunshinPersonality`
- Workspace内slug、Objective priority、Personality 0..1のunique制約
- Workspace/Userへの`ON DELETE RESTRICT`
- 子entityからBunshinへの`ON DELETE CASCADE`
- 通常read/updateからARCHIVEDを除外
- create時にactorとowner双方のactive Workspace Membershipを確認
- MEMBERは自身のBunshinのみ更新・archive可能
- OWNER/ADMINは同一WorkspaceのBunshinを更新・archive可能
- Platform Adminに暗黙のWorkspace権限を付与しない

Migrationは`20260818170000_bunshin_identity`として追加した。

## 検証方針

unit testではslug、role policy、入力validation、NOT_FOUND変換を確認する。PostgreSQL integration testではaggregate永続化、cross-user/cross-workspace拒否、MEMBER所有境界、ADMIN管理、archive後の非表示を確認する。

Production反映はPR merge後に、既存のGitHub `Production` Environment承認付きmigration workflowで別途実施する。

## 次のGate

Production API/UIを実装するSlice 2.1-Bは、application sessionと`CurrentUserProvider` adapterの設計・実装承認まで開始しない。request由来の任意User IDをactorとして信頼する経路は作成しない。
