# Phase 3 Slice 3.4 Daily Mission Core Persistence 実装指示書

## 1. 状態

実装前レビュー用。本文書とD-028が承認されるまでschema、migration、domain実装を開始しない。

## 2. 目的

Phase 4のMission Planner / Content Generatorが生成結果を安全に保存できるよう、Daily Missionと形式別Mission Contentの永続化、tenant境界、通常Missionの日付一意性、状態遷移をSOCIAL境界内に確立する。

本SliceではAI生成、HTTP API、UI、regenerate、Feedback、PostRecord、Jobを開始しない。

## 3. 実装単位

Slice 3.4はCore Persistenceだけを実装する。3.4-B API/UIは設けず、Missionの利用画面とユーザー操作はPhase 4で生成adapterと一緒に設計する。

対象:

- `packages/capability-social` の型、validation、repository port、use case
- `packages/database` のPrisma model、repository、migration
- unit / database integration test
- D-028と実装報告書

対象外:

- `apps/web` のroute、page、component
- AI provider、prompt、generation log、quality checker
- scheduler、worker、retry、expire job

## 4. Aggregate

`DailyMission`をaggregate rootとし、`MissionContent`を必須の1対1 childとして扱う。

```text
DailyMission
  id UUID
  workspaceId
  bunshinId
  socialProfileId nullable
  weeklyPlanItemId nullable
  missionDate DATE
  status GENERATED | VIEWED | STARTED | COMPLETED | SKIPPED | EXPIRED
  format SLIDE | LIVE_ACTION | AI_VIDEO_PROMPT | IMAGE
  estimatedMinutes
  topic
  angle
  reason
  qualityScore nullable
  viewedAt nullable
  startedAt nullable
  completedAt nullable
  skippedAt nullable
  expiredAt nullable
  createdAt
  updatedAt

MissionContent
  id UUID
  workspaceId
  bunshinId
  dailyMissionId
  format
  contentJson JSON
  createdAt
  updatedAt
```

- MissionとContentは同じtransactionで作成する
- ContentがないMission、MissionがないContentを許可しない
- `MissionContent.format`は親Missionのformatと一致させる
- provider名、model名、prompt、token、credential、embeddingを保存しない
- regenerate履歴やversion列は本Sliceで追加しない

## 5. Tenant / relation制約

- すべての行を`workspaceId + bunshinId`でscopeする
- DailyMissionからBunshinへ複合FKを張る
- MissionContentからDailyMissionへ`workspaceId + bunshinId + dailyMissionId`の複合FKを張る
- `socialProfileId`指定時は同じWorkspace/BunshinのSocial Profileだけを許可する
- `weeklyPlanItemId`指定時は同じWorkspace/BunshinのWeekly Plan Itemだけを許可する
- archive済みBunshin、inactive Workspace、inactive Memberはread/mutation対象外
- mutationは既存Bunshin管理policyとACTIVE SOCIAL Assignmentを必須にする
- Platform Admin overrideを追加しない

## 6. 日付と一意性

- `missionDate`はtimezoneを持たないPostgreSQL `DATE`
- domain境界では厳密な`YYYY-MM-DD`として扱い、UTC timestampへ意味変換しない
- 通常Missionの一意性は`workspaceId + bunshinId + missionDate`
- 本Sliceでは通常Missionだけを実装し、臨時Mission、再生成Mission、複数Mission/日は実装しない
- DB unique constraintを真の競合防止とし、競合は`CONFLICT`へ変換する
- Mission自身へtimezone snapshotは保存しない。生成側が対象local dateを確定して渡す

## 7. 状態機械

```text
GENERATED -> VIEWED -> STARTED -> COMPLETED
GENERATED -> STARTED
VIEWED    -> COMPLETED
GENERATED | VIEWED | STARTED -> SKIPPED
GENERATED | VIEWED | STARTED -> EXPIRED
```

- `COMPLETED | SKIPPED | EXPIRED`はterminal
- 同一状態への操作は冪等
- terminal状態から別状態へ遷移できない
- VIEWEDで`viewedAt`、STARTEDで`startedAt`、COMPLETEDで`completedAt`、SKIPPEDで`skippedAt`、EXPIREDで`expiredAt`を初回だけ記録する
- 後続状態へ直接進んだ場合も、通過していない状態のtimestampを推測で補完しない
- 自動expireの時刻・日数はJob設計まで決めない

## 8. Create input

```text
workspaceId
actorUserId
bunshinId
socialProfileId?
weeklyPlanItemId?
missionDate
format
estimatedMinutes
topic
angle
reason
content
qualityScore?
```

- `id`、status、timestampは入力させない
- estimatedMinutesは整数`1..120`
- topicはtrim後`1..200`
- angleはtrim後`1..500`
- reasonはtrim後`1..1000`
- qualityScoreは整数`0..100`またはnull
- formatは既存`SOCIAL_PREFERRED_FORMATS`を再利用する
- contentはformat別のdiscriminated unionとして受け、unknown fieldを拒否する

## 9. Mission Content validation

### SLIDE

```text
topic, angle, reason, estimatedMinutes
slides[1..7]: index, role HOOK | PROBLEM | INSIGHT | SOLUTION | CTA, headline, body
caption
hashtags[0..30]
```

- indexは1からの連番で重複不可
- 1枚目はHOOK、最終枚はCTA
- 5枚固定にはしない。仕様の簡易SLIDEと5〜7枚SLIDEを同じschemaで扱う

### LIVE_ACTION

```text
topic, estimatedMinutes, shootingInstruction
script[1..20]: seconds, role HOOK | BODY | CTA, text
caption
```

- scriptの先頭はHOOK、最終要素はCTA
- secondsは表示用文字列として保存し、時間計算へ使用しない

### AI_VIDEO_PROMPT

```text
topic, estimatedMinutes, toolSuggestion nullable
videoSettings: aspectRatio, durationSeconds, style
prompt
overlayText[0..20]
caption
```

- durationSecondsは整数`1..120`
- toolSuggestionは表示上の提案であり、provider接続情報ではない

### IMAGE

```text
topic, angle, reason, estimatedMinutes
imageInstruction
overlayText nullable
caption
hashtags[0..30]
```

- 画像binary、外部URL、生成provider responseは保存しない

共通文字列上限はdomain定数として明示し、JSON全体はDB任せにせず保存前にvalidationする。

## 10. Repository port

```text
create(input) -> DailyMission
list(scope, date range?) -> DailyMission[]
find(scope, dailyMissionId) -> DailyMission
markViewed(scope, dailyMissionId) -> DailyMission
markStarted(scope, dailyMissionId) -> DailyMission
markCompleted(scope, dailyMissionId) -> DailyMission
markSkipped(scope, dailyMissionId) -> DailyMission
markExpired(scope, dailyMissionId) -> DailyMission
```

- readはactive Workspace Memberかつ対象Bunshinへアクセス可能なUserに許可する
- mutationは管理policyとACTIVE SOCIAL Assignmentを要求する
- listは`missionDate DESC, id DESC`
- date rangeは両端を含み、最大90日とする
- cross-workspace / cross-bunshin / archived Bunshinは`NOT_FOUND`
- SOCIAL未割当はmutationで`NOT_FOUND`、SUSPENDED/LOCKEDは`FORBIDDEN`
- Assignment停止中もreadを許可する

## 11. 必須テスト

1. local date形式と同一Bunshin/日のDB一意性
2. 別Bunshinでは同じ日付を許可する
3. cross-user、cross-workspace、cross-bunshinを拒否する
4. archive済みBunshinへのread/mutationを拒否する
5. MEMBER/ADMIN/OWNER/Bunshin owner policyが既存Coreと一致する
6. SOCIAL未割当、SUSPENDED、LOCKEDでmutationを拒否する
7. Assignment停止中もactive Memberはreadできる
8. Social Profile / Weekly Plan Itemの複合FK越境を拒否する
9. MissionとContentが同じtransactionで作られ、片方だけ残らない
10. formatとcontent unionの不一致、unknown field、不正な配列・role・文字数を拒否する
11. SLIDE index連番、先頭HOOK、最終CTAを検証する
12. LIVE_ACTIONの先頭HOOK、最終CTAを検証する
13. estimatedMinutes、qualityScore、durationSecondsの範囲を検証する
14. 許可した状態遷移、直接遷移、terminal拒否を検証する
15. 同一状態操作が冪等でtimestampを変更しない
16. listの順序と最大90日rangeを検証する
17. provider、prompt metadata、credential、embedding列が存在しない
18. AI、API/UI、Feedback、PostRecord、Jobが追加されていない

## 12. Migration

- migration名は内容を表す時系列名にする
- enum、table、unique、composite FK、indexをmigration SQLで確認する
- 空PostgreSQLへ全migrationを順番に適用する
- rollbackはtable、FK、index、enumの削除順を実装報告書へ記載する
- Production適用前にbackup/restore手順を確認する

## 13. 対象外

- AI planner / generator / quality checker / regenerate
- Prompt、model、token、cost、generation log
- HTTP API、UI、Today画面、copy UI
- MissionFeedback、PostRecord、manual metrics
- scheduler、notification、LINE、Deep Link、Job、worker、retry、自動expire
- embedding、類似検索、Memory抽出
- SNS OAuth、投稿、Provider SDK
- BLOG Capability

## 14. 完了条件

- D-028が承認済み
- DailyMission / MissionContent aggregateとformat別validationがSOCIAL packageにある
- tenant、Bunshin、Capability、relation、date、state境界がDBとapplication層で一致する
- migrationを空PostgreSQLへ適用できる
- unit、database integration、typecheck、lint、format、buildが成功する
- implementation reportを作成し、対象外機能を実装しない

## 15. 承認事項

- [ ] Slice 3.4はCore Persistenceだけとし、API/UIを開始しない
- [ ] DailyMissionとMissionContentを必須1対1aggregateとして保存する
- [ ] 通常MissionはWorkspace/Bunshin/local dateで1件に限定する
- [ ] Missionへtimezone snapshotを保存しない
- [ ] format別contentを保存前にstrict validationする
- [ ] terminal状態をimmutableにし、同一状態操作を冪等にする
- [ ] Assignment停止中もreadを許可し、mutationだけ拒否する
- [ ] AI、Feedback、PostRecord、LINE、Jobを実装しない
