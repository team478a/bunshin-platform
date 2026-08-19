# Phase 3 Slice 3.2 Content Pillar 実装指示書

## 1. 状態

実装前レビュー用。本文書とD-024が承認されるまでschema、migration、API、UIを実装しない。

## 2. 目的

Bunshinが継続して発信するテーマを、SOCIAL Capability固有のContent Pillarとして保持する。Userがテーマ、説明、相対weight、active状態を手動管理でき、後続Weekly Planが安定したIDで参照できる基礎を作る。

AIによる5〜10件生成、投稿案生成、Weekly Plan、Missionは開始しない。

## 3. PR分割

### Slice 3.2-A: Core Persistence

- `@bunshin/capability-social`へContent Pillar domain型、validation、repository port、use caseを追加
- Prisma model、migration、repository adapter
- ACTIVE SOCIAL Capability guardとの接続
- unit / PostgreSQL integration test
- API/UIなし

### Slice 3.2-B: Authenticated API / Minimal UI

- authenticated list/create/update/activate/deactivate/delete API
- 既存Bunshin詳細内の最小Content Pillar UI
- HTTP contract、認可、mobile browser smoke
- AI、Weekly Plan、Missionなし

3.2-Aをreview/mergeした後、3.2-BのHTTP contractを別指示書で承認する。

## 4. Package境界

- Content Pillar型、validation、port、use caseは`@bunshin/capability-social`が所有する
- Core/applicationは`capability-social`へ依存しない
- databaseはrepository adapterを提供する
- webは後続3.2-BでHTTP/UI adapterとしてuse caseを呼ぶ
- AI/Provider/LINE/Job SDKを追加しない

## 5. 対象model

```text
ContentPillar
  id
  workspaceId
  bunshinId
  title
  description nullable
  weight
  active
  deletedAt nullable
  createdAt
  updatedAt
```

- `id`はUUIDとし、後続Weekly Planから参照できる安定識別子にする
- `(workspaceId, bunshinId, title)`をuniqueとする
- `workspaceId + bunshinId`が同じBunshinを参照する複合FKを使う
- Workspace/Bunshin FKは`ON DELETE RESTRICT`
- deleted rowのtitle再利用は許可しない。復元はこのSliceで提供しない

## 6. 入力制約

- title: trim後1..100文字
- description: 未指定またはtrim後1..500文字。空文字はnull
- weight: integer 1..100
- create時activeはtrue
- updateはtitle、description、weightの1項目以上
- actorUserId、workspaceId、bunshinId、id、active、deletedAt、timestampをbody相当inputへ含めない
- unknown fieldを拒否する
- weightは相対優先度であり、Bunshin内合計100を要求しない
- 作成件数上限とAI向け「5〜10件」は同一概念にしない。3.2では固定上限を設けない

## 7. 状態と操作

```text
未作成 --create--> active=true
active=true --deactivate--> active=false
active=false --activate--> active=true
active true/false --update--> active維持
active true/false --delete--> active=false, deletedAt設定
```

- activate/deactivate/deleteは冪等にする
- deleteはsoft deleteとし、物理削除しない
- deleted rowは通常list/findから除外し、update/activate/deactivate対象にしない
- restore API/use caseは提供しない
- title変更で同一Bunshin内の既存titleと衝突した場合は`CONFLICT`

## 8. Capability guard

- read: active Workspace Memberかつ対象Bunshinへアクセス可能なら許可する
- create/update/activate/deactivate/delete: 既存Bunshin管理policyに加え、SOCIAL AssignmentがACTIVEであることを必須にする
- SOCIAL未割当は`NOT_FOUND`
- SUSPENDED/LOCKEDは`FORBIDDEN`
- archived Bunshinへの全操作を拒否する
- Platform Admin overrideを追加しない
- Assignment停止後もPillar rowを削除せず、readを許可する

## 9. Repository / Use Case

```text
ContentPillarRepository
  create
  list
  find
  update
  setActive
  softDelete

CreateContentPillar
ListContentPillars
GetContentPillar
UpdateContentPillar
ActivateContentPillar
DeactivateContentPillar
DeleteContentPillar
```

全repository methodは`workspaceId + actorUserId + bunshinId`を必須とする。mutation/findはさらにpillarIdを必須とし、裸のIDだけで操作しない。

listは既定で非deletedのactive/inactive両方を返し、`createdAt ASC, id ASC`で安定sortする。activeだけの選択は後続Weekly Plan use case側で明示する。

## 10. 必須DB制約

- `(workspaceId, bunshinId, title)` unique
- `(workspaceId, bunshinId)`の複合Bunshin FK
- title `VARCHAR(100)`、description `VARCHAR(500)`
- weightに`CHECK (weight BETWEEN 1 AND 100)`
- active default true
- timezone付きtimestamp
- `(workspaceId, bunshinId, active, deletedAt, createdAt)` index

## 11. 3.2-A 必須テスト

1. SOCIAL未割当、SUSPENDED、LOCKEDでmutationを拒否する
2. ACTIVE SOCIAL Assignmentだけでmutationできる
3. Assignment停止後も既存Pillarをreadできる
4. cross-user、cross-workspace、cross-bunshinを拒否する
5. MEMBER/ADMIN/OWNER/Bunshin owner policyが既存方針と一致する
6. archived Bunshinへの全操作を拒否する
7. title trim、空、101文字を検証する
8. description空文字をnull化し、501文字を拒否する
9. weightの小数、0、101を拒否し、1と100を許可する
10. 同一Bunshin/title重複をDB uniqueで拒否し、別Bunshin/Workspaceでは許可する
11. updateでactive状態を変えず、pillarId/titleを越境に利用できない
12. activate/deactivate/deleteが冪等である
13. soft delete後はlist/find/update/state変更から見えない
14. DB CHECKと複合FKがapplication bypass時も不正値/Workspace不一致を拒否する
15. list順序が安定している

## 12. Migration / Rollback

- 既存Social Profile migrationの後へ追加する
- CIで空PostgreSQLへ全migrationを適用する
- Productionへ自動適用しない
- rollback時はWeekly Plan等の参照が未導入であることとデータ退避を確認し、table/index/checkを削除するforward-fix migrationを作る
- 適用済みmigrationを編集しない

## 13. 対象外

- AIによるPillar生成、推奨、並べ替え、類似判定
- Pillar件数を5〜10件へ強制する処理
- Weekly Plan、Daily Mission、Mission Content、Feedback、Post Record
- SNS OAuth、投稿、metrics、Provider SDK
- LINE、BLOG、Job、worker、scheduler
- drag-and-drop、bulk編集、restore、物理削除

## 14. 完了条件

- 本指示書とD-024が承認済み
- 3.2-AはContent Pillar Core Persistenceだけを実装する
- tenant/Bunshin/Capability境界をPostgreSQL integration testで実証する
- lint、format、typecheck、unit、integration、buildが成功する
- implementation reportを作成し、対象外機能を実装しない

## 15. 承認事項

- [ ] 3.2-A Core Persistenceと3.2-B API/UIを別PRにする
- [ ] Content Pillarは安定したUUIDを持つresourceとする
- [ ] titleをBunshin内で一意とし、deleted後も再利用しない
- [ ] weightは1..100の相対値とし、合計100を要求しない
- [ ] deleteはsoft deleteとし、restoreは提供しない
- [ ] listはactive/inactiveを返し、deletedを除外する
- [ ] mutationにACTIVE SOCIAL Assignmentを必須とする
- [ ] AI、Weekly Plan、Mission、Provider、Jobを実装しない
