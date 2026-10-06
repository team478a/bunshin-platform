# P1-F Personal Learning Pilot UI / API

## 基準・範囲

- 基準main: `e663bbc30f40c994c3f628ee8a14f08fde2afccc`（P1-E #1151）。
- branch: `feat/personal-learning-pilot-ui-v1`。
- commit: 完了時のPR headを参照（自己参照SHAを文書へ埋め込まない）。
- 設計判断: [P1-F ADR](ADR_P1F_PERSONAL_LEARNING_PILOT.md)。最新の人間指示に従い、旧Implementation Planの期間互換を扱うP1-Fではなく、限定Pilot UI/APIだけを実装する。期間モデル変更は対象外。
- ユーザー指示書は完了条件12「評」で途切れている。見えている1〜46節の範囲で実装・検証し、末尾の未提示条件を満たしたとは主張しない。

## UI Flow

既存本人Programページで専用Programを判別し、限定参加者だけPersonal Learningを表示する。スマートフォン優先の既存classを利用し、通常30日V1は既存カードのまま。

学習希望 → Scope / 短い選択式質問 → Goal候補 → 「これを学ぶ」 → Goal保存 → Draft Plan → **別CTA「このプランで学ぶ」** → 今日の学習 → 既存Missionカード / 回答 → 既存評価カード → 次の学習。

相談はブラウザメモリ内の最大3問bounded replayだけ。戻る・希望変更で未確認候補を破棄する。Goal以降はログアウト・再読込後も既存保存正本から復元する。Goal確認後にPlan準備通信が失敗しても、確認済みGoalから再準備できる。相談本文をそのために保存しない。

Planは版固定参照のまま、表示は「AIへの指示の基本構造 / 必要な背景情報の伝え方 / 条件の指定方法」。内部key/versionをラベルへ出さない。前のステップの完了表示はBridgeが選択した現在Definitionより前の経路に限定し、Profile scoreから推測しない。最終完了表示にはRouterのPLAN_COMPLETEDが必要。

NEXT / REVIEW / RETRY / BLOCKED / UNKNOWN / PLAN_COMPLETEDは固定の日本語へmappingする。完了は研修修了・Goal達成・契約終了ではない。未対応テーマはP1-DのDefinition Gapを表示し、新しいDefinitionは作らない。

## API / Auth / Tenant Boundary

`/api/services/[serviceSlug]/ai-training/enrollments/[programEnrollmentId]/personal-learning`

- GET: 保存済みGoal/Plan、最新Planの本人Assignment、準備状態を取得。GETでAssignment作成・確認・Router実行をしない。
- POST: `CONSULT / CONFIRM_GOAL / PREPARE_PLAN / CONFIRM_PLAN / NEXT / FEEDBACK`。strict Zod、same-origin、JSON、既存認証、private/no-store。
- user/workspace/group/membershipは既存CurrentUserProvider / MemberServiceからserver解決。Enrollmentは本人のACTIVE所属と有効期間に限定。クライアントscope、任意Definition refs、candidateKeyだけの確認を拒否する。
- 保存とBridgeは専用gated Repositoryを使う。Enrollment lock / Serializable / 5軸scope / User・Service・所属の有効性・削除済みgateを再検証し、専用Program設定もtransaction内でFOR SHAREする。
- API失敗時は本文や生の例外を表示/logしない。内部logはrequestId、固定error code / Router status・reasonだけ。

## Feature Flag / 30日V1分離

標準で無効。`APP_ENV=development`または`staging`、`PERSONAL_LEARNING_PILOT=true`が必要。productionではflagがtrueでも拒否する。

さらに専用ServiceProgram設定が必要:

```json
{
  "moduleKey": "AI_TRAINING_V1",
  "personalLearningPilot": {
    "enabled": true,
    "enrollmentIds": ["<人間が承認した専用Enrollment UUID>"]
  },
  "trainingOperations": {
    "notificationsEnabled": false,
    "postponedReminderEnabled": false
  }
}
```

allowlistは重複なし1〜5件。本人Enrollmentと完全一致が必要。既存Program settingsの他の必要な設定は維持する。**この例は設定変更の実施ではない。**

`personalLearningPilot`の存在だけで専用Programを予約する。flag停止・設定不正・参加者対象外でも旧V1へfallbackしない。旧Runtimeのstate / candidate / persistDecisionと旧Profile保存はこのProgramを拒否する。通常V1にはこのmarkerを追加しない。旧V1ユーザーを移行/backfillしない。既存の回答・操作・評価APIも専用Programの場合は非本番flagと本人allowlistを再検証する。

LINEコード・Schedulerは変更しない。既存通知停止設定を必須にし、旧Runtime選定も拒否する。Pilotは既存V1 Programへ後付けせず、通知Jobや旧Assignmentがない専用Program / Enrollmentで開始する。

## Consultation / Goal / Plan接続

P1-A/P1-Dをserverで再実行。ProfileはP1-B投影。既知情報を再質問せず、UNKNOWNをNONE/BEGINNERへ変換しない。CONTENT_REQUESTは本人が「学ぶ方法を選ぶ」と選んだ場合だけ新しい学習希望へ変換する。CONSULTINGを学習Goalへ変換しない。

Goal確認はP1-C-Sの現在Profile・候補・意味版・承認参照の再検証を利用し、ProgramMemberGoalを正本とする。既存ACTIVE Goalの暗黙置換はしない。

Plan準備は人間確認済みGoalに対する明示POST。P1-Dの4つの既存Prompt目標との**完全一致**で既存参照経路を復元する。本文の意味を推測しない。未対応・改変・承認不足は停止する。Plan IDはGoal IDに対して決定的に固定し、既存savePlanのidempotency / CASを利用する。同時通信が競合しても上書きしない。Draft Planを自動確認しない。

既存Profileがない場合は準備中表示とし、初心者を捏造して保存しない。既存Profileの事前準備はPilot開始前Gate。新Profile UIや巨大JSONは作らない。

## Router / Mission / Assessment

P1-Eの現在Confirmed Plan、最新revision、ACTIVE Goal/Enrollment、APPROVED Definition、前提・版付きAssessment / Skill evidenceのgateをそのまま利用する。3Definition以外へ拡張しない。

既存`AiTrainingMissionCard`と`AiTrainingEvaluationCard`を再利用する。PilotではBarrier変更・Goal見直し・Toolkit保存・業務成果アンケートを出さず、次の学習に集中する。既存V1の表示はデフォルトのまま。

回答保存 / 評価取得・再試行は既存answers / evaluate API、既存評価Jobへ接続する。新Provider・評価基準・Promptは追加しない。専用Programは評価Job登録・実行・Provider呼出し直前にも非本番flagとallowlist/通知停止設定を再確認する。P1-E Assignmentの回答送信時だけ、同じEnrollment lock / Answer transactionでPRESENTED→STARTEDの事実を記録する。架空のHint/Help Eventを作らず、既存V1の状態遷移を変更しない。

既存評価にはProvider呼出しがある。**本作業では実課金APIを呼んでいない。** 新規Providerがないことと、Pilot評価が無課金であることは同義ではない。運用開始前に既存評価利用・費用・情報送信条件を別途承認する。

## Analytics / Feedback / Privacy

新Analytics基盤/tableは作らない。既存ProgramActionEventへ固定status / questionCountだけの`PERSONAL_LEARNING_PILOT_CONSULTATION`を再送重複なしで記録する。相談本文・回答・Profile経験・candidateKeyをmetadataへ入れない。

学習後の「自分に合っていましたか」はFIT / NEUTRAL / NOT_FITのみ。`PERSONAL_LEARNING_PILOT_FIT`を本人の評価済みAssignmentに一度記録する。自由記述は追加しない。既存Program個人データ削除/ExportのEvent責務に属する。

限定scope内で人間が以下を確認できる最小Evidenceを残す（自動Dashboardは未追加）:

| 指標             | Evidence / 分母の注意                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------ |
| Goal候補採用率   | GOAL_CANDIDATE経験Enrollmentに対するPERSONAL_LEARNING_GOAL_CONFIRMED。再送・同じ本人を重複集計しない         |
| 学習開始率       | Plan確認者に対するBridge提示 / startedAt / ANSWER_SUBMITTED。提示と実回答を区別する                          |
| Definition完了率 | 現行Plan revisionの必要参照に対する検証済みAssessment・Assignmentの完了。同Missionの別Definitionをまとめない |
| REVIEW / RETRY率 | PERSONAL_LEARNING_ASSIGNMENT_BRIDGEDのstatus。試行と本人・Definitionを分けて集計する                         |
| Plan完了率       | 確認済みPlanに対するPERSONAL_LEARNING_PLAN_COMPLETED                                                         |
| Definition Gap率 | 終端相談判断（候補/Gap/対象外）に対するLEARNING_DEFINITION_GAP。質問途中を分母へ混ぜない                     |
| 自分に合っていた | FIT / NEUTRAL / NOT_FIT。未回答は中立として補完しない                                                        |
| 離脱地点         | 最新の構造化状態 / Eventで未完了段階を人間確認。ブラウザ終了そのものを検知したとは扱わない                   |

既存管理画面は参加者・進捗・最終利用等を持つが、Goal/Plan revision/Definition Gap/専用error一覧は不足。新Adminは作らずGapとする。少人数の結果を他Tenantと合算せず、学習時間や点数だけで効果を断定しない。

## Definition Approval / Migration / Pilot開始前Gate

今回schema / migration追加なし。P1-C-S migrationを本番へ適用する操作は行っていない。本番の適用済み証拠も本作業では取得しておらず、別Gateで確認する。隔離使い捨てDBに既存228 migrationsを適用して検証した。3 review fixtureを本番APPROVEDへ昇格させない。承認seed/backfillもない。

開始前に人間が別途実施・確認すること:

1. stagingのDB・認証・情報取扱い・評価費用・rollback先を指定し、P1-C-S migration適用を承認する。本番へは適用しない。
2. [3 fixture](../../packages/capability-training/src/learning-definition-fixtures.ts)の固定骨格・Skill/Prerequisite/Mission/Rubric対応を教育担当者がレビューする。DRAFT/REVIEWEDをAPPROVEDとして扱わない。
3. 対象Serviceの現在ACTIVEなSERVICE_OWNER / SERVICE_ADMIN本人を確認した承認担当者が、exact packageKey + definitionKey + versionのApproval record、approvedAt / approvedByUserIdをstagingで登録する。AIによる承認操作・自動登録は行わない。現在この管理API/UIはないため、承認された管理DB操作手順を別途確定する。
4. 専用Program / 1〜5 Enrollmentと、実回答に基づく既存Profileを用意する。旧ACTIVE Goal / Assignment / 通知Jobがないことを確認する。旧V1のProfile保存APIを専用Programの初期化に使わない。
5. 人間承認した専用allowlist、通知停止、非本番flagを設定する。
6. 実認証でFlow A〜J、別User/Workspace/Enrollment、非対象者、評価待ち・失敗・再送、スマートフォン、ログアウト復元、旧V1をstagingで通す。実評価利用は別承認。実装/合成テスト成功をこのGateのPASSEDにしない。

## 検証

- capability-training: 258 passed（P1-A/B/C/D/E / Policy / Skill、限定Pilot判定を含む）。
- application: 796 passed（P1-A/B/C/CS / Program Runtime等）。
- database unit: 838 passed（旧V1 / Assignment / Auth境界等）。
- 実PostgreSQL integration: 117 passed。使い捨てDBのID・markerを確認してからfixture/cleanupを実行。P1-Fの相談・確認済みGoal・Draft/Confirmed Plan保存と、保存Plan→3つの既存Assignment→既存回答→合成既存Assessment形式→次Definition→Plan完了、開始日時・Feedback再送・旧Runtime拒否・停止・越境を追加した。PC高負荷で初回のbeforeAllが10秒を超えたため、コードの安全Gateやtransaction期限は変更せず、実行コマンドだけtestTimeout / hookTimeoutを120秒にして再実行成功。
- Web追加/評価境界: HTTP / 認証Gate / SSR UI / 既存評価期間・Job境界の5 files、37 passed。全体回帰・typecheck・lint・buildの最終結果は完了報告に追記する。
- ブラウザ: 390×844のローカル合成previewで希望入力→質問→Goal→Draft Plan→独立確認→Mission→回答→既存評価カード→次Definition / Feedbackを実操作した。入口のscrollWidth=390 / innerWidth=390、次の学習時も横にはみ出さないことを確認。合成previewは認証・本番API・実Providerを検証するものではない。
- REVIEW / RETRY / BLOCKED / UNKNOWN / 完了文言は固定mappingテスト、Router/完了条件は既存Packageと実DBの回帰で検証する。

## 変更ファイル / 未実装 / rollback

変更: WebのProgramページ、共通Mission/評価カードの任意Pilot表示、専用Pilotカード・HTTP route/handler・アクセスresolver・3テスト、Capabilityの専用設定判定/export/test、DBのgated Repository/Router/export・旧選定/Profile保護・Pilot回答開始記録・統合テスト、ADR/本報告。Prisma schema・migration、LINE、Provider設定、30日V1 Policyは変更しない。

未実装: 実staging参加開始、承認管理UI/API、Profile初期化UI、専用Admin / KPI表示、自動離脱検知、LINE、Teaching Personalization、Memory、Definition Factory、Codex、新Definition、汎用Chat。次工程の開始承認は別指示を待つ。

rollback: 非本番flagをfalseにして専用UI/API受付を停止する。専用Program markerは削除せず旧V1へのfallbackを防ぐ。旧Goal/Plan/Assignment/Answer履歴は削除しない。コードをrevertする前に、専用ServiceProgramをSUSPENDEDとして停止し、保留中の評価Jobも運営者が確認する。旧版で通常Runtimeへ戻さないよう停止状態を維持する。追加schemaがないため破壊的DB rollbackは不要。
