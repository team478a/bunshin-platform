# BUNSHIN Platform Phase 2 Slice 2.1 実装指示書

作成日: 2026-08-18  
対象: `team478a/bunshin-platform`  
Slice: Bunshin Identity  
状態: Review Required

## 1. 目的

Phase 2「Multi-Bunshin Core」の最初の縦切りとして、1 User : N Bunshinの所有境界を実コードとPostgreSQL制約で成立させる。

本SliceではBunshinのIdentity、Objective、Audience、Personalityを扱う。Owner Knowledge、Memory、Capability、SOCIAL、AI、LINE、BLOG、Jobは実装しない。

## 2. 開始Gate

実装開始前に次を満たすこと。

- [x] Phase 1 PRがmerge済み
- [x] ProductionのVercel/Supabase接続と初期migrationが正常
- [x] Phase 2を独立Sliceで進める方針が承認済み
- [ ] 本指示書のdomain/schema/API境界がレビュー済み
- [ ] 認証Gateの扱いが承認済み

最後の2項目が完了するまで、DB migration、API、UIの実装を開始しない。

## 3. Scope

### 実装する

- Bunshin domain model
- Bunshin Objective / Audience / Personality
- Workspace membershipに基づく所有・操作権限
- Bunshin作成、一覧、詳細、基本情報更新、archive
- Prisma schemaと前方互換migration
- repositoryとapplication use case
- Cross-user / Cross-workspace isolation test
- 認証済みCurrent Userを前提としたHTTP contract
- 認証導入後に有効化する最小mobile-first UIの設計

### 実装しない

- Owner Knowledge / Knowledge Grant
- Bunshin Memory / embedding / pgvector
- Capability Assignment
- SOCIAL / BLOG
- Daily Mission / Content / Feedback
- AI provider / prompt / generation log
- LINE Login / LINE Push / Webhook
- Job table / worker / scheduler
- billing / plan enforcement
- legacy Blog mapping
- Platform Adminによるtenant横断操作

## 4. Architecture Rules

1. UserとBunshinを同一entityにしない。
2. Bunshinは必ず1つのWorkspaceとownerUserに所属する。
3. ownerUserは対象WorkspaceのACTIVE memberでなければならない。
4. repository queryは`workspaceId`を必須にし、ID単独取得を公開しない。
5. 存在と権限不足を外部へ区別して返さず、どちらも`NOT_FOUND`とする。
6. Platform Adminへ暗黙のWorkspace/Bunshinアクセスを付与しない。
7. provider、Next.js、Prismaの型をdomainへ入れない。
8. archive済みBunshinは通常一覧・更新対象から除外する。
9. Objective、Audience、PersonalityはBunshin間で共有しない。
10. Phase 2以降のfieldを先回りしてnullable columnとして追加しない。

## 5. Domain Model

### Bunshin

```text
id
workspaceId
ownerUserId
name
slug
type: COPY | EXPERT | BRAND | CHARACTER
status: DRAFT | ACTIVE | PAUSED | ARCHIVED
objectiveSummary
audienceSummary
personalitySummary
avatarUrl nullable
createdAt
updatedAt
archivedAt nullable
```

Rules:

- `name`: trim後1〜100文字
- `slug`: lowercase ASCII、数字、hyphen、1〜80文字
- 一意制約: `workspaceId + slug`
- `objectiveSummary`、`audienceSummary`、`personalitySummary`: trim後1〜500文字
- 作成時statusは`DRAFT`
- archiveは`ARCHIVED`と`archivedAt`を同時設定する
- archived entityを通常updateで復元しない。復元は将来の明示use caseとする

### BunshinObjective

```text
id
bunshinId
objectiveType
primaryGoal
kpiName nullable
kpiTarget nullable
kpiPeriod nullable
priority
status: ACTIVE | INACTIVE
createdAt
updatedAt
```

- Bunshin : Objective = 1 : N
- `priority`は正整数
- 同一Bunshin内のpriorityをuniqueにする
- Slice 2.1ではKPI計算を実装しない

### BunshinAudience

```text
id
bunshinId
label
ageRange nullable
occupation nullable
experienceLevel nullable
painPoints Json
desires Json
excludedAudience Json
notes nullable
createdAt
updatedAt
```

- Bunshin : Audience = 1 : N
- JSON fieldは文字列配列としてapplication validationする
- JSONへprovider responseや任意の巨大objectを保存しない

### BunshinPersonality

```text
id
bunshinId unique
tone
formality
energyLevel
expertiseLevel
sentenceStyle
firstPerson
forbiddenExpressions Json
preferredExpressions Json
visualDirection nullable
facePolicy: FACE_OK | FACE_NG_VOICE_OK | FACE_VOICE_NG | FULL_ANONYMOUS
createdAt
updatedAt
```

- Bunshin : Personality = 1 : 0..1
- JSON fieldは文字列配列としてapplication validationする
- Slice 2.1では生成promptへ接続しない

## 6. Referential Integrity

Prismaだけで表現できないowner membership整合性はapplication transactionで検証する。

必須DB制約:

- Bunshin FK → Workspace: `ON DELETE RESTRICT`
- Bunshin FK → User: `ON DELETE RESTRICT`
- Objective/Audience/Personality FK → Bunshin: `ON DELETE CASCADE`
- unique `(workspace_id, slug)`
- unique `(bunshin_id, priority)` for Objective
- unique `bunshin_id` for Personality
- index `(workspace_id, status, updated_at)`
- index `(owner_user_id, status)`

Workspace/Userを削除した結果Bunshinが暗黙削除されてはいけない。既存User削除方式はstatus変更であり、物理削除を導入しない。

## 7. Application Ports and Use Cases

### Repository port

```ts
interface BunshinRepository {
  create(input: CreateBunshinRecord): Promise<BunshinAggregate>;
  list(input: { workspaceId: string; actorUserId: string }): Promise<BunshinSummary[]>;
  find(input: {
    workspaceId: string;
    actorUserId: string;
    bunshinId: string;
  }): Promise<BunshinAggregate | null>;
  update(input: UpdateBunshinRecord): Promise<BunshinAggregate | null>;
  archive(input: ScopedBunshinReference): Promise<BunshinAggregate | null>;
}
```

Prisma adapterは、すべてのqueryへ次を含める。

```text
workspaceId = requested workspace
workspace.memberships has ACTIVE actorUserId
status != ARCHIVED（通常操作）
```

### Use cases

- `CreateBunshin`
- `ListBunshins`
- `GetBunshin`
- `UpdateBunshinProfile`
- `ArchiveBunshin`

`CreateBunshin`は1 transactionで次を実行する。

1. actorがWorkspaceのACTIVE memberであることを確認
2. ownerUserが同一WorkspaceのACTIVE memberであることを確認
3. BunshinをDRAFTで作成
4. 初期Objective/Audience/Personalityを入力がある範囲で作成
5. aggregateを返す

## 8. Authorization Policy

| Operation                        | OWNER | ADMIN | MEMBER |
| -------------------------------- | ----- | ----- | ------ |
| Create Bunshin                   | allow | allow | allow  |
| List / Get                       | allow | allow | allow  |
| Update own Bunshin               | allow | allow | allow  |
| Update another member's Bunshin  | allow | allow | deny   |
| Archive own Bunshin              | allow | allow | allow  |
| Archive another member's Bunshin | allow | allow | deny   |

ここでのOWNERはWorkspace roleであり、Bunshin ownerUserIdとは別概念である。

初期PERSONAL Workspaceでは通常1 memberだが、将来のORGANIZATIONを壊さないpolicyとして定義する。

## 9. Authentication Gate

Productionには`AuthProvider`と`CurrentUserProvider`のcontractしかなく、実sessionは未実装である。

したがって実装を2 PRに分ける。

### PR 2.1-A: Core Persistence

- domain
- application use cases / ports
- Prisma schema / migration / repository
- unit / PostgreSQL integration tests
- HTTP request/response schema
- API handlerのframework非依存function

Production routeは公開しない。任意のheader、query、cookieからUser IDを信頼するmock認証は禁止する。

### PR 2.1-B: Authenticated HTTP and UI

- 承認済みapplication session
- `CurrentUserProvider` adapter
- Route Handler
- Bunshin Wizard / List / Summary
- CSRF、cookie、session expiry、logout

PR 2.1-Bは認証方式を別指示書またはADRで承認後に開始する。

## 10. HTTP Contract

認証導入後のcontract:

```text
POST   /api/workspaces/:workspaceId/bunshins
GET    /api/workspaces/:workspaceId/bunshins
GET    /api/workspaces/:workspaceId/bunshins/:bunshinId
PATCH  /api/workspaces/:workspaceId/bunshins/:bunshinId
POST   /api/workspaces/:workspaceId/bunshins/:bunshinId/archive
```

- actorUserIdをrequest body/query/pathから受け取らない
- actorはserver-side sessionから解決する
- inputはZodでvalidationする
- responseにPrisma rowやinternal errorを直接返さない
- archiveにDELETE methodを使わず、状態遷移を明示する

## 11. UI Scope

PR 2.1-Bで次だけを実装する。

- `/bunshins`: Bunshin一覧
- `/bunshins/new`: mobile-first Wizard
- `/bunshins/:bunshinId`: Summary / Edit

Wizard step:

1. Name / Type
2. Objective
3. Audience
4. Personality / Face Policy
5. Summary / Create

Today、Mission、SOCIAL、Knowledge、Memory画面は作らない。

## 12. Tests

### Unit

- name/slug/summary validation
- slug normalization policy
- status transition
- role別update/archive policy
- ownerとactorの分離
- archive済みentityの通常操作拒否

### PostgreSQL Integration

最低限次を自動化する。

1. 1 Userが同一Workspaceに複数Bunshinを作成できる
2. 同一Workspace内でslugが重複しない
3. 別Workspaceでは同じslugを使用できる
4. User AがUser BのWorkspaceのBunshinをlist/get/update/archiveできない
5. Workspace memberでないUserをownerに指定できない
6. MEMBERが他member所有Bunshinをupdate/archiveできない
7. Workspace OWNER/ADMINはmember所有Bunshinを管理できる
8. Platform AdminにBunshinアクセスを暗黙付与しない
9. Objective/Audience/Personalityが別Bunshinへ混入しない
10. archive後に通常list/getへ出ない

### Migration

- 空のPostgreSQL 16へ全migrationを適用
- Phase 1 schemaへ追加migrationを適用
- `prisma migrate status`がup to date
- 既存5 tableを破壊・renameしない

## 13. Migration and Rollout

Migration名案:

```text
20260818xxxxxx_bunshin_identity
```

Production手順:

1. PR CIで空DB migrationとintegration test
2. schema diff review
3. `main` merge
4. Production backup状態を確認
5. `Production Database Migration`を承認付きで実行
6. migration statusを確認
7. Core persistenceのみではVercel routeを公開しない
8. PR 2.1-B後にAPI/UI smoke test

Rollbackは原則forward fixとする。データ作成前にmigration自体が失敗した場合のみ、Supabase restoreまたは手動修復を承認付きで実施する。

## 14. Observability and Security

- logへname、objective、audience等の本文を出さない
- log fieldはrequestId、workspaceId、bunshinId、operation、status、latencyに限定する
- authorization failureをNOT_FOUNDとして扱う
- DB URL、session、cookie、tokenをlogへ出さない
- API公開前にrate limit方針を決める
- Platform Admin overrideは実装しない
- PreviewへProduction DBを接続しない

## 15. Completion Gate

PR 2.1-A完了条件:

- [ ] domainがframework/Prisma/provider非依存
- [ ] application use caseがrepository portに依存
- [ ] migrationとrepositoryがWorkspace scopeを強制
- [ ] unit/integration testが全件成功
- [ ] Cross-user isolation testが成功
- [ ] production routeが未公開
- [ ] typecheck / lint / test / build / auditが成功
- [ ] implementation reportを作成

PR 2.1-B開始条件:

- [ ] 認証/session ADRがAccepted
- [ ] CurrentUserProvider adapterがsecurity review済み
- [ ] Cookie / CSRF / expiry / logout方針が確定
- [ ] API rate limit方針が確定

## 16. 今回レビューで決めること

- [ ] PR 2.1-AをCore Persistenceに限定する
- [ ] slug一意制約を`workspaceId + slug`とする
- [ ] archiveを標準削除動作とする
- [ ] Objective/Audienceは1:N、Personalityは0..1とする
- [ ] role別authorization matrixを採用する
- [ ] Production API/UIは認証ADR後のPR 2.1-Bまで公開しない
- [ ] Stagingは実運用開始前まで作成しない

## 17. 人間の承認後にCodexへ与える指示

```text
docs/PHASE2_SLICE_2_1_IMPLEMENTATION_INSTRUCTION.md を正本として、
Phase 2 Slice 2.1-A Core Persistenceだけを実装してください。

認証、Production API、UI、Owner Knowledge、Memory、Capability、SOCIAL、AI、LINE、BLOG、Jobは実装しないでください。

migrationとCross-user isolationを含む自動テストを追加し、Draft PRを作成してください。
```
