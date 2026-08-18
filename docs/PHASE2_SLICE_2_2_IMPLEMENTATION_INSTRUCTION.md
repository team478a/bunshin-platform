# Phase 2 Slice 2.2 Owner Knowledge / Grant 実装指示書

## 1. 状態

実装前レビュー用。本文書が承認されるまでDB migration・API・UIの実装を開始しない。

## 2. 目的

User本人が所有する再利用可能なKnowledgeと、Bunshinごとの明示的な利用許可を実装する。Knowledgeは同一Workspace内でも自動共有せず、`BunshinKnowledgeGrant`が有効な場合だけBunshin文脈から取得できるようにする。

## 3. 対象範囲

- `OwnerKnowledge` domain model、application use case、Prisma repository、migration
- `BunshinKnowledgeGrant` domain model、application use case、Prisma repository、migration
- Knowledgeの作成、一覧、取得、更新、アーカイブ
- Grantの追加、有効一覧、失効
- Workspace/User/Bunshin scopeとdefault DENY
- PostgreSQL integration test、unit test、HTTP contract test
- Production API/UIはCore Persistenceのレビュー後に別PRで追加する

## 4. 対象外

- AIによるKnowledge抽出、要約、分類、検索
- embedding、pgvector、類似検索、RAG、context assembler
- ファイルupload、画像解析、OCR、音声入力
- 外部サービスからのimport
- Bunshin Memory
- Capability、SOCIAL、BLOG、LINE、Job
- BrowserからSupabase Data APIへの直接table access
- Staging環境

## 5. Domain model

### OwnerKnowledge

```text
id
workspaceId
ownerUserId
type: PROFILE | EXPERIENCE | SKILL | PRODUCT | FAQ | CASE | ASSET | OTHER
title: 1..160文字
content: 1..20000文字
sourceType: MANUAL | IMPORT | SYSTEM
status: ACTIVE | ARCHIVED
archivedAt nullable
createdAt
updatedAt
```

初期Sliceで作成できる`sourceType`は`MANUAL`だけとする。`IMPORT`と`SYSTEM`は将来のadapter用のenum値であり、このSliceに生成経路を作らない。

### BunshinKnowledgeGrant

```text
id
workspaceId
bunshinId
ownerKnowledgeId
grantedByUserId
status: ACTIVE | REVOKED
grantedAt
revokedAt nullable
```

仕様記載の`access: ALLOW | DENY`は、default DENYと監査可能な失効を同時に満たすため、永続化では`status: ACTIVE | REVOKED`として具体化する。DENY rowは作らず、有効なALLOW相当rowが存在しない状態をDENYとする。

## 6. DB制約

- `OwnerKnowledge.workspaceId`、`ownerUserId`は必須foreign key
- Knowledge ownerは同じWorkspaceのactive Membershipを持つUserに限る
- `BunshinKnowledgeGrant.workspaceId`を冗長保持し、KnowledgeとBunshinのWorkspace一致をtransaction内で検証する
- `(workspaceId, bunshinId, ownerKnowledgeId)`をuniqueにする
- grant対象KnowledgeとBunshinはACTIVE/非ARCHIVEDに限る
- revokeはrow削除でなく`REVOKED`と`revokedAt`を記録する
- 再grantは同じrowを`ACTIVE`へ戻し、`grantedAt`と`grantedByUserId`を更新する
- Knowledge archive時は関連するACTIVE grantを同じtransactionでREVOKEDにする
- User、Workspace、Bunshin、Knowledgeはcascade deleteせず、既存のarchive/status方針を優先する

PostgreSQLの通常foreign keyだけでは2つの参照先のWorkspace一致を完全には表現できないため、application/repository transactionを正本とし、cross-workspace integration testで保証する。複合foreign key追加は既存schemaへの影響を調査してから判断する。

## 7. 認可

- actorは`CurrentUserProvider`が返すverified session userだけを使用する
- request由来の`actorUserId`、`ownerUserId`、`grantedByUserId`を信頼しない
- Knowledgeの作成者ownerはactor本人とする
- Knowledge CRUDはactive Workspace Member本人の所有Knowledgeだけを対象にする
- grant/revokeはBunshinを管理できるOWNER/ADMIN、またはBunshin ownerに限る
- grant対象Knowledgeは同一Workspace内のactive Knowledgeに限る
- 認可失敗と他tenant対象は`NOT_FOUND`へ統一し、存在を漏らさない
- Platform Admin overrideは実装しない

## 8. Application port / use case

```text
OwnerKnowledgeRepository
  create
  listOwned
  findOwned
  updateOwned
  archiveOwned

BunshinKnowledgeGrantRepository
  grant
  revoke
  listGrantedKnowledge

CreateOwnerKnowledge
ListOwnerKnowledge
GetOwnerKnowledge
UpdateOwnerKnowledge
ArchiveOwnerKnowledge
GrantKnowledgeToBunshin
RevokeKnowledgeFromBunshin
ListGrantedKnowledgeForBunshin
```

`ListGrantedKnowledgeForBunshin`はACTIVE Bunshin、ACTIVE Knowledge、ACTIVE Grant、active Workspace Membershipのintersectionだけを返す。grantが0件なら空配列を返す。Workspace全Knowledgeへfallbackしない。

## 9. PR分割

### PR 2.2-A: Core Persistence

- domain type、application port/use case
- Prisma model、migration、repository
- validation、unit test、PostgreSQL integration test
- implementation report

API、UI、AI、import、file uploadは含めない。

### PR 2.2-B: Authenticated HTTP / Minimal UI

2.2-Aのマージ後に別指示書で範囲を確定する。verified session、same-origin、JSON Content-Type、`no-store`、共通error mappingを2.1-Bと同じ方針で再利用する。

## 10. 必須テスト

1. grantなしでは同一WorkspaceのKnowledgeもBunshinから取得できない
2. User AはUser Bの所有Knowledgeを更新・archiveできない
3. 別WorkspaceのKnowledgeをgrantできない
4. 別WorkspaceのBunshinへgrantできない
5. MEMBER/ADMIN/OWNERおよびBunshin ownerのpolicyが既存方針と一致する
6. revoke後は通常取得に含まれず、監査時刻が残る
7. archiveしたKnowledgeは通常一覧とBunshin contextに含まれない
8. Knowledge archiveとgrant revokeが同一transactionで完了またはrollbackする
9. 同じKnowledge/Bunshinへの重複grantでrowが増えない
10. inactive Membership、archived Bunshin、archived Knowledgeを拒否する

## 11. 完了条件

- 本指示書とD-016が承認済み
- migrationにforward/rollback手順がある
- default DENYとcross-workspace拒否をPostgreSQL integration testで実証する
- domain/applicationにNext.js、Prisma、Supabase、AI provider型を入れない
- lint、typecheck、unit test、integration test、build、auditが成功する
- `docs/PHASE2_SLICE_2_2A_IMPLEMENTATION_REPORT.md`を作成する
- 2.2-B、Memory、Capability、SOCIAL、AI、LINE、BLOG、Jobを実装しない

## 12. 承認事項

- [ ] grantはDENY rowを作らず、ACTIVE grant不在をdefault DENYとする
- [ ] grant失効は物理削除せずREVOKEDとして監査可能にする
- [ ] Knowledge archive時にACTIVE grantを同一transactionで失効する
- [ ] 2.2-AはCore Persistenceだけとし、API/UIを別PRにする
- [ ] embedding、AI抽出、import、file uploadを対象外とする
