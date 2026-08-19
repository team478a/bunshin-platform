# Phase 3 Slice 3.3-B Authenticated Weekly Plan API / Minimal UI 実装指示書

## 1. 状態

承認・実装済み。実装結果は `docs/PHASE3_SLICE_3_3B_IMPLEMENTATION_REPORT.md` を参照する。

## 2. 目的

Slice 3.3-AのWeekly Plan Core Persistenceをverified sessionへ接続し、UserがBunshinの週次発信計画を手動で作成・編集・確定・失効できる最小HTTP/UIを提供する。

AI planner、Daily Mission、scheduler、SNS投稿、Jobは開始しない。

## 3. HTTP surface

```text
GET    /api/workspaces/:workspaceId/bunshins/:bunshinId/weekly-plans
POST   /api/workspaces/:workspaceId/bunshins/:bunshinId/weekly-plans
GET    /api/workspaces/:workspaceId/bunshins/:bunshinId/weekly-plans/:planId
PATCH  /api/workspaces/:workspaceId/bunshins/:bunshinId/weekly-plans/:planId
POST   /api/workspaces/:workspaceId/bunshins/:bunshinId/weekly-plans/:planId/items
PATCH  /api/workspaces/:workspaceId/bunshins/:bunshinId/weekly-plans/:planId/items/:itemId
DELETE /api/workspaces/:workspaceId/bunshins/:bunshinId/weekly-plans/:planId/items/:itemId
POST   /api/workspaces/:workspaceId/bunshins/:bunshinId/weekly-plans/:planId/confirm
POST   /api/workspaces/:workspaceId/bunshins/:bunshinId/weekly-plans/:planId/expire
```

- Plan/Item createは`201`
- list/detail/update/delete/confirm/expireは`200`
- planId/itemIdはUUIDだけを受け付ける
- DELETEはrequest bodyを受け付けない
- Plan delete、reopen、clone、bulk APIは提供しない

## 4. Request body

Plan create:

```json
{
  "weekStartDate": "2026-08-17",
  "timezone": "Asia/Tokyo",
  "strategySummary": "初心者向けの基礎を中心に発信する"
}
```

Plan updateは`strategySummary`だけを受け付ける。

Item create:

```json
{
  "scheduledDate": "2026-08-18",
  "contentPillarId": "uuid",
  "goal": "保存される基礎解説",
  "angle": "最初の3手に絞る",
  "recommendedFormat": "SLIDE",
  "notes": null
}
```

Item updateは`scheduledDate | contentPillarId | goal | angle | recommendedFormat | notes`の1項目以上。confirm/expireはstrictな空JSON objectとする。

- strict objectとしてunknown fieldを拒否する
- actor、scope ID、resource ID、status、timestampをbodyで受け付けない
- actorはverified sessionからだけ解決する
- `YYYY-MM-DD`、月曜開始、IANA timezone、文字数、formatはCoreと一致させる
- mutationはsame-origin必須
- POST/PATCH/state操作は`application/json`必須

## 5. Response DTO

```text
WeeklyPlanDto
  id, workspaceId, bunshinId
  weekStartDate, timezone, strategySummary, status
  confirmedAt, expiredAt, createdAt, updatedAt
  items[]

WeeklyPlanItemDto
  id, workspaceId, bunshinId, weeklyPlanId
  scheduledDate, contentPillarId, contentPillarTitle
  goal, angle, recommendedFormat, notes
  createdAt, updatedAt
```

- local dateは`YYYY-MM-DD`を維持し、timezone変換しない
- timestampはISO 8601文字列、nullable timestampはnull
- Pillar titleはread時の表示用joinであり、Itemへsnapshot保存しない
- Prisma model、actor、Assignment config、credential、tokenを返さない
- listもItem込みaggregateを返し、Planは`weekStartDate DESC, id DESC`、Itemは日付順を維持する

## 6. 認可・状態境界

- 未認証は`401`
- readはactive Workspace Memberかつ対象Bunshinへアクセス可能なUserのみ
- mutationは既存Bunshin管理policyとACTIVE SOCIAL Assignmentを必須にする
- SOCIAL未割当は`404`、SUSPENDED/LOCKEDは`403`
- Assignment停止中もreadを許可する
- cross-user、cross-workspace、cross-bunshin、archive済みBunshinは`404`
- DRAFTだけでPlan/Itemを編集可能。CONFIRMED/EXPIREDへの編集は`409`
- confirm条件不足、同一週/同一日重複、無効状態遷移は`409`
- 全responseへ`Cache-Control: no-store`
- Platform Admin overrideを追加しない

## 7. Error mapping

- validation、Content-Type、invalid UUID/date/timezone/format: `400`
- Origin違反、SUSPENDED/LOCKED: `403`
- 未認証: `401`
- 対象不在、scope/管理境界、SOCIAL未割当、Pillar不在: `404`
- duplicate、immutable状態、confirm条件不足、無効遷移: `409`
- 想定外: `500`。内部情報を返さない

## 8. UI surface

既存Bunshin詳細のContent Pillar直後へ「Weekly Plan」セクションを追加する。

- 週開始日、timezone、strategy、status、Itemを一覧表示する
- ACTIVE SOCIALなら新規DRAFT Plan作成、strategy編集、Item追加/編集/削除、Plan確定/失効を提供する
- 新規作成時のtimezone初期値はbrowserのIANA timezoneを使用し、取得不能時は`Asia/Tokyo`とする。保存前にUserが確認・変更できる
- weekStartDate inputには月曜を要求し、日本語で週範囲を表示する
- Itemでは同一Bunshinのactive Content Pillarだけを選択肢にする
- 同一日1件、確定後編集不可、失効後再利用不可を画面に明示する
- confirm前に確認UIを出し、確定後は編集できないことを示す
- expire前に確認UIを出し、自動失効ではないことを示す
- 未割当ならSOCIAL割当案内だけを表示する
- SUSPENDED/LOCKEDなら既存Planをread-only表示する
- mobile viewportで横スクロールなしに操作できる
- calendar drag-and-drop、bulk編集、AI生成buttonを追加しない
- 「AI計画生成とDaily Missionは後続Phase」と明示する

## 9. Client state

- 初期表示はServer ComponentからCore use caseを呼ぶ
- mutation後はAPI responseを反映し、必要に応じて`router.refresh()`する
- 二重送信中は操作を無効化する
- optimistic updateは必須にしない
- errorは秘密情報を含まない日本語メッセージで表示する
- browser storageへPlan、Pillar、認証情報を保存しない

## 10. 必須テスト

1. actor、scope ID、resource ID、status、timestamp、unknown fieldを拒否する
2. invalid UUID/date/timezone/format、文字数超過、空updateを拒否する
3. 月曜以外のweekStartDateと週外scheduledDateを拒否する
4. 未認証、cross-user、cross-workspace、cross-bunshinを拒否する
5. MEMBER/ADMIN/OWNER/Bunshin owner policyがCoreと一致する
6. archive済みBunshinへの全操作を拒否する
7. SOCIAL未割当、SUSPENDED、LOCKEDでmutationを拒否する
8. Assignment停止中もactive Workspace Memberはreadできる
9. 同一Bunshin/週、同一Plan/日の重複を`409`にする
10. 別Bunshin、inactive/deleted PillarをItemへ指定できない
11. DRAFTだけを編集でき、CONFIRMED/EXPIREDでは`409`になる
12. Itemなし/inactive Pillar参照中のconfirmを`409`にする
13. confirm/expireを冪等に`200`で返し、逆遷移を拒否する
14. DELETE bodyを拒否し、Item削除後のaggregateを返す
15. local dateとtimezoneが変形せず、timestampだけISO文字列になる
16. DTOに秘密情報が含まれず、全responseが`no-store`
17. logout後にprotected API/UIへアクセスできない
18. mobileでPlan作成、Item管理、確定、失効を操作できる
19. UIがAI、Daily Mission、投稿、schedulerを実行しない

## 11. Production gate

実装PRはDraftで開始する。

- Production Supabaseへの3.3-A migration前にbackup/rollbackを確認する
- Vercel PreviewにProduction DB/Auth credentialがない
- Production Auth/SMTP設定が有効である
- HTTP contract、integration、mobile smoke、human security reviewが成功する
- Weekly Plan API/UIが外部AI/SNSへ通信せず、Jobを起動しないことを確認する

## 12. 対象外

- AI planner、提案、再生成、品質評価
- Daily Mission、Mission Content、Feedback、Post Record
- scheduler、自動expire、Job、worker、retry
- SNS OAuth、投稿、metrics、Provider SDK
- LINE、BLOG
- Plan delete/reopen/clone、複数Item/日、bulk、drag-and-drop
- User/Workspace timezone設定UI

## 13. 完了条件

- 本指示書とD-027が承認済み
- actorがverified sessionだけから解決される
- tenant/Bunshin/Capability/Pillar/calendar/state境界がHTTP/UIでも維持される
- lint、format、typecheck、unit、HTTP contract、integration、buildが成功する
- mobile browser smokeとhuman reviewを実施する
- implementation reportを作成し、対象外機能を実装しない

## 14. 承認事項

- [x] Plan/Item APIはBunshin scopeとUUIDを必須にする
- [x] Plan/Item createは201、それ以外の成功は200とする
- [x] Assignment停止中もreadを許可し、mutationだけ拒否する
- [x] DRAFTのみ編集可能とし、confirm/expireは冪等にする
- [x] Itemはactive Content Pillarだけを選択可能にする
- [x] UIは既存Bunshin詳細内の最小セクションとする
- [x] browser timezoneは初期値にだけ使い、Userが確認できるようにする
- [x] AI、Daily Mission、Provider、LINE、BLOG、Jobを実装しない
