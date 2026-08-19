# Phase 3 Slice 3.2-B Authenticated Content Pillar API / Minimal UI 実装指示書

## 1. 状態

実装前レビュー用。本文書とD-025が承認されるまでAPI/UI実装を開始しない。

## 2. 目的

Slice 3.2-AのContent Pillar Core Persistenceをverified sessionへ接続し、UserがBunshinの発信テーマ、説明、相対weight、active状態を手動管理できる最小HTTP/UIを提供する。

AI生成、Weekly Plan、Mission、投稿、Provider、Jobは開始しない。

## 3. 対象範囲

- authenticated list/detail/create/update/activate/deactivate/delete API
- 既存Bunshin詳細内の最小Content Pillar UI
- verified session、same-origin、JSON Content-Type、`no-store`、共通error mappingの再利用
- HTTP contract、認可、mobile browser smoke test
- Slice 3.2-B実装報告書

## 4. HTTP surface

```text
GET    /api/workspaces/:workspaceId/bunshins/:bunshinId/content-pillars
POST   /api/workspaces/:workspaceId/bunshins/:bunshinId/content-pillars
GET    /api/workspaces/:workspaceId/bunshins/:bunshinId/content-pillars/:pillarId
PATCH  /api/workspaces/:workspaceId/bunshins/:bunshinId/content-pillars/:pillarId
DELETE /api/workspaces/:workspaceId/bunshins/:bunshinId/content-pillars/:pillarId
POST   /api/workspaces/:workspaceId/bunshins/:bunshinId/content-pillars/:pillarId/activate
POST   /api/workspaces/:workspaceId/bunshins/:bunshinId/content-pillars/:pillarId/deactivate
```

- list/detail/update/status/deleteは`200`
- createは`201`
- activate/deactivate/deleteは冪等に`200`
- pillarIdはUUIDだけを受け付ける
- DELETEはrequest bodyを受け付けない
- restore、physical delete、bulk APIは提供しない

## 5. Request body

create:

```json
{ "title": "初心者向け解説", "description": "基礎を分かりやすく伝える", "weight": 80 }
```

updateは`title | description | weight`の1項目以上。activate/deactivateはstrictな空JSON objectとする。

- strict objectとしてunknown fieldを拒否する
- actorUserId、workspaceId、bunshinId、pillarId、active、deletedAt、timestampを拒否する
- actorはverified sessionからだけ解決する
- title 1..100、description nullable/1..500、weight integer 1..100をCoreと一致させる
- mutationはsame-origin必須
- POST/PATCH/state操作は`application/json`必須

## 6. Response DTO

```text
ContentPillarDto
  id
  workspaceId
  bunshinId
  title
  description
  weight
  active
  deletedAt
  createdAt
  updatedAt
```

- 日時はISO 8601文字列、nullable日時はnullとする
- Prisma model、actor、Assignment config、credential、tokenを直接返さない
- 通常list/detailではdeleted rowを返さない
- DELETE成功responseだけは削除したresourceの`deletedAt`を返せる

## 7. 認可・Capability境界

- 未認証は`401`
- readはactive Workspace Memberかつ対象Bunshinへアクセス可能なUserのみ
- mutationは既存Bunshin管理policyとACTIVE SOCIAL Assignmentの両方を必須にする
- SOCIAL未割当は`404`、SUSPENDED/LOCKEDは`403`
- Assignment停止中もreadは許可する
- cross-user、cross-workspace、cross-bunshin、管理不可、archive済みBunshinは`404`
- MEMBERは自分がownerのBunshinだけ変更可能。OWNER/ADMINは既存policyに従う
- Platform Admin overrideを追加しない
- 全responseへ`Cache-Control: no-store`
- response/logへemail、cookie、token、credential、Assignment configを出さない

## 8. Error mapping

- validation、Content-Type、invalid UUID: `400`
- Origin違反、SUSPENDED/LOCKED: `403`
- 未認証: `401`
- 対象不在、scope/管理境界、SOCIAL未割当、deleted pillar: `404`
- title重複: `409`
- 想定外: `500`。内部情報を返さない

## 9. UI surface

既存Bunshin詳細のSocial Profile付近へ「Content Pillar」セクションを追加する。

- title、description、weight、active状態を一覧表示する
- ACTIVE SOCIALなら追加、編集、停止、再有効化、削除を提供する
- 未割当なら「先にSOCIALを割り当ててください」と表示し、操作を出さない
- SUSPENDED/LOCKEDなら既存Pillarをread-only表示し理由を示す
- weightは1..100の数値inputとし、「相対的な優先度。合計100でなくてよい」と説明する
- soft delete後は一覧から除外する
- 削除前に確認UIを出し、restore不可であることを明示する
- mobile viewportで横スクロールなしに操作できる
- drag-and-drop、bulk編集、AI生成buttonを追加しない
- 「AI生成と計画作成は後続Phase」と明示する

## 10. Client state

- 初期表示はServer ComponentからCore use caseを呼ぶ
- mutation後はAPI responseを反映し、必要に応じて`router.refresh()`する
- 二重送信中は操作を無効化する
- optimistic updateは必須にしない
- errorは秘密情報を含まない日本語メッセージで表示する
- browser storageへPillarや認証情報を保存しない

## 11. 必須テスト

1. actor、id、active、deletedAt、timestamp、unknown fieldを拒否する
2. title空/101文字、description 501文字、weight 0/小数/101を拒否する
3. invalid pillar UUIDを拒否する
4. 未認証を拒否する
5. cross-user、cross-workspace、cross-bunshinを拒否する
6. MEMBER/ADMIN/OWNER/Bunshin owner policyがCoreと一致する
7. archive済みBunshinへの全操作を拒否する
8. SOCIAL未割当、SUSPENDED、LOCKEDでmutationを拒否する
9. Assignment停止中もactive Workspace Memberはreadできる
10. title重複create/updateを`409`にする
11. activate/deactivate/deleteを冪等に`200`で返す
12. soft delete後はlist/detail/update/state操作で`404`にする
13. DTO日時がISO文字列で秘密情報を含まない
14. Origin/Content-Type違反を拒否し、DELETE bodyを拒否する
15. logout後にprotected API/UIへアクセスできない
16. mobileで追加、編集、停止、再有効化、削除を操作できる
17. UIがAI、Weekly Plan、Mission、投稿を実行しない

## 12. Production gate

実装PRはDraftで開始する。

- Production Supabaseへの3.2-A migration前にbackup/rollbackを確認する
- Vercel PreviewにProduction DB/Auth credentialがない
- Production Auth/SMTP設定が有効である
- HTTP contract、integration、mobile smoke、human security reviewが成功する
- Content Pillar API/UIが外部AI/SNSへ通信しないことを確認する

## 13. 対象外

- AIによるPillar生成、推奨、並べ替え、類似判定
- Weekly Plan、Daily Mission、Mission Content、Feedback、Post Record
- SNS OAuth、投稿、metrics、Provider SDK
- LINE、BLOG、Job、worker、scheduler
- restore、physical delete、bulk、drag-and-drop

## 14. 完了条件

- 本指示書とD-025が承認済み
- actorがverified sessionだけから解決される
- tenant/Bunshin/Capability/soft-delete境界がHTTP/UIでも維持される
- lint、format、typecheck、unit、HTTP contract、integration、buildが成功する
- mobile browser smokeとhuman reviewを実施する
- implementation reportを作成し、対象外機能を実装しない

## 15. 承認事項

- [ ] Pillar APIはBunshin scopeとUUID pillarIdを必須にする
- [ ] createは201、それ以外の成功は200とする
- [ ] Assignment停止中もreadを許可し、mutationだけ拒否する
- [ ] deleteはbodyなしのsoft deleteとし、restoreを提供しない
- [ ] UIは既存Bunshin詳細内の最小セクションとする
- [ ] SUSPENDED/LOCKED時はread-only表示とする
- [ ] AI、Weekly Plan、Mission、Provider、Jobを実装しない
- [ ] Production gate完了まではDraft扱いとする
