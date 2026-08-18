# Phase 2 Slice 2.3 Bunshin Memory 実装指示書

## 1. 状態

実装前レビュー用。本文書とD-018が承認されるまでDB・API・UI実装を開始しない。

## 2. 目的

Bunshin固有のMemoryを、他Bunshin・他Workspaceへ暗黙共有されないCore dataとして実装する。UserがMemoryを表示、作成、編集、無効化、削除できる最小機能を提供する。

## 3. 絶対境界

- Memoryは必ず1つのBunshinに所属する
- repository queryは常に`workspaceId + bunshinId`でscopeする
- actorはverified sessionからだけ解決する
- Bunshin AのMemoryをBunshin Bの取得結果へ含めない
- inactiveまたはdeleted Memoryを通常取得・将来のcontext取得へ含めない
- Workspace/User境界を越える存在確認結果は`NOT_FOUND`へ統一する
- Platform Admin overrideを実装しない

## 4. 対象model

```text
BunshinMemory
  id
  workspaceId
  bunshinId
  type: BELIEF | EXPERIENCE | KNOWLEDGE | STORY | FAQ | OPINION | PREFERENCE | PERFORMANCE_INSIGHT
  content: 1..20000文字
  summary nullable: 最大1000文字
  sourceType: USER_INPUT | MISSION_FEEDBACK | PERFORMANCE | IMPORT | SYSTEM
  sourceId nullable: 最大255文字
  confidence: Decimal(4,3)、0.000..1.000
  importance: Int、1..5
  active: Boolean
  deletedAt nullable
  createdAt
  updatedAt
```

`workspaceId`はBunshinから導出可能だが、tenant scopeの明示、索引、誤結合防止のため冗長保持する。作成時にBunshinのWorkspaceと一致する値だけをrepositoryが設定する。

## 5. embeddingの扱い

上位仕様とreadiness planには`embedding vector nullable`がある。一方、現在はembedding生成、provider、次元数、距離関数、index方式が未決定であり、Phase 1/2の「未使用fieldを先回りしない」方針と緊張する。

本Sliceではembedding columnを追加しないことを推奨する。Phase 6でprovider、model、次元数、再生成・移行方針をADR承認したmigrationとして追加する。domainにもembedding provider型を入れない。

代替案としてnullable `Unsupported("vector")` columnを先行追加できるが、次元数とindexを決められず、Prisma migration・testが不完全になるため採用しない。

## 6. sourceType制限

本Sliceの作成API/UIで受け付ける`sourceType`は`USER_INPUT`だけとする。`MISSION_FEEDBACK`、`PERFORMANCE`、`IMPORT`、`SYSTEM`は将来のapplication adapter向けenum値として保持するが、requestから指定できない。

`sourceId`は本Sliceでは常にnullとする。

## 7. 削除・無効化

- 無効化: `active=false`。再有効化を許可する
- 削除: 物理削除せず`deletedAt`を設定し、`active=false`にする
- 通常list/getは`active=true AND deletedAt IS NULL`だけを返す
- 管理画面の無効Memory一覧は`active=false AND deletedAt IS NULL`を明示指定した場合だけ返す
- deleted Memoryの復元は本Sliceでは提供しない
- Bunshin archive後はMemoryの作成・更新・状態変更を拒否する

削除をsoft deleteとする理由は、将来のAI入力・Mission feedbackの監査可能性を失わないためである。削除済み本文の保持期間・匿名化は個人情報運用方針を定めるPhaseで再検討する。

## 8. 認可

- read: active Workspace Memberで、対象Bunshinへアクセス可能
- create/update/activate/deactivate/delete: 既存`canManageBunshin` policyを再利用
- OWNER/ADMINはWorkspace内Bunshinを管理可能
- MEMBERは自分がownerのBunshinだけ管理可能
- request由来の`workspaceId`と`bunshinId`はscope指定であり、actor/ownerの証明には使わない
- request bodyの`ownerUserId`、`actorUserId`、`sourceType`、`sourceId`、`active`、`deletedAt`を拒否する

## 9. Application / Repository

```text
BunshinMemoryRepository
  create
  list
  find
  update
  setActive
  softDelete

CreateBunshinMemory
ListBunshinMemories
GetBunshinMemory
UpdateBunshinMemory
ActivateBunshinMemory
DeactivateBunshinMemory
DeleteBunshinMemory
```

Core Persistenceと認証済みHTTP/UIは2つのPRへ分ける。

### PR 2.3-A: Core Persistence

- domain型、application port/use case
- Prisma model、migration、repository
- default query、validation、unit/PostgreSQL integration test
- API/UIなし

### PR 2.3-B: Authenticated HTTP / Minimal UI

- Bunshin配下のMemory API
- Bunshin詳細内のMemory一覧・作成・編集・有効/無効・削除UI
- verified session、same-origin、JSON、no-store、DTO

2.3-Aのマージ後に別指示書で確定する。

## 10. 2.3-A 必須テスト

1. Bunshin AのMemoryがBunshin Bのlist/findに含まれない
2. User AがUser BのWorkspace/Bunshin Memoryへアクセスできない
3. `workspaceId`とBunshinのWorkspace不一致を拒否する
4. inactive Memoryを通常listから除外する
5. deleted Memoryをすべての通常取得から除外する
6. MEMBER/ADMIN/OWNER/Bunshin owner policyが既存方針と一致する
7. archived Bunshinへの作成・更新・状態変更を拒否する
8. confidenceの範囲外、importanceの範囲外、空contentを拒否する
9. request/applicationの作成入力でUSER_INPUT以外を許可しない
10. soft deleteで`active=false`と`deletedAt`が同一更新になる

## 11. 対象外

- Memory Extractor、AI分類、要約生成
- embedding、pgvector、類似検索、重複判定、RAG
- 音声入力、質問フロー、Mission feedback連携
- Owner Knowledgeとの自動統合
- Capability、SOCIAL、LINE、BLOG、Job
- Bunshin間のMemoryコピー・共有

## 12. 完了条件

- 本指示書とD-018が承認済み
- 2.3-AはCore Persistenceだけを実装する
- migrationとrollback方針がある
- Cross Bunshin / Cross Workspace isolationをPostgreSQL integration testで実証する
- lint、typecheck、unit、integration、buildが成功する
- implementation reportを作成する

## 13. 承認事項

- [ ] `workspaceId`をMemoryへ冗長保持し、全queryを`workspaceId + bunshinId`でscopeする
- [ ] embedding columnはPhase 6のADRまで追加しない
- [ ] 削除はsoft deleteとし、復元UIは実装しない
- [ ] 作成経路は`USER_INPUT`だけに限定する
- [ ] 2.3-A Core Persistenceと2.3-B API/UIを別PRにする
