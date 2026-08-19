# Phase 3 Slice 3.1-B Authenticated Social Profile API / Minimal UI 実装指示書

## 1. 状態

実装前レビュー用。本文書とD-023が承認されるまでAPI/UI実装を開始しない。

## 2. 目的

Slice 3.1-Aの手動Social Profile Core Persistenceをverified sessionへ接続し、Userが管理可能なBunshinについてplatform、handle、profile URL、発信目的、投稿頻度、希望形式を手動設定できる最小HTTP/UIを提供する。SNS接続、投稿、AI、Mission、Jobは開始しない。

## 3. 対象範囲

- authenticated list/create/update/activate/deactivate API
- 既存Bunshin詳細内の最小Social Profile UI
- `CurrentUserProvider`、same-origin、JSON Content-Type、`no-store`、共通error mappingの再利用
- HTTP contract、認可、mobile browser smoke test
- Slice 3.1-B実装報告書

## 4. HTTP surface

```text
GET   /api/workspaces/:workspaceId/bunshins/:bunshinId/social-profiles
POST  /api/workspaces/:workspaceId/bunshins/:bunshinId/social-profiles
PATCH /api/workspaces/:workspaceId/bunshins/:bunshinId/social-profiles/:platform
POST  /api/workspaces/:workspaceId/bunshins/:bunshinId/social-profiles/:platform/activate
POST  /api/workspaces/:workspaceId/bunshins/:bunshinId/social-profiles/:platform/deactivate
```

`platform` pathは`INSTAGRAM | TIKTOK | X | OTHER`だけを受け付ける。Profile IDをpathへ公開せず、Coreと同じ`workspaceId + bunshinId + platform`でresourceを識別する。

- GET list: `200`
- create: `201`
- update: `200`
- activate/deactivate: 冪等に`200`

GET detail、DELETE、platform変更、bulk操作は提供しない。

## 5. Request body

createは`platform`、`purpose`、`postingFrequency`、`preferredFormats`を必須とし、`handle`と`profileUrl`を任意とする。updateはplatformを含めず、変更項目を1つ以上必須とする。activate/deactivateはstrictな空JSON objectだけを受け付ける。

- bodyはstrict objectとしunknown fieldを拒否する
- `workspaceId`、`bunshinId`、`actorUserId`、`id`、`status`、timestampを拒否する
- actorはverified session userからだけ解決する
- enum、文字数、HTTPS、preferredFormatsの制約はCore validationと一致させる
- mutationはsame-originかつ`application/json`だけを許可する

## 6. Response DTO

Prisma modelを直接返さず、次のDTOへ変換する。

```text
SocialProfileDto
  id
  workspaceId
  bunshinId
  platform
  handle
  profileUrl
  purpose
  postingFrequency
  preferredFormats
  status
  createdAt
  updatedAt
```

日時はISO 8601文字列とする。actor、Capability Assignment、config、credential、token、Provider responseを含めない。

## 7. 認可・情報漏えい防止

- 未認証は`UNAUTHENTICATED`
- readはactive Workspace Memberかつ対象Bunshinへアクセス可能なUserだけを許可する
- mutationは既存Bunshin管理policyとACTIVE SOCIAL Assignmentの両方を必須とする
- SOCIAL未割当は`404`、SUSPENDED/LOCKEDは`403`
- cross-user、cross-workspace、cross-bunshin、管理不可Bunshin、archive済みBunshinは`404`
- OWNER/ADMINはWorkspace内Bunshinを管理可能、MEMBERは自分がownerのBunshinだけ変更可能
- Platform Admin overrideを追加しない
- response/logへemail、cookie、token、Supabase response、credentialを記録しない
- 全responseへ`Cache-Control: no-store`

## 8. HTTP status

- validation、Content-Type違反: `400`
- Origin違反: `403`
- 未認証: `401`
- 対象不在、境界違反、管理不可、SOCIAL未割当: `404`
- SUSPENDED/LOCKED Assignment: `403`
- 同一platform重複create: `409`
- 想定外: `500`。内部情報を返さない

## 9. UI surface

既存`/bunshins/:bunshinId`のSOCIAL Capability付近へ「Social Profile」セクションを追加する。

- 未割当なら操作を表示せず「先にSOCIALを割り当ててください」と表示する
- ACTIVEなら一覧、追加、編集、有効化、停止を提供する
- SUSPENDED/LOCKEDなら既存Profileをread-only表示し、変更できない理由を表示する
- createでは未登録platformだけを選択でき、updateでplatformを変更できない
- handle/profile URLは任意、目的・投稿頻度・希望形式は必須
- mobile viewportで横スクロールなしに操作できる
- 投稿、連携、同期、生成を実行するbuttonを置かない
- 「SNS接続・投稿機能は後続Phaseで提供」と明示する

別のSNS管理画面は新設せず、既存Bunshin詳細内で完結させる。

## 10. Client state

- 初期表示はServer ComponentからCore use caseを呼ぶ
- mutation後はAPI responseを反映し、必要に応じて`router.refresh()`する
- optimistic updateは必須にしない
- 二重送信中はbuttonを無効化する
- errorは秘密情報を含まない日本語メッセージで表示する
- browser storageへProfileや認証情報を保存しない

## 11. 必須テスト

1. actor、status、id、timestamp、platform update、unknown fieldを拒否する
2. enumのunknown値、preferredFormatsの空・重複・5件以上を拒否する
3. profileUrlはHTTPSだけを許可する
4. 未認証sessionを拒否する
5. cross-user、cross-workspace、cross-bunshinを拒否する
6. MEMBER/ADMIN/OWNER/Bunshin owner policyがCoreと一致する
7. archived Bunshinへの全操作を拒否する
8. SOCIAL未割当、SUSPENDED、LOCKEDでmutationを拒否する
9. Assignment停止中もactive Workspace Memberはreadできる
10. 同一platform重複createを`409`にする
11. activate/deactivateを冪等に`200`で返す
12. DTO日時がISO文字列で、秘密情報やAssignment configを含まない
13. Origin不一致とContent-Type不正を拒否する
14. response/logへemail、cookie、token、credentialを出さない
15. logout後にprotected API/UIへアクセスできない
16. mobileで追加・編集・停止・再有効化を操作できる
17. UIがSNS接続、投稿、AI生成を実行しない

## 12. Production gate

実装PRはDraftで開始する。

- Production Supabaseへの3.1-A migration前にbackup/rollbackを確認する
- Vercel PreviewにProduction DB/Auth credentialがない
- Production Auth Site URL、redirect allowlist、SMTP設定が有効である
- HTTP contract、integration、mobile smoke、human security reviewが成功する
- API/UIから外部SNSへ通信しないことを確認する

## 13. 対象外

- SNS OAuth、Provider SDK、token、credential保存
- 投稿、予約投稿、自動投稿、metrics、同期
- AI、Prompt、embedding、RAG、動画生成
- Content Pillar、Weekly Plan、Mission、Feedback、Post Record
- LINE、BLOG、Job、worker、scheduler、retry
- delete、platform変更、bulk、履歴table
- Capability Assignment変更、LOCKED操作、課金、entitlement

## 14. 完了条件

- 本指示書とD-023が承認済み
- actorがverified sessionだけから解決される
- tenant/Bunshin境界、管理policy、ACTIVE SOCIAL guardがHTTP/UIでも維持される
- 外部SNS通信を行わない
- lint、format、typecheck、unit、HTTP contract、integration、buildが成功する
- mobile browser smokeとhuman reviewを実施する
- implementation reportを作成し、対象外機能を実装しない

## 15. 承認事項

- [x] Profile resourceは`workspaceId + bunshinId + platform`で識別する
- [x] createは`201`、update/activate/deactivateは`200`とする
- [x] Assignment停止中もreadを許可し、mutationだけを拒否する
- [x] UIは既存Bunshin詳細内の最小セクションとする
- [x] SUSPENDED/LOCKED時はread-only表示とする
- [x] SNS接続・投稿・AI・Mission・Jobを実装しない
- [x] Production gate完了まではDraft扱いとする
