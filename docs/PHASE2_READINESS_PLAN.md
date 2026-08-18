# Phase 2 Readiness Plan

## 目的

本番環境の準備を待つ間に、Phase 2「Multi-Bunshin Core」を安全に開始できる状態へ整理する。本書は設計・レビュー用であり、Phase 2の実装開始を承認するものではない。

Phase 1 Draft PRのレビュー完了までは、DB model、migration、API、UIを追加しない。

## Phase 1 Gateの現在地

| Gate           | 状態   | 根拠・残作業                                                                              |
| -------------- | ------ | ----------------------------------------------------------------------------------------- |
| ローカル検証   | 完了   | format / typecheck / lint / unit test / build / audit / PostgreSQL integration testが成功 |
| GitHub Actions | 完了   | Draft PR #1の`verify`と`database`が成功                                                   |
| 設計レビュー   | 未完了 | Draft PR #1を人間がレビューし、Phase 2開始可否を記録する                                  |
| 本番接続       | 保留可 | Phase 2 Coreのローカル実装開始条件にはしない。本番deploy条件として別管理する              |

## Phase 2の目的

1 User : N Bunshinを成立させ、各Bunshinの目的・対象・人格・知識許可・記憶・Capability割当をWorkspaceおよびBunshin単位で分離する。

SOCIAL、AI生成、LINE配信、BLOG移行はPhase 2に含めない。

## 推奨する実装スライス

### Slice 2.1: Bunshin Identity

最初に実装する縦切り。Bunshinの作成、一覧、詳細、基本情報更新、archiveを対象とする。

対象model:

- `Bunshin`
- `BunshinObjective`
- `BunshinAudience`
- `BunshinPersonality`

必須境界:

- すべてのqueryに`workspaceId`を要求する
- `ownerUserId`は対象Workspaceのmemberでなければならない
- slugの一意性は`workspaceId + slug`を推奨する
- deleteは物理削除ではなく`ARCHIVED`への状態遷移を基本とする
- UserとBunshinを同一entityとして扱わない

受入条件:

- 同一Userが複数Bunshinを作成できる
- User AはUser BのWorkspaceにあるBunshinを参照・更新できない
- Workspace memberでないUserをownerに指定できない
- Objective、Audience、PersonalityをBunshinごとに独立して変更できる
- validation、unit test、PostgreSQL integration test、migration rollback方針がある

### Slice 2.2: Owner Knowledge and Grants

対象model:

- `OwnerKnowledge`
- `BunshinKnowledgeGrant`

規則:

- KnowledgeはWorkspace/Userが所有する
- Bunshinへの利用許可はdefault DENYとする
- grantされていないKnowledgeをrepository/application serviceが返さない
- Cross WorkspaceおよびCross BunshinのgrantをDB制約とapplication validationで拒否する

受入条件:

- 同じWorkspace内でも明示grantなしではBunshinからKnowledgeを取得できない
- 別WorkspaceのKnowledgeをgrantできない
- grantの追加・失効が監査可能である

### Slice 2.3: Bunshin Memory

対象model:

- `BunshinMemory`

規則:

- Memoryは必ず1つのBunshinに所属する
- queryは`workspaceId + bunshinId`でscopeする
- 表示、編集、無効化、削除ができる設計にする
- embeddingとAI抽出はこのSliceでは実装せず、nullableな拡張点に留める

受入条件:

- Bunshin AのMemoryがBunshin Bのquery結果に含まれない
- 別User/Workspaceから参照・更新できない
- inactive Memoryは通常のcontext取得対象に含まれない

### Slice 2.4: Capability Assignment

対象model:

- `BunshinCapabilityAssignment`

規則:

- CapabilityはBunshin本体のfieldへ直書きしない
- Phase 2では割当と状態管理のみを実装する
- SOCIAL/BLOG handler、provider接続、投稿機能は実装しない

受入条件:

- 未割当Capabilityの実行要求を拒否できる
- 別Bunshinの割当を利用できない
- activate / suspend等の状態遷移がcontractと整合する

## APIとUIの最小範囲

Phase 1のNext.js Route Handlerを継続利用し、独立APIやworkerは追加しない。

最初のSliceで必要な操作:

```text
POST   /api/bunshins
GET    /api/bunshins
GET    /api/bunshins/:bunshinId
PATCH  /api/bunshins/:bunshinId
POST   /api/bunshins/:bunshinId/archive
```

認証providerが未実装の間は、productionへ到達しないtest/development専用のCurrentUserProviderを使用する。HTTP headerから任意User IDを無検証で受け取る実装は禁止する。

UIはスマートフォン優先のBunshin Wizard、一覧、Summaryに限定する。Today、Mission、SOCIAL画面は作らない。

## RLS判断

Phase 2の正本はapplication/repositoryによるWorkspace scopeとする。Supabase project未準備の現時点ではRLSを実装開始条件にしない。

ただし、本番deploy前に次をADRで再評価する。

- Prismaのpooled/direct接続とRLSの運用方法
- service roleの権限範囲
- application scopeに対する補助防御としての効果
- migrationおよびintegration testの再現性

## Platform Admin

Phase 2の一般Bunshin APIにPlatform Admin overrideを設けない。運営者による横断参照が必要になった場合は、用途、最小権限、理由入力、監査log、保持期間を別ADRで承認してから実装する。

## Phase 2で実装しないもの

- SOCIAL/BLOGのproviderまたは画面
- AI生成、embedding、prompt、generation log
- Daily Mission、Content、Feedback
- LINE Login、LINE Push、Webhook
- Job table、worker、scheduler、retry
- 課金、Plan制限の本実装
- legacy Blog mapping/migration
- 本番Supabase/Vercel設定

## Phase 2開始前に人間が確認する項目

- [ ] Draft PR #1のコード・設計レビューを完了した
- [ ] Slice 2.1を最初の実装単位とすることを承認した
- [ ] slug一意制約を`workspaceId + slug`とすることを承認した
- [ ] archiveを標準の削除動作とすることを承認した
- [ ] Phase 2ではPlatform Admin overrideを実装しないことを承認した
- [ ] RLS判断を本番deploy前のADRまで保留することを承認した

## Phase 2開始時の作業手順

1. Phase 1 Draft PRをreview・mergeする
2. 最新`main`からPhase 2用branchを作成する
3. Slice 2.1だけの実装計画とschema差分をレビューする
4. domainとapplicationのtestを先に追加する
5. migration、repository、API、最小UIの順に実装する
6. Cross User isolationをPostgreSQL integration testで確認する
7. Slice 2.1を独立PRとしてレビューし、2.2以降を混在させない
