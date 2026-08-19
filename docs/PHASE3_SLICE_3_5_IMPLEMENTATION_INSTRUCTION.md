# Phase 3 Slice 3.5 Feedback / Post Record 実装指示書

## 1. 状態

実装前レビュー用。本文書とD-029が承認されるまでschema、migration、API、UIを実装しない。

## 2. 目的

Daily Missionに対する投稿結果、本人らしさ評価、手動投稿記録、手動metricsをSOCIAL Capability内へ安全に保存する。Mission状態、Feedback、PostRecordの部分成功を防ぎ、Phase 4の投稿完了・スキップUIが接続できる永続化境界を先に固定する。

SNS API投稿、自動metrics取得、AI、LINE、Job、Provider連携は開始しない。

## 3. PR分割

### Slice 3.5-A: Core Persistence

- `@bunshin/capability-social`へMissionFeedback / PostRecord型、validation、repository port、use caseを追加
- Prisma model、migration、repository adapter
- DailyMission状態機械とACTIVE SOCIAL Capability guardへ接続
- unit / PostgreSQL integration test
- API/UIなし

### Slice 3.5-B: Authenticated API / Minimal UI

- 投稿完了、後で行う、スキップ、本人らしさ、コメント、manual metricsのauthenticated API
- Phase 4のToday画面を先取りせず、既存Bunshin境界でHTTP contractを確認する最小UI
- HTTP contract、認可、mobile browser smoke
- SNS API投稿、自動metrics取得、AI、LINE、Jobなし

3.5-Aをreview/mergeした後、3.5-BのHTTP contractを別指示書で承認する。

## 4. Package境界

- Feedback / Post Record型、validation、port、use caseは`@bunshin/capability-social`が所有する
- Core/applicationは`capability-social`へ依存しない
- databaseはrepository adapterと原子的な結果記録transactionを提供する
- webは後続3.5-BでHTTP/UI adapterとしてuse caseを呼ぶ
- SNS/AI/LINE/Job Provider SDK型をdomainやJSONへ保存しない

## 5. 対象model

```text
MissionFeedback
  id UUID
  workspaceId
  bunshinId
  dailyMissionId
  userId
  posted YES | LATER | NO
  fitRating GOOD | NEUTRAL | BAD nullable
  comment nullable
  createdAt
  updatedAt

PostRecord
  id UUID
  workspaceId
  bunshinId
  dailyMissionId
  platform INSTAGRAM | TIKTOK | X | OTHER
  postUrl nullable
  postedAt timestamptz
  manualMetrics Json nullable
  createdAt
  updatedAt
```

- Feedbackは`workspaceId + bunshinId + dailyMissionId + userId`で1件
- LATERからYES/NOへ変更できる最新状態としてFeedbackをupsertする。回答履歴・event logは作らない
- 通常Missionは1投稿を表すためPostRecordは`workspaceId + bunshinId + dailyMissionId`で1件
- MissionFeedbackとPostRecordはDailyMissionへscope付き複合FKを持つ
- Feedback userIdは同じWorkspaceのactive Memberかつ操作actor本人だけを許可し、代理入力を提供しない
- Mission削除は未提供のためFKは`ON DELETE RESTRICT`とする

## 6. 結果操作と原子性

```text
recordPosted
  DailyMission -> COMPLETED
  MissionFeedback.posted -> YES
  PostRecord -> create（既存なら同内容を返す）

recordLater
  MissionFeedback.posted -> LATER
  DailyMission status -> 変更しない
  PostRecord -> 作らない

recordSkipped
  DailyMission -> SKIPPED
  MissionFeedback.posted -> NO
  PostRecord -> 作らない
```

- `recordPosted`と`recordSkipped`はMission状態とFeedback/PostRecordを単一DB transactionで更新する
- 一部だけ失敗した場合は全体をrollbackする
- COMPLETED Missionへ同一投稿内容で`recordPosted`を再実行する操作は冪等
- SKIPPED/EXPIREDから投稿完了、COMPLETEDからスキップへの変更は拒否する
- `recordLater`はGENERATED / VIEWED / STARTEDで許可し、terminal Missionでは拒否する
- YES/NO確定後にLATERへ戻さない
- fitRating/commentだけは結果確定後も更新できるが、postedとMission状態を変更しない
- PostRecordを作らずMissionだけCOMPLETEDにする新しい経路は追加しない。既存3.4 repositoryの直接遷移は内部portとして残すが、3.5の手動結果use caseからは使用しない

## 7. 入力制約

### Feedback

- posted: `YES | LATER | NO`
- fitRating: `GOOD | NEUTRAL | BAD`またはnull
- comment: nullまたはtrim後1..1000文字。空文字はnull
- actorUserIdをuserIdとして保存し、request body相当からuserIdを受け取らない
- resource ID、timestamp、status、workspaceId/bunshinIdの上書きを許可しない

### Post Record

- platform: 既存`SOCIAL_PLATFORMS`を再利用する
- postUrl: nullまたはHTTPS URL、最大2048文字。credential、token、署名付きURLを許可しない
- postedAt: 有効なISO 8601 offset付き日時。未来許容幅は5分まで
- MissionにSocial Profileがある場合、platformはそのProfileと一致させる
- Social ProfileがないMissionでは明示platformを必須にする

### Manual metrics

```json
{
  "views": 0,
  "likes": 0,
  "comments": 0,
  "shares": 0,
  "saves": 0
}
```

- 全fieldは任意だが、object指定時は1項目以上を必須にする
- 値は0以上、JavaScript safe integer以下の整数
- unknown field、負数、小数、文字列、null値を拒否する
- nullはmetrics未入力を表し、0件と区別する
- patchは渡されたfieldだけを既存値へmergeし、明示nullでmanualMetrics全体を未入力へ戻せる
- capturedAt、provider payload、自動取得/手動の混合集計、派生率は保存しない

## 8. Capability / authorization

- read: active Workspace Memberかつ対象Bunshinへアクセス可能なら許可する
- 結果記録、Feedback更新、metrics更新: actor本人、既存Bunshin管理policy、ACTIVE SOCIAL Assignmentを必須にする
- SOCIAL未割当は`NOT_FOUND`、SUSPENDED/LOCKEDは`FORBIDDEN`
- archived Bunshin、inactive Workspace/Memberへの全操作を拒否する
- Assignment停止後もFeedback/PostRecordを削除せずreadを許可する
- Platform Admin overrideと他User代理入力を追加しない

## 9. Repository / Use Case

```text
MissionResultRepository
  recordPosted
  recordLater
  recordSkipped
  updateFeedback
  updateManualMetrics
  findFeedback
  findPostRecord
  listPostRecords

RecordMissionPosted / RecordMissionLater / RecordMissionSkipped
UpdateMissionFeedback / UpdatePostRecordMetrics
GetMissionFeedback / GetPostRecord / ListPostRecords
```

全methodは`workspaceId + actorUserId + bunshinId`を必須とし、個別操作は`dailyMissionId`を必須にする。裸のFeedback/PostRecord IDだけで操作しない。

- PostRecord list: `postedAt DESC, id DESC`
- readはMissionと同じtenant/Bunshin scopeを維持する
- PostRecordのplatform、postUrl、postedAtは作成後immutable。訂正/削除は対象外

## 10. 必須DB制約

- Feedback `(workspaceId, bunshinId, dailyMissionId, userId)` unique
- PostRecord `(workspaceId, bunshinId, dailyMissionId)` unique
- DailyMissionへのscope付き複合FK
- Feedback userIdからWorkspace Membershipへのscope付きFKまたは同等のDB整合性
- posted / fitRating / platformはenum
- comment `VARCHAR(1000)`、postUrl `VARCHAR(2048)`
- manualMetricsはJSONB。shapeはdomain validationに加えてPostgreSQL CHECKでobject/nullを保証する
- tenant/Bunshin/date/user検索用index

## 11. 3.5-A 必須テスト

1. posted / fitRating / platform enum、comment、HTTPS URL、postedAtを検証する
2. manualMetricsのunknown field、負数、小数、文字列、空objectを拒否する
3. nullと0件metricsを区別し、partial mergeと明示clearを確認する
4. cross-user、cross-workspace、cross-bunshin、archive済みBunshinを拒否する
5. SOCIAL未割当、SUSPENDED、LOCKEDでmutationを拒否し、停止中もreadできる
6. Feedback actorがMissionのWorkspace Member本人へ固定され、代理userIdを入力できない
7. 別BunshinのMissionへFeedback/PostRecordを作れない
8. 同一Mission/UserのFeedbackが増殖せず、LATERからYES/NOへ更新できる
9. 同一MissionのPostRecordが増殖せず、別Missionでは作成できる
10. Social ProfileありMissionでplatform不一致を拒否する
11. posted YESでMission COMPLETED、Feedback YES、PostRecordが原子的に保存される
12. posted NOでMission SKIPPEDとFeedback NOが原子的に保存される
13. LATERでMission状態が変わらずPostRecordが作られない
14. transaction途中失敗時にMission/Feedback/PostRecordの片方だけ残らない
15. terminal状態の不正遷移を拒否し、同一recordPostedを冪等にする
16. fitRating/comment更新がposted、Mission状態、PostRecordを変更しない
17. list順序とtenant/Bunshin scopeが安定している
18. SNS SDK、Provider response、自動metrics、AI、API/UI、LINE、Jobが追加されていない

## 12. Migration / Rollback

- Daily Mission migrationの後へ追加する
- CIで空PostgreSQLへ全migrationを適用する
- Productionへ自動適用しない
- rollbackはデータ退避後、Feedback/PostRecordのFK、table、enum/index/checkの依存順を考慮したforward-fix migrationで行う
- 適用済みmigrationを編集しない
- Production適用前にbackup/restore手順を確認する

## 13. 対象外

- HTTP API、UI、Today画面、投稿完了画面
- SNS OAuth、SNS API投稿、投稿削除・訂正、Provider SDK
- metrics自動取得、webhook、polling、集計、分析、ランキング
- AI planner / generator / quality checker、Prompt、generation log
- scheduler、notification、LINE、Deep Link、Job、worker、retry
- Feedback履歴、PostRecord複数件/Mission、cross-post
- embedding、Memory抽出、BLOG Capability

## 14. 完了条件

- 本指示書とD-029が承認済み
- 3.5-AはFeedback / Post Record Core Persistenceだけを実装する
- Mission状態、Feedback、PostRecordの原子性とtenant/Bunshin/Capability境界をPostgreSQL integration testで実証する
- migrationを空PostgreSQLへ適用できる
- lint、format、typecheck、unit、integration、buildが成功する
- implementation reportを作成し、対象外機能を実装しない

## 15. 承認事項

- [ ] 3.5-A Core Persistenceと3.5-B API/UIを別PRにする
- [ ] FeedbackはMission/Userごとの最新状態1件とし、LATERからYES/NOへ変更可能にする
- [ ] 通常MissionのPostRecordは1件に限定する
- [ ] YES/NOとMission状態、Feedback、PostRecordを同一transactionで記録する
- [ ] LATERではMission状態を変更せず、PostRecordを作らない
- [ ] manualMetricsを5つの非負整数fieldへ限定し、自動metricsと混在させない
- [ ] Assignment停止中もreadを許可し、mutationだけ拒否する
- [ ] SNS API投稿、自動metrics、AI、LINE、BLOG、Jobを実装しない
