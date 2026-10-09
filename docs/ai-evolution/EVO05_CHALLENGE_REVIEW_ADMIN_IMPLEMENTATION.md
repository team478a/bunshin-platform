# EVO-05 題材レビュー保存・取消（R3先行）

## 基準と範囲

- 基準main: `693a28a89e7136ab5dc1215e0dad29f65a33bd8a`（#1198 merged、main CI成功確認）。
- branch: `codex/ai-evolution-evo05-challenge-review-admin`。
- commit: 本報告を含むPRのhead。
- server-only Repositoryの認可・レビュー保存・取消・履歴投影。HTTP/session composition、UI、実際の人間レビュー操作、Assignment Bridgeは未接続。

## 調査・再利用

既存Definition approvalは題材の承認正本ではないため変更しない。#1198のstrictレビュー記録・資料serializer、既存ProgramAuditLog、PersonalLearningPreparationAuthority、Groupロックと専用Pilot停止中の準備認可を再利用した。

既存Serviceの境界はGroupであり、レビュー記録の`serviceId`にはGroup IDをserverが設定する。特定Programもauthority/resource identityと監査metadataで固定し、別Programで再利用しない。

## 最小操作

`PrismaReproductionChallengeReviewAdminRepository`:

- `read(actorUserId, reference)`: 固定合成資料、server計算SHA-256、server commit、CAS revision、bounded履歴、現在の**記録判断**を返す。GETによる保存なし。
- `change(actorUserId, command)`: APPROVE / REJECT / REVISION_REQUIREDの記録、またはREVOKEを追記する。専用confirmationとbounded証跡keyが必須。actor、時刻、Service、review IDはserver側で固定。callerの任意reviewer/本文/authorityは受け付けない。
- APPROVEは6項目trueを必須とし、資料/version/commit不一致は拒否。REJECT/REVISION_REQUIREDは不十分な確認項目も記録可能。REVOKEは直前のAPPROVEに限り、チェック項目nullと専用確認を必要とする。過去記録を上書き・削除しない。

constructorのauthority、deployedCommitSha、guardとactorはtrusted server compositionが供給する。commitはレビュー対象コードと対応する40桁SHAを必要とし、client bodyから選ばせない。Repository自体はgit/deployment metadataを検証しないため、その正しい結線は後続Gateである。

## 認可と安全Gate

毎回、再送も含めACTIVE Workspace/Group/User/所属、SERVICE_OWNERまたはSERVICE_ADMIN、authority完全一致、専用AI_TRAINING Program、SUSPENDED、Pilot OFF、LINE通知OFF、allowlistのEnrollment整合、同Serviceの他AI Training Programなしをtransaction内で検証する。

guardをtransaction前・認可後・書込前・書込後に確認する。guard変更による例外はtransactionをrollbackする。HTTP認証を実装したわけではなく、認証済みactorとのcompositionは未実装。管理者が本人レビューを行ったことの宣言を記録する仕組みであり、AIやclientの申告だけから実人間と自動証明するものではない。

## 保存正本・CAS・再送

新schemaを作らず、レビュー判断という事実を既存`program_audit_logs`へ追記する。resourceTypeはREPRODUCTION_CHALLENGE_REVIEW、actionはREPRODUCTION_CHALLENGE_REVIEW_RECORDED。本文ではなく、版付き参照・確認・digest・判断・actor・時刻・operation fingerprintだけを保持する。Definition本文/題材本文/Answer/相談本文を保存しない。PlanをEventへ保存する設計とは異なる。

Group FOR UPDATE＋Serializableで同時操作を直列化し、履歴の連続revision・previous token・fingerprint・actor/参照を検証する。JSONBのkey順序に依存せずcanonical hashを使う。時刻が直前以下なら推測補正せずCONFLICT。P2002/P2034もCONFLICTとしてcallerに再読込を要求する。

operation UUIDが既存なら同内容・同actor・同resource履歴だけ再送扱い。現在資料/commit/認可を再確認する。取消後の古いAPPROVE再送は現在REVOKEを返し、過去承認を復活させない。

通常履歴は100操作で止め、最後の取消用に1枠を予約する。102行取得で打切りを検出し、未知版・欠損・破損・過大履歴を推測採用しない。これは小規模レビュー用制約で、拡張/保持運用は別設計。chainはDB内の整合性検査であり、特権DB改竄に対する電子署名ではない。監査削除・retentionによる欠損を補完しない。

## 実行許可との分離

`recordedDecision: APPROVE`も、現状の実行許可ではない。資料/commit変化でreviewBindingはUNKNOWN。全応答で`executionPermission: NOT_GRANTED`。

R1の9fixturesは全DRAFT、レビュー票はNOT_REVIEWEDのまま。R1 resolver/R2比較を変更しない。Definition承認、Pilot enable、学習Provider、Assignment作成、Level認定は起動しない。新しい承認読取をRuntimeに結線していないため、今回のマージで再現課題が利用可能にはならない。

## 検証

- capability-training: 29 files / 465 tests成功。R1/R2、Learning First、Scope/Profile/Goal/Plan/Consultation/Router/Guided Practiceの回帰を含む。
- database全unit: 195 files / 950 tests成功（新規review admin 21 tests）。通常100操作＋取消用1枠、strict validation、履歴整合、資料/commit、再送、取消後再送、認可失効を確認。
- database実PostgreSQL統合: 182 tests成功（新規4 cases）。JSONB順序、同revision競合で1件のみ保存、Service/Workspace/Program越境、非管理者、Program稼働・所属取消後の拒否、write後guard例外の実rollbackを確認。
- database `tsc --noEmit` / `tsc -p tsconfig.build.json`、変更ファイルlint、architecture:check / 境界test 10件、変更ファイルformat / diff check成功。schema変更がないため既存生成済みPrisma clientを使用した。root全体typecheck/lint/test/buildとintegrationの最終head検証はPR CIで確認する。

使い捨てPostgreSQL16 containerを今回新規作成し、task label・完全ID・loopback `127.0.0.1:18998`・run限定DB/markerを照合した。既存233 migrationsはこの隔離DBだけへ適用。既存integration preflightを維持したまま統合試験を行った。本番DB/本番資格情報/実ユーザーは使わない。

初回のfake test lint（type import / awaitなしasync）を修正して再実行成功。初回実DB統合は2件失敗し、テスト側の全Service countを対象scope限定へ修正、所属REVOKED fixtureに既存CHECKが必要とするrevokedAtを追加した。assertionのskipや本番制約の変更はせず、全統合試験を再実行して182件成功した。

実人間レビュー、実認証session/HTTP、production RLS/権限、運用保持、実APIは未検証。合成テストのAPPROVEは実承認ではない。

## 変更ファイル

- `packages/database/src/reproduction-challenge-review-admin.ts`
- `packages/database/src/index.ts`
- `packages/database/test/reproduction-challenge-review-admin.test.ts`
- `packages/database/test/personal-learning-persistence.integration-cases.ts`
- `docs/DECISION_LOG.md`
- 本報告

## 未実装・引継ぎ・rollback

認証済み管理操作HTTP/最小UI、server commitのdeployment正本との結線、実人間レビュー実行、Runtimeでの承認利用・取消反映、R3/R4は未実装。次は認証済み操作入口を別PRでレビューし、題材の実承認は人間の別操作とする。保存記録を合格や本人の習得Evidenceへ変換しない。

schema/migration/Provider/モデル/LINE/OEM/既存学習仕様/本番設定変更なし。今回の書込は新規使い捨てローカルDBの合成テストのみ。Production接続/Migration/deploy/APPROVE/Pilot/参加者操作なし。

rollbackは本PRのrevert。将来の保存データがある場合も監査履歴は削除せず保全し、Runtime未接続を維持する。DB rollback不要。
