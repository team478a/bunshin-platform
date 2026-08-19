# Phase 3 Slice 3.3 Weekly Plan 実装指示書

## 1. 状態

実装前レビュー用。本文書とD-026が承認されるまでschema、migration、API、UIを実装しない。

## 2. 目的

Bunshinが1週間の発信方針と日別予定を手動で管理できるWeekly Plan基盤をSOCIAL Capability内に作る。local date、週境界、Content Pillar参照、確定・失効の状態遷移を先に固定し、後続Daily Missionが安定した計画IDを参照できるようにする。

AI planner、Daily Mission、scheduler、投稿処理は開始しない。

## 3. PR分割

### Slice 3.3-A: Core Persistence

- `@bunshin/capability-social`へWeeklyPlan / WeeklyPlanItem型、validation、repository port、use caseを追加
- Prisma model、migration、repository adapter
- ACTIVE SOCIAL Capability guardとContent Pillar scopeの接続
- unit / PostgreSQL integration test
- API/UIなし

### Slice 3.3-B: Authenticated API / Minimal UI

- authenticated list/detail/create/update/item管理/confirm/expire API
- 既存Bunshin詳細内の最小Weekly Plan UI
- HTTP contract、認可、mobile browser smoke
- AI、Daily Mission、Jobなし

3.3-Aをreview/mergeした後、3.3-BのHTTP contractを別指示書で承認する。

## 4. Package境界

- Weekly Plan型、local date validation、状態遷移、port、use caseは`@bunshin/capability-social`が所有する
- Core/applicationは`capability-social`へ依存しない
- databaseはrepository adapterを提供する
- webは後続3.3-BでHTTP/UI adapterとしてuse caseを呼ぶ
- AI/Provider/LINE/Job SDKを追加しない

## 5. 対象model

```text
WeeklyPlan
  id UUID
  workspaceId
  bunshinId
  weekStartDate DATE
  timezone IANA timezone snapshot
  strategySummary nullable
  status DRAFT | CONFIRMED | EXPIRED
  confirmedAt nullable
  expiredAt nullable
  createdAt
  updatedAt

WeeklyPlanItem
  id UUID
  workspaceId
  bunshinId
  weeklyPlanId
  scheduledDate DATE
  contentPillarId UUID
  goal
  angle
  recommendedFormat SLIDE | LIVE_ACTION | AI_VIDEO_PROMPT | IMAGE
  notes nullable
  createdAt
  updatedAt
```

- `(workspaceId, bunshinId, weekStartDate)`をWeeklyPlanのuniqueとする
- `(weeklyPlanId, scheduledDate)`をItemのuniqueとし、同一Plan・同一日は1件だけとする
- Workspace/Bunshin、Plan、Content Pillarはscope付きFKで越境参照をDBでも拒否する
- FKは`ON DELETE RESTRICT`とし、plan/itemの物理削除とsoft deleteはこのSliceで提供しない

## 6. Local date / Week規則

- `weekStartDate`と`scheduledDate`はtimestampではなくPostgreSQL `DATE`で保持し、domain/APIでは厳密な`YYYY-MM-DD`文字列として扱う
- 週開始は月曜日、終了は日曜日とする
- create時に有効なIANA timezoneを必須とし、Planへsnapshot保存する
- 現行User modelにtimezoneがないため、このSliceでUser/Workspaceへtimezone列は追加しない
- `weekStartDate`が保存timezone上の月曜日でない入力を拒否する
- Itemの`scheduledDate`はPlanの月曜から日曜の範囲内だけを許可する
- timezone変更、週の再解釈、DST時刻計算は行わない。DATEは既に確定したlocal calendar dateとして扱う

## 7. 入力制約

- timezone: trim後1..64文字、有効なIANA timezone
- strategySummary: nullable。trim後1..1000文字、空文字はnull
- goal: trim後1..200文字
- angle: trim後1..500文字
- recommendedFormat: 既存`SocialPreferredFormat`を再利用
- notes: nullable。trim後1..1000文字、空文字はnull
- actor、scope ID、resource ID、status、timestampをmutable inputへ含めない
- unknown fieldを拒否する
- Plan create時statusはDRAFT、Itemは別操作で追加する
- 同一週Planを自動上書きしない。重複は`CONFLICT`

## 8. 状態と操作

```text
未作成 --create--> DRAFT
DRAFT --update strategy / add-update-remove item--> DRAFT
DRAFT --confirm--> CONFIRMED
DRAFT --expire--> EXPIRED
CONFIRMED --expire--> EXPIRED
EXPIRED --no transition-->
```

- confirm/expireは同じ到達状態への再実行を冪等にする
- CONFIRMED後はPlan内容とItemを変更しない
- confirmにはItemが1件以上必要
- confirm時点で全ItemのContent Pillarが非deletedかつactiveであることを再検証する
- EXPIREDはread可能だが変更・再確定できない
- 自動expire、現在日時による暗黙状態変更は行わない

## 9. Content Pillar参照

- Itemは同一Workspace/Bunshinの非deleted Content Pillarだけを参照できる
- DRAFT中のItem作成・更新ではactive Pillarだけを許可する
- Pillarを停止・削除しても既存Itemをcascade deleteしない
- Plan readでは参照時点のPillar titleをjoin表示できるが、title snapshotは保存しない
- Pillar停止/削除後のDRAFT Planはconfirmできない。CONFIRMED/EXPIRED Planの履歴readは維持する

## 10. Capability guard

- read: active Workspace Memberかつ対象Bunshinへアクセス可能なら許可する
- create/update/item mutation/confirm/expire: 既存Bunshin管理policyとACTIVE SOCIAL Assignmentを必須にする
- SOCIAL未割当は`NOT_FOUND`、SUSPENDED/LOCKEDは`FORBIDDEN`
- archived Bunshinへの全操作を拒否する
- Assignment停止後もPlan/Itemを削除せずreadを許可する
- Platform Admin overrideを追加しない

## 11. Repository / Use Case

```text
WeeklyPlanRepository
  createPlan
  listPlans
  findPlan
  updatePlan
  createItem
  updateItem
  removeItem
  confirmPlan
  expirePlan

CreateWeeklyPlan / ListWeeklyPlans / GetWeeklyPlan / UpdateWeeklyPlan
CreateWeeklyPlanItem / UpdateWeeklyPlanItem / RemoveWeeklyPlanItem
ConfirmWeeklyPlan / ExpireWeeklyPlan
```

全methodは`workspaceId + actorUserId + bunshinId`を必須とする。Plan/Item操作はさらにUUIDを必須とし、裸のIDだけで操作しない。

- Plan list: `weekStartDate DESC, id DESC`
- Item list: `scheduledDate ASC, id ASC`
- PlanとItemを整合したaggregateとして返し、別BunshinのItemを混在させない

## 12. 必須DB制約

- Plan `(workspaceId, bunshinId, weekStartDate)` unique
- Item `(weeklyPlanId, scheduledDate)` unique
- scope付き複合FKでPlan/Bunshin/Pillar越境を拒否
- `weekStartDate` / `scheduledDate`は`DATE`
- timezone `VARCHAR(64)`、strategySummary/goal/angle/notesは指定上限の`VARCHAR`
- status/formatはenum、Plan status default DRAFT
- confirmedAt/expiredAtとstatusの整合CHECK
- `scheduledDate BETWEEN weekStartDate AND weekStartDate + 6`はrepository transactionに加え、DB triggerではなくItemへ`weekStartDate`を重複保存せずintegration testで保証する
- tenant/週/status検索用index

## 13. 3.3-A 必須テスト

1. 月曜以外、存在しない日付、時刻付き文字列、無効timezoneを拒否する
2. DSTを含むIANA timezoneでもlocal DATEが変形しない
3. 同一Bunshin/週重複を拒否し、別Bunshin/Workspaceは許可する
4. Itemの日付が月〜日の範囲外なら拒否する
5. 同一Plan/日付のItem重複を拒否する
6. cross-user、cross-workspace、cross-bunshin、archive済みBunshinを拒否する
7. SOCIAL未割当、SUSPENDED、LOCKEDでmutationを拒否し、停止中もreadできる
8. MEMBER/ADMIN/OWNER/Bunshin owner policyが既存方針と一致する
9. 別Bunshin/Workspace、deleted/inactive Pillarを新規Itemへ指定できない
10. trim、長さ、enum、unknown field相当のvalidationを確認する
11. DRAFTだけを編集でき、CONFIRMED/EXPIREDを変更できない
12. Itemなし、inactive/deleted Pillar参照中のconfirmを拒否する
13. confirm/expireが冪等で、逆遷移できない
14. Pillar停止/削除後も確定済み履歴をreadできる
15. repositoryが安定sortと完全なtenant/Bunshin scopeを維持する

## 14. Migration / Rollback

- Content Pillar migrationの後へ追加する
- CIで空PostgreSQLへ全migrationを適用する
- Productionへ自動適用しない
- rollbackはデータ退避後、Item、Plan、enum、index/checkの順序を考慮したforward-fix migrationで行う
- 適用済みmigrationを編集しない

## 15. 対象外

- AIによる週次計画生成、提案、再生成、品質評価
- Daily Mission、Mission Content、Feedback、Post Record
- scheduler、自動expire、Job、worker、retry
- SNS OAuth、投稿、metrics、Provider SDK
- LINE、BLOG
- 複数Item/日、drag-and-drop、bulk編集、Plan複製
- User/Workspace timezone設定UI

## 16. 完了条件

- 本指示書とD-026が承認済み
- 3.3-AはWeekly Plan Core Persistenceだけを実装する
- local DATE、状態遷移、tenant/Bunshin/Capability/Pillar境界をPostgreSQL integration testで実証する
- lint、format、typecheck、unit、integration、buildが成功する
- implementation reportを作成し、対象外機能を実装しない

## 17. 承認事項

- [ ] 3.3-A Core Persistenceと3.3-B API/UIを別PRにする
- [ ] 週はIANA timezone上の月曜〜日曜とし、DATEで保存する
- [ ] Planへtimezone snapshotを保存し、User timezone追加は後続とする
- [ ] 同一Bunshin/週は1 Plan、同一Plan/日は1 Itemとする
- [ ] DRAFTだけを編集でき、CONFIRMED/EXPIREDはimmutableとする
- [ ] confirmには1件以上のItemとactive Pillarを必須にする
- [ ] expireは手動操作だけとし、自動Jobを実装しない
- [ ] AI、Daily Mission、Provider、LINE、BLOG、Jobを実装しない
