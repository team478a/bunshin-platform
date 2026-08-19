# Phase 2 Slice 2.4-B Authenticated Capability Assignment API / UI 実装指示書

## 1. 状態

実装前レビュー用。本文書とD-021が承認されるまでAPI/UI実装を開始しない。

## 2. 目的

Slice 2.4-Aで実装したCapability Assignment Core Persistenceを、verified sessionへ接続する。Userが管理可能なBunshinについて、SOCIAL Capabilityの割当、有効化、停止を行える最小のHTTP/UIを提供する。

このSliceはCapabilityの利用可否を管理するだけであり、SOCIAL投稿、外部Provider接続、AI生成、Job実行を開始しない。

## 3. 対象範囲

- authenticated Capability Assignment API
- Bunshin詳細内のSOCIAL Capability状態表示、割当、有効化、停止UI
- `CurrentUserProvider`、same-origin、JSON Content-Type、`no-store`、共通error mappingの再利用
- HTTP contract test、認可test、最小browser smoke test
- Slice 2.4-B実装報告書

## 4. HTTP surface

```text
GET  /api/workspaces/:workspaceId/bunshins/:bunshinId/capabilities
POST /api/workspaces/:workspaceId/bunshins/:bunshinId/capabilities
POST /api/workspaces/:workspaceId/bunshins/:bunshinId/capabilities/SOCIAL/activate
POST /api/workspaces/:workspaceId/bunshins/:bunshinId/capabilities/SOCIAL/suspend
```

割当request bodyは厳密に`{ "capabilityType": "SOCIAL" }`だけを受け付ける。activate／suspendは空JSON objectだけを受け付ける。

Phase 2で公開入力として受け付けるCapabilityTypeは`SOCIAL`だけとする。BLOG、LINE_MARKETING、LP、LEAD_GENERATION、SALES、CUSTOMER_SUPPORTはCoreで保存可能でもHTTP mutationへ公開しない。

assign、activate、suspendはCoreの冪等性を維持し、成功時は新規・既存を問わず`200`を返す。DELETE、unassign、LOCKED操作、config更新は提供しない。

## 5. UI surface

既存`/bunshins/:bunshinId`へ「Capability」セクションを追加する。

- SOCIALの状態を「未割当」「有効」「停止中」「ロック中」で表示する
- 未割当時に「SOCIALを割り当てる」を表示する
- 有効時に「停止する」を表示する
- 停止中に「再有効化する」を表示する
- ロック中は状態だけを表示し、変更操作を出さない

UI文言はCapability実行機能が利用可能になったと誤認させない。「投稿機能は後続Phaseで提供」と明示する。通常の多機能SaaS設定画面を新設せず、Bunshin詳細内でスマートフォンから完了できる最小構成にする。

## 6. 入力制約

- assign body: strict object、`capabilityType`は`SOCIAL`リテラル
- activate／suspend body: strict empty object
- unknown fieldを拒否する
- request bodyの`workspaceId`、`bunshinId`、`actorUserId`、`assignedByUserId`、`status`、`config`、timestampを拒否する
- actorはverified session userからだけ解決する
- mutationはsame-originかつ`application/json`だけを許可する
- pathのCapabilityTypeは`SOCIAL`だけをrouteとして提供する

## 7. 認可・情報漏えい防止

- 未認証は`UNAUTHENTICATED`
- cross-user、cross-workspace、cross-bunshin、管理不可Bunshin、archive済みBunshinは`NOT_FOUND`
- readはactive Workspace Memberかつ対象Bunshinへアクセス可能なUserに限る
- assign／activate／suspendは既存`canManageBunshin` policyを再利用する
- OWNER／ADMINはWorkspace内Bunshinを管理可能、MEMBERは自分がownerのBunshinだけ管理可能
- Platform Admin overrideを追加しない
- Bunshin AのAssignmentをBunshin Bの表示・操作・将来実行許可に利用しない
- responseとlogへemail、token、cookie、Supabase response、configを記録しない
- API responseは成功・失敗とも`Cache-Control: no-store`

## 8. Response DTO

永続化modelを直接返さず、次のDTOへ変換する。

```text
BunshinCapabilityAssignmentDto:
  id
  workspaceId
  bunshinId
  capabilityType
  status
  activatedAt
  createdAt
  updatedAt
```

`config`と`assignedByUserId`は公開DTOから除外する。GET listはCoreに保存されたAssignmentをDTOで返せるが、Phase 2 UIが表示・操作するのはSOCIALだけとする。

## 9. HTTP status

- list／assign／activate／suspend成功: `200`
- validation／Origin／Content-Type違反: 既存共通mappingに従う`400`または`403`
- 未認証: `401`
- 認可境界または対象不在: `404`
- LOCKEDへの管理操作: `409`
- 想定外の失敗: `500`。内部情報やconfigを返さない

## 10. 必須テスト

1. request supplied actor、status、config、assignment id、timestampとunknown fieldを拒否する
2. `SOCIAL`以外のCapabilityTypeをmutation inputとして拒否する
3. 未認証sessionを拒否する
4. User AがUser BのWorkspace/Bunshin Assignmentを取得・変更できない
5. Bunshin AのAssignmentをBunshin Bのpathから取得・変更できない
6. MEMBER／ADMIN／OWNER／Bunshin owner policyがCoreと一致する
7. archived Bunshinへのassign／activate／suspendを拒否する
8. assign／activate／suspendのHTTP操作が冪等で重複rowを作らない
9. LOCKEDを変更できず`409`を返す
10. DTOに`config`と`assignedByUserId`が含まれない
11. Origin不一致とContent-Type不正を拒否する
12. error response／logへconfig、email、tokenを出さない
13. logout後にprotected API／UIへアクセスできない
14. mobile viewportでSOCIALの割当、停止、再有効化を操作できる
15. UIがSOCIAL投稿・生成・Provider接続を実行しない

## 11. Production gate

実装PRはDraftで開始する。Production公開前に次を確認する。

- Slice 2.1-BのSupabase Auth Site URL／redirect allowlist／SMTP設定が有効
- Production SupabaseへSlice 2.4-A migrationを適用する前にbackup／rollback方針を確認
- Vercel PreviewにProduction DB/Auth credentialがない
- HTTP contract、PostgreSQL integration、browser smoke、human security reviewが成功
- ProductionでAssignment APIを有効にしてもCapability実行処理が存在しないことを確認

## 12. 対象外

- SOCIAL profile、投稿作成、投稿公開、SNS Provider接続
- AI生成、Prompt、embedding、RAG
- LINE、BLOG、LP、営業、顧客対応Capabilityの公開管理
- Mission、Feedback、Performance
- Job table、worker、scheduler、retry
- Plan、課金、entitlement、LOCKED操作
- config編集、Capability削除、unassign、履歴table
- Capability実行route、handler、SDK

## 13. 完了条件

- 本指示書とD-021が承認済み
- actorがverified sessionだけから解決される
- Workspace／Bunshin分離、管理policy、状態遷移がHTTP/UIでも維持される
- 公開mutationはSOCIALだけに限定される
- lint、typecheck、unit、HTTP contract、integration、buildが成功する
- implementation reportを作成する
- 対象外機能を実装しない

## 14. 承認事項

- [ ] Capability UIは既存Bunshin詳細内の最小セクションとする
- [ ] Phase 2の公開mutationはSOCIALのassign／activate／suspendだけとする
- [ ] 成功responseは冪等性を優先して新規・既存とも`200`とする
- [ ] 公開DTOから`config`と`assignedByUserId`を除外する
- [ ] LOCKED操作、DELETE、unassign、config編集を提供しない
- [ ] UIに投稿機能が後続Phaseであることを明示する
- [ ] Production gate完了まではDraft扱いとする
