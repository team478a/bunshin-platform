# P1-G Personal Learning AI原価と品質の計測

## 基準と範囲

- 基準main: `9dce361ab348f2586f03890aed60fec4a67651e7`（P1-F #1152）。
- branch: `feat/personal-learning-ai-cost-observability`。commit / PR / CIは本報告を含むPRの最終headを参照する。
- [設計判断](ADR_P1G_AI_COST_OBSERVABILITY.md)。既存Assessmentの計測だけ。Provider、Model、Prompt、Quota、再試行、Learning Definition、評価基準を変更しない。
- schema / Migration / 本番Deploy / Definition承認 / 環境設定 / 実課金APIなし。元dirty checkoutと秘密値を変更しない。

## 呼び出し箇所とUsage取得

`training-answer-evaluation-job-handler.ts` → 既存`OpenAiTrainingAnswerEvaluator.evaluate` → OpenAI Responses API。現在のmodelは既存`resolveOpenAiRuntimeConfiguration`（管理設定またはlegacy環境、既存fallback `gpt-5.2`）で解決する。本変更はモデル選択へ介入しない。

Pilotの場合のみoptional observerを渡す。Provider応答のmodel、usage.input_tokens / output_tokens / input_tokens_details.cached_tokens、呼出し開始日時、検証完了までのlatencyを投影する。欠損、不正数値、cache>inputはnullへ正規化し、0を捏造しない。実Provider利用・測定は今回未実施。

successはProvider出力の構造化Validation完了を意味し、Assessment保存完了・PASS・Skill習得とは別。Validation失敗でも応答から取れたusageを記録する。HTTP 429→RATE_LIMIT、その他HTTP/通信失敗→PROVIDER_ERROR、Abort/Timeout→TIMEOUT、JSON/出力不正→INVALID_RESPONSE、schema/最終評価Validation→VALIDATION_FAILURE。予期しない未観測例外はUNKNOWN。fallbackUsed=false（評価Providerは代替生成しない）。

Provider呼出し前の認可/期間/flag拒否はAI callではない。計測を捏造しない。専用ProgramでもPlan/Definitionと結び付かないAssignmentならProvider前に停止する。旧V1ではoptional observerを使わず、既存の返却・固定request cost記録を維持する。

## Telemetry契約と保存

Applicationの`AI_CALL_OBSERVABILITY_V1`は数値、固定状態、Provider/Model識別子のみのpure contract。余分なbody field、非整数/負値/NaN、不整合な成功状態を拒否する。未実装TEACHING等を実行する仕組みはない。現行taskTypeはASSESSMENTだけ。

既存`AiUsageEvent`は共通使用量の記録を維持し、Pilotのtoken-price推定値を利用する。追加の学習関連factは既存`ProgramActionEvent`の`PERSONAL_LEARNING_AI_CALL`（schemaVersion=1）へ保存する。

Eventの専用列はWorkspace、Service/Group、Enrollment、本人、Assignment、sourceResourceType=TRAINING_MISSION_ANSWER、sourceResourceId=Answer。metadataはcontractVersion、taskType、共通usageKey、serviceProgramId、planId、planRevision、版固定Definition ref、measurement、cost/pricing snapshotだけ。Prompt versionは既存AiUsageEventに保持し、共通usageKeyでJOINできる。新しいAssessment/Plan正本は作らない。

試行キーは既存`training-evaluation:{answerId}:{jobId}:attempt:{attemptCount}`。Telemetry Eventキーはこれに固定prefixを付ける。同じ試行の再送は既存unique制約とEnrollment lockで一件、updateなし。別試行は別コスト事実として保持する。キー衝突時はEnrollment/actor/Assignment/Answer/Event種別を照合する。

DB Repositoryは5軸scope、同Service専用Program、本人AnswerとAssignment、保存Plan revisionのDefinition対応を再検証する。Enrollment lock + SerializableでPrivacy削除と競合させ、削除済み/Answer不存在には保存しない。現在の終了/停止後にも既に試行した呼出しのfactを記録できるが、新規実行のflag/認可/期間gateはworker側で維持する。

Telemetry保存はbest effort。失敗時は`PERSONAL_LEARNING_AI_CALL_PERSISTENCE_FAILED`という固定codeだけをlogし、生Errorやpayloadを出さず、AI処理を再実行しない。観測欠損は0円ではなく集計の限界として扱い、該当期間を品質/費用レビュー前に調査する。

## Pricing Registryと推定

server-only環境設定`PERSONAL_LEARNING_AI_PRICING`はレビュー済みJSON配列（最大20件）。既定は空。実価格をハードコードせず、今回設定値の登録・外部価格取得を行わない。次は**テスト用架空値**であり運用価格ではない。

```json
[
  {
    "provider": "openai",
    "model": "synthetic",
    "effectiveFrom": "2026-10-01T00:00:00Z",
    "inputPriceMicrosPerMillion": 2000000,
    "outputPriceMicrosPerMillion": 8000000,
    "cachedInputPriceMicrosPerMillion": 200000,
    "currency": "USD",
    "pricingVersion": "synthetic-v1"
  }
]
```

単価はmicro USD / million tokens（2,000,000なら$2 / million）。V1はUSDのみ。Provider/応答Modelの完全一致、occurredAt以前の最新effectiveFromで選択する。返却されるsnapshot modelを未確認のalias価格へ推測変換しない。同じProvider/Model/有効日時の重複・不正設定は固定診断と空registryへ扱い、学習Providerを失敗させない。

通常input=(input-cached)×通常単価、cached input=cached×cached単価、output=output×出力単価。BigIntで計算し、input合計/output各々をmicro USDへ切上げ、合計する。pricingVersion、effectiveFrom、通貨、利用単価をEventへ固定する。後日の価格変更で過去Eventを更新しない。

価格不明、input/output/cache usage欠損、cache>0だがcache単価不明、数値overflowはcostStatus=UNKNOWN、cost=null。既知の0 usageは0円推定と区別する。取れたusageだけで部分原価を総原価と称しない。実請求額ではなくESTIMATEDであり、消費税、為替、他機能のAI利用等は含まない。

## Analytics / KPI / Wave

[read-only集計SQL](P1G_AI_COST_ANALYSIS.sql)を用意した。許可済み運用者が対象Workspace/Serviceと期間をparameter bindingして利用する。認証API/公開CSV/大規模Dashboardは作らず、一般ユーザーの画面へtoken/model/料金を表示しない。SQLの実DB実行検証は実DB回帰と併せて記録する。

Canonical cost集計は`PERSONAL_LEARNING_AI_CALL`のみ。AiUsageEventの同じ試行を再加算しない。構造化参照で次を確認できる:

- user: 本人/Enrollment別calls、既知token小計、既知推定原価、usage/cost不明件数、latency。raw ID一覧を一般管理者へ公開しない。
- Assessment: Answer単位に全試行をまとめて原価を集計し、現在READYかつ同scopeのANSWER_EVALUATED事実とJOINする。失敗再試行の原価も含める。
- Definition: Enrollment + planId + revision + definitionKey/versionで区別。PROMPT_BASICの同じMission名だけで2Definitionを同一視しない。
- completed Definition: 検証済みAssessment/Router evidenceで完了した上記参照単位を分母とする。Provider successだけでは完了に数えない。
- completed Plan: 同Plan ID/revisionのPERSONAL_LEARNING_PLAN_COMPLETEDを分母とする。Enrollment終了とは別。
- REVIEW/RETRY: 同scope/Plan revision/DefinitionのPERSONAL_LEARNING_ASSIGNMENT_BRIDGEDの固定statusを利用する。旧版や別Enrollmentの結果を混ぜない。
- Fit: 本人/Enrollment/Assignment一致のPERSONAL_LEARNING_PILOT_FIT。未回答は未回答のまま。試行とFeedbackを直接多対多JOINせず、先に試行をAssignmentへ集約する。

原価/user、原価/Assessment、原価/completed Definition、原価/completed Planは上記既知小計と分母から算出する。ただし未計測・UNKNOWN件数を必ず併記し、完全原価と断定しない。期間またぎのPlanは観測窓内原価と全期間原価を区別する。validation/provider failure率は呼出し試行、学習PASS/REVIEW率は検証済み評価Answerを分母とし、単位を混同しない。

Waveは専用ServiceProgram IDと人間管理のWave対応を利用し、新schemaや100人allowlistを作らない。1 Programに1 Waveを対応させ、15/30/50人段階の実行設計は別レビュー。現行1〜5人gateは維持する。全100人を一度に開放せず、終了後の不具合/離脱/品質/原価レビューを開始条件とする。

## Privacyと既存V1

相談、回答全文、system Prompt、Provider response、raw Error、業務秘密、個人メモをTelemetryへコピーしない。IDは内部関連・認可に限定する。AI_CALL Eventは既存本人Training Exportのactivity timeline（種別/Assignment/日時）と既存Answer/全データ削除の対象になる。従来ExportはEvent metadata全体を出力しないため、詳細原価は内部運用集計に限定する。保持/削除/バックアップ復旧方針はPilot開始Gateで確認する。

Provider requestのmodel、Prompt version、payload、timeout、Validation、既存30日V1結果保存・進行を維持する。Pilotの利用制限、通知停止、production拒否はP1-Fのまま。新しいProvider設定、UI、LINE、Router/学習定義の変更はない。

## 検証と変更ファイル

変更: Applicationのpure measurement/pricing契約とexport/test、DBのscoped Event Repositoryとexport/unit/integration test、Webのoptional Provider observer・Pilot worker接続・価格設定/保存helper・単体/回帰test、ADR/本報告/read-only SQL。

追加テストは成功/失敗、usage欠損、cached usage、推定、未知Model、価格版/有効日時、latency、Validation、本文非保存、越境、idempotency、Assessment参照、Pilot gate、V1互換、Telemetry outageを含む。最終テスト件数・CI結果はPRで確認し、実Provider品質/Pilot開始と混同しない。ローカル全体typecheckはメモリ不足のため中止し、全体検証はCIの最終headで行う。

## 未実施 / 開始Gate / rollback

今回の完了は計測コードとPRまで。実価格の人間レビュー/設定、staging準備、Migration状態確認、Definition3版の人間承認、専用Enrollment/Profile準備、実認証Flow A〜J、Privacy/費用上限/停止担当者は[#1153 Runbook](https://github.com/team478a/bunshin-platform/pull/1153)の別Gate。実原価・実品質は未測定。

Telemetry未計測期間、Pricing UNKNOWN、削除/権限失効による保存拒否を合格で埋めない。価格の改訂は新しいpricingVersion/effectiveFromとしてレビューし、過去Eventは書き換えない。

rollbackはPilot flagを停止し、専用ProgramをSUSPENDED、保留評価Jobを人間確認してからコードrevertを判断する。markerと過去Goal/Plan/Answer/Telemetryを削除しない。新schemaがないためDB DROPは不要。旧コードへ戻した期間はP1-G計測が欠けることを記録し、0円として扱わない。Model Router、新Provider、A/B、Teaching、Factory、Codex、LINE、Definition追加、100人開放、本番操作へ進まない。
