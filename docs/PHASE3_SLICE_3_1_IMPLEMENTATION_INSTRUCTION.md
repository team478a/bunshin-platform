# Phase 3 Slice 3.1 Social Profile 実装指示書

## 1. 状態

実装前レビュー用。本文書とD-022が承認されるまでschema、migration、API、UIを実装しない。

## 2. 目的

BunshinのSOCIAL発信設定をSOCIAL Capability固有domainとして保持する。MVPではSNSアカウント接続ではなく、platform、発信目的、投稿頻度、希望形式をUserが手動設定できる基礎だけを作る。

## 3. PR分割

### Slice 3.1-A: Core Persistence

- `packages/capability-social` package
- Social Profile domain型、validation、repository port、application use case
- Prisma model、enum、migration、repository
- ACTIVE SOCIAL Capability guardとの接続
- unit / PostgreSQL integration test
- API/UIなし

### Slice 3.1-B: Authenticated API / Minimal UI

- authenticated list/create/update/status API
- Bunshin詳細内の最小Social Profile UI
- HTTP contract、認可、mobile browser smoke
- Provider接続、投稿、AIなし

3.1-Aをレビュー・mergeした後、3.1-BのHTTP contractを別指示書で承認する。

## 4. Package境界

`packages/capability-social`を追加し、SOCIAL固有の型、validation、repository port、use caseを所有させる。

- Core/applicationは`capability-social`へ依存しない
- `capability-social`はCoreの公開contractとACTIVE Capability guardを利用できる
- database packageはSOCIAL repository adapterを提供できる
- webはHTTP/UI adapterとしてSOCIAL use caseを呼ぶ
- Provider SDK、AI SDK、LINE SDKをpackageへ追加しない

## 5. 対象model

```text
SocialProfile
  id
  workspaceId
  bunshinId
  platform: INSTAGRAM | TIKTOK | X | OTHER
  handle nullable
  profileUrl nullable
  purpose
  postingFrequency: DAILY | WEEKDAYS | THREE_PER_WEEK | WEEKLY | FLEXIBLE
  preferredFormats Json
  status: ACTIVE | INACTIVE
  createdAt
  updatedAt
```

`workspaceId + bunshinId + platform`をuniqueとする。1つのBunshinはplatformごとに最大1 Profileを持てる。`workspaceId`はtenant scopeと誤結合防止のため明示保持する。

Phase 3.1では外部SNS account ID、access token、refresh token、credential、Provider responseを保存しない。

## 6. Preferred Format

許可値:

```text
SLIDE
LIVE_ACTION
AI_VIDEO_PROMPT
IMAGE
```

DBではJSON arrayとして保持するが、domain/application inputでは重複なしのtyped arrayとして扱う。1〜4件を必須とし、DBから読み出した値もdomain validationを通す。`AI_VIDEO_PROMPT`は将来作る外部動画用プロンプト形式であり、動画生成を意味しない。

## 7. 入力制約

- platform: enum値のみ
- handle: 未指定またはtrim後1..100文字。空文字はnull
- profileUrl: 未指定またはHTTPS URL、最大2048文字。空文字はnull
- purpose: trim後1..500文字
- postingFrequency: enum値のみ
- preferredFormats: 1..4件、enum値のみ、重複不可
- status、workspaceId、bunshinId、actorUserId、timestampをcreate/update inputへ含めない
- create時statusは`ACTIVE`
- unknown fieldを拒否する

## 8. 状態と操作

```text
未作成 --create--> ACTIVE
ACTIVE --deactivate--> INACTIVE
INACTIVE --activate--> ACTIVE
ACTIVE/INACTIVE --update--> 同一status
```

- deleteと物理削除は提供しない
- activate/deactivateは冪等にする
- platform変更は別resourceへの変更になるためupdateで許可しない
- 同一platformへのcreateは`CONFLICT`とし、暗黙updateしない

## 9. Capability guard

- read: active Workspace Memberかつ対象Bunshinへアクセス可能なら許可する
- create/update/activate/deactivate: 既存Bunshin管理policyに加え、SOCIAL Assignmentが`ACTIVE`であることを必須にする
- SOCIAL未割当は`NOT_FOUND`
- Assignmentが`SUSPENDED`または`LOCKED`なら`FORBIDDEN`
- 別BunshinのACTIVE Assignmentを利用しない
- archived Bunshinへのすべての操作を拒否する
- Platform Admin overrideを追加しない

Profileを`INACTIVE`にしてもSOCIAL Assignment自体は変更しない。Assignment停止とProfile停止は別状態として扱う。

## 10. Repository / Use Case

```text
SocialProfileRepository
  create
  list
  findByPlatform
  update
  setActive

CreateSocialProfile
ListSocialProfiles
GetSocialProfile
UpdateSocialProfile
ActivateSocialProfile
DeactivateSocialProfile
```

Repository methodは`workspaceId + actorUserId + bunshinId`を必須とする。裸のProfile IDだけで取得・更新しない。

## 11. 必須DB制約

- `(workspaceId, bunshinId, platform)` unique
- Profileの`workspaceId + bunshinId`が同じBunshinを参照する防御
- Workspace、BunshinへのFKは`ON DELETE RESTRICT`
- enumはcontractと同じ値を保持する
- timestampはtimezone付き

Prismaで複合FKを採用する場合は、Bunshin側の対応unique/indexとmigration互換性をレビューする。採用しない場合もrepository transaction内でWorkspace一致を検証し、Cross Workspace testを必須とする。

## 12. 3.1-A 必須テスト

1. SOCIAL未割当Bunshinへのcreate/update/status変更を拒否する
2. SUSPENDEDとLOCKED Assignmentでmutationを拒否する
3. ACTIVE SOCIAL Assignmentだけでmutationできる
4. Bunshin AのProfileをBunshin Bから取得・変更できない
5. User AがUser BのWorkspace/Bunshin Profileを参照・変更できない
6. `workspaceId`とBunshinのWorkspace不一致を拒否する
7. MEMBER／ADMIN／OWNER／Bunshin owner policyが既存方針と一致する
8. archived Bunshinへのread/create/update/status変更を拒否する
9. 同一Bunshin/platformの重複rowをDB unique制約で防ぐ
10. activate/deactivateが冪等である
11. platformをupdateできない
12. preferredFormatsの空、重複、unknown値、不正DB JSONを拒否する
13. profileUrlはHTTPSだけを許可する
14. Assignment停止後もProfile rowを削除せず、再有効化後に再利用できる

## 13. Migration / Rollback

- migrationは既存5 migrationの後へ追加する
- CIで空PostgreSQLへ全migrationを適用する
- Productionへ自動適用しない
- rollbackが必要な場合はデータ退避後にProfile tableと追加enumを削除するforward-fix migrationを作成し、適用済みmigrationを編集しない

## 14. 対象外

- Content Pillar、Weekly Plan、Daily Mission、Mission Content
- Feedback、Post Record
- AI profile生成、AI投稿生成、Prompt、embedding、RAG
- SNS OAuth、access token、API投稿、metrics取得
- LINE、BLOG、Job、scheduler、worker
- 自動投稿、動画生成、Canva連携
- Social Profileの物理削除

## 15. 完了条件

- 本指示書とD-022が承認済み
- 3.1-AはSOCIAL package境界とCore Persistenceだけを実装する
- Cross Workspace / Cross Bunshin / Capability guardをPostgreSQL integration testで実証する
- lint、typecheck、unit、integration、buildが成功する
- implementation reportを作成する
- 対象外機能を実装しない

## 16. 承認事項

- [ ] Phase 3最初のSliceを手動Social Profileとする
- [ ] 3.1-A Core Persistenceと3.1-B API/UIを別PRにする
- [ ] `workspaceId + bunshinId + platform`を一意とする
- [ ] 公開platformを`INSTAGRAM | TIKTOK | X | OTHER`とする
- [ ] 投稿頻度を5つのenumで保持する
- [ ] preferredFormatsをtyped arrayとして検証し、DBではJSONで保持する
- [ ] mutationにACTIVE SOCIAL Assignmentを必須とする
- [ ] Profile状態とCapability Assignment状態を分離する
- [ ] AI、SNS Provider、Job、Missionを3.1へ含めない
