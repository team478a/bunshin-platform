# Phase 2 Slice 2.4 Capability Assignment 実装指示書

## 1. 状態

実装前レビュー用。本文書とD-020が承認されるまでDB・API・UI実装を開始しない。

## 2. 目的

BunshinへCapabilityを明示的に割り当て、状態をCoreで管理する。未割当、停止中、LOCKEDのCapability実行要求をapplication serviceで拒否できる境界を確立する。

Phase 2ではCapability固有handler、Provider接続、投稿、配信、生成処理を実装しない。

## 3. 絶対境界

- Assignmentは必ず1つのWorkspaceと1つのBunshinに所属する
- queryは常に`workspaceId + bunshinId`でscopeする
- CapabilityをBunshin本体のboolean fieldへ直書きしない
- actorはverified sessionからだけ解決する
- Bunshin AのAssignmentをBunshin Bの実行許可として利用しない
- 未割当、`SUSPENDED`、`LOCKED`をapplication serviceで拒否する
- Platform Admin overrideを実装しない
- Capability固有config validation、SDK型、Provider responseをCoreへ混ぜない

## 4. 対象model

```text
BunshinCapabilityAssignment
  id
  workspaceId
  bunshinId
  capabilityType
  status: ACTIVE | SUSPENDED | LOCKED
  config Json（Phase 2では常に空object）
  assignedByUserId
  activatedAt
  createdAt
  updatedAt
```

`workspaceId + bunshinId + capabilityType`をuniqueとする。`workspaceId`はtenant scopeの明示と誤結合防止のため冗長保持し、repositoryがBunshinのWorkspaceと一致する値だけを設定する。

`CapabilityType`は既存`@bunshin/capability-contract`を正本とする。Prisma enumは同じ値を保持し、domain/application境界で変換する。

## 5. Capability種別

Core Persistenceは既存contractの全種別を保存可能にする。

```text
SOCIAL
BLOG
LINE_MARKETING
LP
LEAD_GENERATION
SALES
CUSTOMER_SUPPORT
```

ただしPhase 2のProduction API/UIから新規割当できる種別は`SOCIAL`だけとする。他種別は各Capabilityの実装・運用Gateが承認されるまで公開入力として受け付けない。

## 6. 状態遷移

```text
未割当 --assign--> ACTIVE
ACTIVE --suspend--> SUSPENDED
SUSPENDED --activate--> ACTIVE
ACTIVE/SUSPENDED --system lock（将来）--> LOCKED
```

- `assign`は未割当時にrowを作成し、既存`SUSPENDED`時は同一rowを`ACTIVE`へ戻す
- 既に`ACTIVE`へのassign/activateは冪等に同じAssignmentを返す
- `suspend`は`ACTIVE`だけを`SUSPENDED`へ変更する。既に`SUSPENDED`なら冪等に返す
- `LOCKED`への変更・解除API/UIはPhase 2で提供しない
- `LOCKED`に対するassign/activate/suspendは`CONFLICT`
- 物理削除とunassignは提供せず、利用停止は`SUSPENDED`で保持する
- archived Bunshinへの作成・状態変更を拒否する

## 7. config

DBには上位仕様に従い`config Json`を保持するが、Phase 2のcreate/update input、API、UIからconfigを受け取らない。作成時は常に空objectとする。

Capability固有schemaとmigration方針は各Capability packageが所有する。Coreはconfig内容を解釈せず、Phase 2では公開DTOにも含めない。

## 8. 認可

- read: active Workspace Memberで、対象Bunshinへアクセス可能
- assign/activate/suspend: 既存`canManageBunshin` policyを再利用する
- OWNER/ADMINはWorkspace内Bunshinを管理可能
- MEMBERは自分がownerのBunshinだけ管理可能
- Workspace/User/Bunshin境界を越える存在確認結果は`NOT_FOUND`へ統一する
- request bodyのactor、owner、workspaceId、bunshinId、status、config、timestampを拒否する

## 9. Application / Repository

```text
BunshinCapabilityAssignmentRepository
  assign
  list
  find
  setStatus

AssignCapabilityToBunshin
ListBunshinCapabilityAssignments
ActivateBunshinCapability
SuspendBunshinCapability
RequireActiveBunshinCapability
```

`RequireActiveBunshinCapability`は将来のCapability handlerから必ず呼ぶCore guardとする。未割当またはBunshin/Workspace境界外は`NOT_FOUND`、`SUSPENDED`または`LOCKED`は`FORBIDDEN`とする。実行routeやhandler自体はPhase 2で作らない。

## 10. PR分割

### Slice 2.4-A: Core Persistence

- domain型、application port/use case/guard
- Prisma model、enum、migration、repository
- Workspace/Bunshin scope、状態遷移、unit/PostgreSQL integration test
- API/UIなし

### Slice 2.4-B: Authenticated HTTP / Minimal UI

- Bunshin配下のAssignment list/assign/activate/suspend API
- Bunshin詳細内のSOCIAL割当・有効化・停止UI
- verified session、same-origin、JSON、no-store、DTO
- Capability handler、SOCIAL profile、投稿機能なし

2.4-Aのマージ後に2.4-BのHTTP contractを別指示書で確定する。

## 11. 2.4-A 必須テスト

1. 未割当Capabilityを`RequireActiveBunshinCapability`が拒否する
2. `SUSPENDED`と`LOCKED`を実行不可として拒否する
3. `ACTIVE`だけを実行可能として返す
4. Bunshin AのAssignmentをBunshin Bから取得・利用できない
5. User AがUser BのWorkspace/Bunshin Assignmentを参照・変更できない
6. `workspaceId`とBunshinのWorkspace不一致を拒否する
7. MEMBER/ADMIN/OWNER/Bunshin owner policyが既存方針と一致する
8. archived Bunshinへのassign/activate/suspendを拒否する
9. 同一Bunshin/Capabilityの重複rowをDB unique制約で防ぐ
10. assign/activate/suspendの冪等性を確認する
11. `LOCKED`を通常管理操作で変更できない
12. configが空objectで作成され、application inputから指定できない

## 12. 対象外

- SOCIAL/BLOG/LINE等のhandlerと固有table
- 投稿作成、投稿実行、配信、Provider接続
- AI生成、embedding、RAG
- Mission、Feedback、Performance
- Job table、worker、scheduler、retry
- Plan、課金、entitlement、LOCKED操作
- Capability削除、unassign、履歴table
- Capability固有config編集

## 13. 完了条件

- 本指示書とD-020が承認済み
- 2.4-AはCore Persistenceとexecution guardだけを実装する
- migrationとrollback方針がある
- Cross Bunshin / Cross Workspace isolationと状態遷移をPostgreSQL integration testで実証する
- lint、typecheck、unit、integration、buildが成功する
- implementation reportを作成する

## 14. 承認事項

- [ ] Assignmentは`workspaceId + bunshinId + capabilityType`で一意とする
- [ ] 状態は`ACTIVE | SUSPENDED | LOCKED`とし、削除/unassignを提供しない
- [ ] Phase 2のAPI/UIで新規割当できる種別は`SOCIAL`だけとする
- [ ] configはDBへ空objectで保持するが、Phase 2のinput/DTOへ公開しない
- [ ] `RequireActiveBunshinCapability`を将来handler実行前の必須guardとする
- [ ] 2.4-A Core Persistenceと2.4-B API/UIを別PRにする
