# Phase 2 Slice 2.3-B Authenticated Memory API / UI 実装指示書

## 1. 状態

実装前レビュー用。本文書とD-019が承認されるまでAPI/UI実装を開始しない。

## 2. 目的

Slice 2.3-Aで実装したBunshin Memory Core Persistenceを、Slice 2.1-Bで確立したverified sessionへ接続する。Userが管理可能なBunshinについて、Memoryの表示、作成、編集、有効化、無効化、論理削除を行える最小のHTTP/UIを提供する。

## 3. 対象範囲

- authenticated Bunshin Memory API
- Bunshin詳細内のMemory一覧、作成、編集、有効化、無効化、論理削除UI
- `CurrentUserProvider`、same-origin、JSON Content-Type、`no-store`、共通error mappingの再利用
- HTTP contract test、認可test、最小browser smoke test
- Slice 2.3-B実装報告書

## 4. HTTP surface

```text
GET    /api/workspaces/:workspaceId/bunshins/:bunshinId/memories
POST   /api/workspaces/:workspaceId/bunshins/:bunshinId/memories
GET    /api/workspaces/:workspaceId/bunshins/:bunshinId/memories/:memoryId
PATCH  /api/workspaces/:workspaceId/bunshins/:bunshinId/memories/:memoryId
POST   /api/workspaces/:workspaceId/bunshins/:bunshinId/memories/:memoryId/activate
POST   /api/workspaces/:workspaceId/bunshins/:bunshinId/memories/:memoryId/deactivate
DELETE /api/workspaces/:workspaceId/bunshins/:bunshinId/memories/:memoryId
```

`GET .../memories`は既定でactiveかつ未削除だけを返す。管理UIに限り`?status=inactive`を許可し、inactiveかつ未削除だけを返す。`all`、deleted取得、deleted復元は提供しない。

actor、owner、source、状態、削除時刻をrequest body、任意headerから受け取らない。actorはverified session userからだけ解決する。

## 5. UI surface

既存`/bunshins/:bunshinId`へ「Memory」セクションを追加する。

- active／inactiveの表示切替
- Memory作成form
- Memory編集form
- active Memoryの無効化
- inactive Memoryの再有効化
- 論理削除（確認操作を伴う）

独立したMemory検索画面、複数Bunshin横断一覧、コピー、import、音声入力、AI補助は追加しない。スマートフォンで主要操作を完了できる構成にする。

## 6. 入力制約

- type: `BELIEF | EXPERIENCE | KNOWLEDGE | STORY | FAQ | OPINION | PREFERENCE | PERFORMANCE_INSIGHT`
- content: trim後1..20000文字
- summary: 未指定またはtrim後1..1000文字。空文字はnullへ正規化する
- confidence: 0..1
- importance: 1..5の整数
- 作成時の`sourceType`は`USER_INPUT`固定、`sourceId`はnull固定
- unknown fieldを拒否する
- request bodyの`workspaceId`、`bunshinId`、`memoryId`、`actorUserId`、`ownerUserId`、`sourceType`、`sourceId`、`active`、`deletedAt`、timestampを拒否する
- mutationはsame-originかつ`application/json`だけを許可する
- activate／deactivateは空JSON objectを要求する
- DELETEもsame-originを必須とし、bodyは受け取らない

## 7. 認可・情報漏えい防止

- 未認証は`UNAUTHENTICATED`
- cross-user、cross-workspace、cross-bunshin、管理不可Bunshin、archive済みBunshin、deleted Memoryは`NOT_FOUND`
- readはactive Workspace Memberかつ対象Bunshinへアクセス可能なUserに限る
- create／update／activate／deactivate／deleteは既存`canManageBunshin` policyを再利用する
- OWNER／ADMINはWorkspace内Bunshinを管理可能、MEMBERは自分がownerのBunshinだけ管理可能
- Platform Admin overrideを追加しない
- responseとlogへemail、token、cookie、Supabase response、Memory本文・summaryを記録しない
- API responseは成功・失敗とも`Cache-Control: no-store`

## 8. Response DTO

永続化modelを直接返さず、次のDTOへ変換する。

```text
BunshinMemoryDto:
  id, workspaceId, bunshinId, type, content, summary,
  sourceType, confidence, importance, active,
  createdAt, updatedAt
```

`sourceId`、`deletedAt`は通常UIに不要であり、監査情報の露出を避けるため公開DTOから除外する。deleted Memory自体をHTTPで取得する経路は作らない。

## 9. HTTP status

- list/get/update/status/delete成功: `200`
- create成功: `201`
- validation／Origin／Content-Type違反: 既存共通mappingに従う`400`または`403`
- 未認証: `401`
- 認可境界または対象不在: `404`
- 想定外の失敗: `500`。内部情報やMemory本文を返さない

## 10. 必須テスト

1. request supplied actor/owner/source/state/deletion fieldを拒否する
2. 未認証sessionを拒否する
3. User AがUser BのWorkspace/Bunshin Memoryを取得・変更できない
4. Bunshin AのMemoryをBunshin Bのpathから取得・変更できない
5. active listにinactive/deleted Memoryが含まれない
6. inactive listにactive/deleted Memoryが含まれない
7. activate／deactivateが既存管理policyに従う
8. delete後はactive/inactive list、get、update、status変更のすべてから見えない
9. archived Bunshinへの作成・更新・状態変更を拒否する
10. type、content、summary、confidence、importanceとunknown fieldを検証する
11. Origin不一致とContent-Type不正を拒否する
12. error response/logへMemory本文、summary、email、tokenを出さない
13. logout後にprotected API/UIへアクセスできない
14. mobile viewportで作成、編集、有効化、無効化、削除を操作できる

## 11. Production gate

実装PRはDraftで開始する。Production公開前に次を確認する。

- Slice 2.1-BのSupabase Auth Site URL／redirect allowlist／SMTP設定が有効
- Production SupabaseへSlice 2.3-A migrationを適用する前にbackup／rollback方針を確認
- Vercel PreviewにProduction DB/Auth credentialがない
- HTTP contract、PostgreSQL integration、browser smoke、human security reviewが成功

## 12. 対象外

- Memory Extractor、AI分類、AI要約
- embedding、pgvector、類似検索、重複判定、RAG
- 音声入力、質問フロー、Mission feedback／Performance連携
- Owner Knowledgeとの自動統合
- Capability、SOCIAL、LINE、BLOG、Job
- Bunshin間のMemoryコピー・共有
- deleted Memoryの一覧、復元、物理削除

## 13. 完了条件

- 本指示書とD-019が承認済み
- actorがverified sessionだけから解決される
- Workspace／Bunshin分離とsoft delete規則がHTTP/UIでも維持される
- lint、typecheck、unit、HTTP contract、integration、buildが成功する
- implementation reportを作成する
- 対象外機能を実装しない

## 14. 承認事項

- [ ] Memory UIは既存Bunshin詳細内の最小セクションとする
- [ ] 通常一覧はactiveのみ、管理用切替はinactiveのみとし、deleted取得を提供しない
- [ ] 公開DTOから`sourceId`と`deletedAt`を除外する
- [ ] mutationはsame-originを必須とし、作成・更新・状態変更はJSONだけを許可する
- [ ] deleteはsoft deleteで、復元UIを実装しない
- [ ] Production gate完了まではDraft扱いとする
