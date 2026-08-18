# Phase 2 Slice 2.2-B Authenticated Knowledge API / UI 実装指示書

## 1. 状態

実装前レビュー用。本文書とD-017が承認されるまでAPI/UI実装を開始しない。

## 2. 目的

Slice 2.2-AのOwner Knowledge / Grant Core Persistenceを、Slice 2.1-Bで確立したverified sessionへ接続する。User本人がKnowledgeを管理し、管理可能なBunshinへ明示的にgrant/revokeできる最小のHTTP/UIを提供する。

## 3. 対象範囲

- authenticated Owner Knowledge API
- authenticated Bunshin Knowledge Grant API
- Knowledge一覧、作成、編集、archive UI
- Bunshin詳細内のKnowledge grant/revoke UI
- `CurrentUserProvider`、same-origin、JSON Content-Type、`no-store`、共通error mappingの再利用
- HTTP contract test、認可test、最小browser smoke test

## 4. HTTP surface

```text
GET    /api/workspaces/:workspaceId/knowledge
POST   /api/workspaces/:workspaceId/knowledge
GET    /api/workspaces/:workspaceId/knowledge/:knowledgeId
PATCH  /api/workspaces/:workspaceId/knowledge/:knowledgeId
POST   /api/workspaces/:workspaceId/knowledge/:knowledgeId/archive

GET    /api/workspaces/:workspaceId/bunshins/:bunshinId/knowledge
POST   /api/workspaces/:workspaceId/bunshins/:bunshinId/knowledge/:knowledgeId/grant
POST   /api/workspaces/:workspaceId/bunshins/:bunshinId/knowledge/:knowledgeId/revoke
```

actor、owner、grant実行者をrequest body、query、path、任意headerから受け取らない。すべてverified session userから解決する。

## 5. UI surface

- `/knowledge`: 本人所有Knowledgeの一覧
- `/knowledge/new`: MANUAL Knowledge作成
- `/knowledge/:knowledgeId`: Summary / Edit / Archive
- `/bunshins/:bunshinId`: 既存画面へ「利用するKnowledge」セクションだけを追加

Bunshin画面では次を区別して表示する。

- 利用中: ACTIVE GrantがあるACTIVE Knowledge
- 追加可能: actor本人が同一Workspaceで所有するACTIVE Knowledgeのうち未grantのもの

他User所有Knowledgeは候補に表示しない。ファイルupload、import、AI入力補助、検索、タグ、フォルダーは追加しない。

## 6. 入力制約

- type: `PROFILE | EXPERIENCE | SKILL | PRODUCT | FAQ | CASE | ASSET | OTHER`
- title: trim後1..160文字
- content: trim後1..20000文字
- sourceTypeはrequestで受け取らず`MANUAL`固定
- unknown fieldを拒否する
- mutationはsame-originかつ`application/json`だけを許可する
- archive/grant/revokeも空JSON objectを要求する

## 7. 認可・情報漏えい防止

- 未認証は`UNAUTHENTICATED`
- cross-user、cross-workspace、管理不可Bunshin、archive済み対象は`NOT_FOUND`
- Knowledge CRUDはactor本人所有だけ
- grant/revokeは既存`canManageBunshin` policyを再利用する
- Platform Admin overrideを追加しない
- grant不在時は空配列を返し、Workspace全Knowledgeへfallbackしない
- responseとlogへemail、token、cookie、Supabase response、Knowledge本文を記録しない
- API responseは`cache-control: no-store`

## 8. Response DTO

Knowledge APIは永続化modelをそのまま返さず、次のDTOへ変換する。

```text
OwnerKnowledgeDto:
  id, workspaceId, type, title, content, sourceType, status,
  archivedAt, createdAt, updatedAt

KnowledgeSummaryDto:
  id, type, title, updatedAt

KnowledgeGrantDto:
  id, bunshinId, ownerKnowledgeId, status, grantedAt, revokedAt
```

`ownerUserId`、`grantedByUserId`は通常UIに不要なため公開DTOから除外する。

## 9. 必須テスト

1. request supplied actor/owner/grantedBy fieldを拒否する
2. 未認証sessionを拒否する
3. User AがUser BのKnowledgeを取得・更新・archiveできない
4. grantなしではBunshin Knowledge APIが空配列を返す
5. 別WorkspaceのKnowledge/Bunshinをgrantできない
6. MEMBER/ADMIN/OWNER/Bunshin owner policyがCoreと一致する
7. revoke後に通常取得とUIから消える
8. archive後に通常一覧とgrant候補から消える
9. Origin不一致とContent-Type不正を拒否する
10. error response/logへKnowledge本文、email、tokenを出さない
11. logout後にprotected API/UIへアクセスできない
12. mobile viewportで作成、編集、grant、revokeが操作できる

## 10. Production gate

実装PRはDraftで開始する。Production公開前に次を確認する。

- Slice 2.1-BのSupabase Auth Site URL / redirect allowlist / SMTP設定が完了
- Production Supabase migration適用前のbackup/rollback確認
- Vercel PreviewにProduction DB/Auth credentialがない
- HTTP contract、PostgreSQL integration、browser smoke、human security reviewが成功

## 11. 完了条件

- 本指示書とD-017が承認済み
- actorがverified sessionだけから解決される
- default DENYとtenant isolationがHTTP/UIでも維持される
- lint、typecheck、unit、HTTP contract、integration、buildが成功する
- implementation reportを作成する
- AI、embedding、RAG、import、file upload、Memory、Capability、SOCIAL、LINE、BLOG、Jobを実装しない

## 12. 承認事項

- [ ] Knowledge API/UIは本人所有Knowledgeだけを扱う
- [ ] Bunshin画面へ最小grant/revokeセクションだけを追加する
- [ ] 公開DTOから`ownerUserId`と`grantedByUserId`を除外する
- [ ] archive/grant/revokeを含むmutationはJSONとsame-originを必須にする
- [ ] Production設定確認まではDraft扱いとする
