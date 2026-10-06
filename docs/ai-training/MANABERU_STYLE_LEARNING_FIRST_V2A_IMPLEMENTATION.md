# マナベルスタイル Learning First V2-A 実装報告

## 基準と変更範囲

- 基準main: `2c8ae2841c43949ebc05cde2d06394ef5d95e61d`（PR #1158）
- branch: `feat/manaberu-learning-first-v2a`
- commit: 本報告を含むPR head SHAを参照（自己参照SHAを本文へ埋め込まない）。
- Decision: `ADR_MANABERU_STYLE_LEARNING_FIRST_V2A.md`。
- 変更: capability-trainingの純粋契約・公開export・相談の説明文、databaseのEvidence Repository・公開export、既存Pilot HTTP / Card、関連unit / HTTP / UI / PostgreSQL integration tests、本報告とADR。

## Guided Practice / Capability Evidence

`guided-practice.ts` は `AI_TRAINING_GUIDED_PRACTICE_V1` を持つ最小契約。Teacherはマナベルスタイル、AI Toolを操作し完成させる主体は受講者。内部AI_TRAINING / Personal Learning名は維持する。

START → SELF_PROMPTED → SELF_EVALUATED → 任意SELF_REVISED → COMPLETE。COMPLETEは本人の完成・有用性確認と、既存AnswerのREADY、Assignment COMPLETED、版付きPASS Assessmentと一致するANSWER_EVALUATED監査を必要とする。相談候補や成果物要求から直接完了・Goal確定しない。CONTENT_REQUESTは既存変換確認・Goal・Plan確認を経る。CONSULTINGは既存対象外を維持する。

Capability EvidenceはGUIDED_COMPLETION / SELF_PROMPTED / SELF_EVALUATED / SELF_REVISED。外部AIへの操作は直接観測ではなくLEARNER_REPORTED。自己申告だけを習得正本にせず、保存済みPrompt評価と組み合わせる。完成品品質とCapability LevelはいずれもUNKNOWNであり、1回の修正をLevel 4認定しない。

## Support Level

GUIDED / HINTED / INDEPENDENTは支援量であり、Difficultyではない。開始時選択を保存し、既存HINT_VIEWED / HELP_REQUESTEDがあれば完了時の支援量を増やす。支援量を自動最適化するRouterは追加しない。課題本文・Hint・評価は既存機能を利用する。

## First Success / Telemetry

同一Enrollmentの最初の明示的な実践完了を、Enrollment行ロック・Serializable transaction・一意idempotency keyで1回だけ記録する。START / INTERACT / COMPLETEもAssignmentと操作種別に固定したキーで再送重複を防止する。異なるpayloadで同じキーを再利用すると拒否。

既存ProgramActionEventにPRACTICE_STARTED、CAPABILITY_INTERACTION、PRACTICE_COMPLETED、FIRST_SUCCESSの事実を追加。Goal / Plan revision / Definition版 / Assignment / Answer参照、支援量、確認、Rule version、時刻のみ。実行・Progressの正本は既存Runtimeのまま。

- First Success Rate: 対象Enrollmentを分母、FIRST_SUCCESSのあるEnrollmentを分子。削除・対象期間を別途考慮する。
- Time to First Success: 最初のPractice STARTからFIRST_SUCCESSまで。入会からの時間とは異なる。
- Sessions to First Success: AssignmentごとのSTART数。ブラウザ訪問やログインSession数ではない。
- completion / support / capability: 各完了イベントで集計可能。REVIEW / RETRY / Fitは既存Router / Feedbackを再利用する。
- Dashboard、実務利用、自力再現・Transferの認定、5段階Level Ruleは未実装。

## Privacy / Outcome境界

新規APIはstrictな列挙コマンドのみ受理し、成果物本文・相談全文・業務情報をEvidenceへ保存しない。既存AnswerはPrompt課題回答の正本であり、外部AIの完成回答を貼り付けないようUIで案内する。既存回答欄への誤入力を完全防止するDLPはない。

完了・First SuccessはAnswer source referenceを持ち、既存回答削除の対象になる。削除後、過去のFirst Successを新たに推定・再認定しないため、個人データ削除監査のあるEnrollmentでは新たなFirst Success記録を抑止する。削除後の履歴欠損はUNKNOWNとして扱い、First Successがないことを「未成功」と断定しない。開始・操作の構造化事実は通常の活動記録として残り、ALL削除では既存の全件削除・再書込拒否が適用される。

## Pilot UI / API

既存Pilot Cardに支援方法の選択、実施済み操作の記録、評価後の2つの本人確認、控えめなFirst Success表示を追加。Level数値選択・ゲームBadge・新回答システムはなし。既存Pilot endpointへPRACTICE operationとbounded読取を追加する。

Server認証・same-origin・feature flag・Allowlistを維持。Repositoryでも現行Enrollment期間、User / Membership / Workspace / Group、Pilot marker、最新CONFIRMED Plan、ACTIVE唯一Primary Goal、版一致、3Definitionの現在承認を再検証する。新規Provider実行はない。既存評価Provider直前認可、LINE隔離、V1隔離、Kill Switch、原価計測を変更しない。

## 検証

新規unit: 完了条件不足、未確認、成果物本文拒否、不正種別、支援量、能力認定非推測。HTTP: 認証済みactor使用、strict payload拒否。UI: ブランド、本人申告と最初の実践表示。PostgreSQL: 必須Evidence、再送・2回目成功、Tenant拒否、Pilot停止、操作順、支援イベント、承認取消。

既存P1-A〜P1-F / Program Runtime / Assessment / Auth / LINEの回帰とformat / typecheck / lint / buildはPR CIで検証する。最終結果はPR checksおよび完了報告を正本とする。ローカルのroot直下vitest直実行はweb専用server-only設定を読まず失敗するため、正式なworkspace testを利用する。

## 既存V1 / Productionへの影響

既存30日V1 Card・Scheduler・Goal / Plan / Router判定・Skill評価・Definition版は変更しない。Pilot専用UI/API内のみ追加。DB schema / migration / Provider / LINE / OEM変更なし。Production操作、Definition承認、Pilot enable、実課金呼出しは未実施。

今回のPRはProduction Pilot開始許可ではない。既存Production Closed Pilot Gateの未確認事項、100人Hard Cap、原価暴走対策等は従来どおり別レビューが必要。NO-GOを緩和しない。

## 未実装 / 次PR候補 / rollback

Discovery、職種別提案、Teaching LLM、Level判定、自動支援調整、Real Use / Transfer、新Definitionは次指示待ち。旧Work Result / Toolkitを単純復活しない。旧APIのPilot専用GateとV2 Evidenceへの対応は別PR候補。

Pilot停止は既存flag / Allowlist / Program markerを使用し、V1を停止しない。コードrollbackはこのPRのrevert。追加した構造化イベントは削除せず履歴として保持でき、schema rollback不要。進行中の既存Provider呼出しの即時キャンセルは保証しない。
