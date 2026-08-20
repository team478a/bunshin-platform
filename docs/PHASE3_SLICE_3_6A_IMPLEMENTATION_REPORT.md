# Phase 3 Slice 3.6-A Mission Decision / Activity Core Persistence 実装報告

## 目的

DailyMissionの作業進行状態と、ユーザーの採用判断・行動履歴を分離して保存する。FREE MVPで採用率とCopy率を別々に計測できる永続化境界を先に確立する。

## 実装範囲

- `MissionDecision`必須1対1resource
- `PENDING | ACCEPTED | REJECTED`
- 不採用理由とOTHER任意詳細
- append-only `MissionActivity`
- `VIEWED | ACCEPTED | REJECTED | COPIED_*`
- actor単位の必須idempotency key
- event別strict metadata validation
- repository / use case / unit test / database integration test
- 既存MissionのPENDING backfill

API、UI、clipboard、PostRecord、Feedback、AI、LINE、Jobは実装しない。

## Decision

Mission未作成をPENDINGと解釈せず、すべてのMissionにDecision rowを必須化する。新規MissionはMission/Content/Decisionを同一transactionで作成し、既存MissionはmigrationでPENDINGへbackfillする。

Decision rowは現在値を保持し、判断変更履歴はActivityへappendする。ACCEPTEDは不採用情報を持たず、REJECTEDは理由を必須とする。`rejectionDetail`はOTHERの場合だけ任意で許可する。

## Idempotency

Activityの`idempotencyKey`は必須とし、次をDB unique constraintにする。

```text
workspaceId + bunshinId + actorUserId + idempotencyKey
```

同じkey・Mission・event・metadataの再送は既存結果を返す。同じkeyを異なるeventやmetadataへ再利用した場合はCONFLICTとする。Decision更新とACCEPTED/REJECTED Activity作成は同一transactionで行う。

## Metadata

本文、Knowledge、Memory、credential、Provider payloadは保存しない。

- `COPIED_SLIDE`: `slideIndex`だけを任意保存
- その他の3.6-A event: metadata禁止

画像制作指示専用eventは今回追加しない。後続Copy UXで実際の操作粒度を確認してから、forward migrationとして判断する。

## Isolation

- 全resourceをWorkspace/Bunshin/DailyMission複合FKで拘束
- readはactive Memberかつ対象Bunshinへアクセス可能なUserだけ
- mutationは既存Bunshin管理policyとACTIVE SOCIAL Assignmentが必要
- cross-workspace / cross-user / cross-bunshin / archived BunshinはNOT_FOUND
- Activity actorはverified session由来Userだけを想定し、API bodyから受け取らない

## Migration

`20260820120000_mission_decisions_activities`

- 3 enum、2 table、unique/index、複合FKを追加
- 既存DailyMissionをPENDING Decisionへbackfill
- migration履歴は書き換えない

Rollbackが必要な場合は、先に`mission_activities`、次に`mission_decisions`を削除し、最後に3 enumを削除する。Production適用前に通常のbackup/restore手順を確認する。

## 対象外

- authenticated API/UI
- clipboard、copy button
- PostRecord / Feedback / Outcome
- regenerate / Memory反映
- SNS OAuth / Publishing / Analytics
- AI Provider / LINE / scheduler / Job
