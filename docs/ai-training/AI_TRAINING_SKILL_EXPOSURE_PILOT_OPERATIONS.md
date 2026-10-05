# AI研修 Skill Exposure Pilot 運用設計

日付: 2026-10-05（Asia/Tokyo）

状態: Review proposal / 対象未確定 / 本番有効化未実施

## 1. 目的と現状

現在Missionで「困った」を選んだ参加者に、元のlearning objectiveを保った承認済みSkillを提示し、Mission完了へ進めるかを限定運用で確認する。支援文の生成数ではなく、実行可能な次の一歩と、その後の完了を人間がレビューする。

PR #1135〜#1137で保存、管理者操作、限定Exposureを実装し、release PR #1138のproduction commit `28782a5f27bd22a62f0e1f101330913a041a7844`で本番反映した。migration、schema readiness、公開healthと[Production Health Smoke](https://github.com/team478a/bunshin-platform/actions/runs/37281450400)は成功している。これはPilot参加者への提示やOutcomeの証明ではない。

本書は運用条件の提案であり、対象の選定、Skill承認・有効化、Exposure設定変更は実施していない。文書PRのマージを本番開始承認とみなさない。

## 2. 開始前に確定する記録

運営管理者は次の項目をアクセス制限された運用記録へ保存する。実参加者ID、認証情報、回答本文をRepositoryへコミットしない。未確認項目は`UNKNOWN`を維持し、開始しない。

| 項目           | 開始条件                                                                      |
| -------------- | ----------------------------------------------------------------------------- |
| 承認者・担当者 | 対象ServiceのACTIVEなSERVICE_OWNER / SERVICE_ADMIN、停止担当と代行者を指定    |
| 所有境界       | WorkspaceとServiceを1つに固定                                                 |
| Program        | ACTIVEなAI_TRAINING_V1 ServiceProgramとProgram Template Versionを1つに固定    |
| 適用対象       | Mission、learning objective、assignment variant、Skillを各1つに固定           |
| Skill版        | 承認済みversion、validation policy、content digest、activationを照合          |
| 参加範囲       | 既存の招待限定Programで対象参加者と人数を確認し、参加者に支援内容と期間を説明 |
| 期間           | 提示開始・終了、追跡終了の日時をJSTとUTCで記録                                |
| 観測条件       | 本書の件数・非表示条件・除外・停止条件を承認、変更時は別版として記録          |
| 証跡           | production SHA、health、管理操作監査、非本番の提示・停止確認を記録            |

現行ExposureはServiceProgramのbindingであり、参加者個別allowlist、人数上限、期限の自動停止を持たない。既存Programの参加範囲で限定できない場合は開始を保留する。人数や期限を実装済みの強制Gateとして報告しない。

## 3. 観測条件の提案

提示期間は14日間、最後の提示から最大7日間を追跡期間とする。各Assignmentの観測終端は、最初のExposureから7日後とEnrollment終了日時の早い方。提示期間終了時にbindingを解除し、追跡のために新規提示を続けない。

最初の対象は招待済みの5〜10人を提案する。Outcome Review検討の最低条件は、同一scope / Skill version / activationの観測終端に達した10 Assignment以上、かつdistinct参加者5人以上とする。これは探索的レビューの最低条件であり、統計的有意性や匿名化の保証ではない。件数不足では期間を自動延長せず、判定保留で終了し、再実施を人間が判断する。研修期間を延長したり、「困った」の入力を促して件数を作らない。

Baselineは同一Service / Program版 / Mission / variantの開始前14日間に記録されたHELP_REQUESTED Assignmentを候補とする。最初のHELPから7日またはEnrollment終了まで追跡し、Skill ExposureのあるAssignmentはBaselineへ混在させない。比較には同じ最低件数・人数と読取完全性が必要であり、未達なら比較不能とする。異なるProgram、Service、Skill版を混ぜて補わない。

BaselineとPilotは非ランダム化の異なる期間である。受講者や状況の違いを除けないため、完了率差をSkillの因果効果や成功保証として扱わない。数値の採否閾値は本書では設定せず、十分なEvidenceを得た後に継続・停止・改訂を人間が判断する。

## 4. 開始・停止手順

1. 非本番で、承認直後はSUSPENDED、activationだけでは提示されないこと、binding有効時の提示、binding解除とSUSPEND後の新規提示停止を確認する。別scope・期間外・対象variant不一致も確認する。
2. 対象Serviceの`/s/{serviceSlug}/manage/training/skills`でreview packageを確認し、承認操作を行う。Problem / Draft期限、Feasibility、Validation、Program版、Mission、objective、variant、revisionを再照合する。
3. Skill versionを明示activateする。承認操作と同一視せず、担当者と操作監査を記録する。
4. 対象ServiceProgramに1つだけExposure bindingを設定し、Program版と適用対象を再確認する。通常利用で「困った」を選んだ時に限って提示されることを確認する。
5. 担当者が提示期間中、毎営業日にhealth、binding、Skillの現在版、運用上の問題を確認する。新しいJobや自動通知は追加しない。
6. 終了日時にbindingを解除し、解除後の新規HELPで汎用ヘルプへ戻ることを確認する。対象SkillをSUSPENDし、監査を記録して追跡期間へ移る。

DISABLE_EXPOSUREは指定Skillのbindingを解除する。ほかのbindingが残る場合、Program全体のenabledはtrueのままである。単一bindingを開始条件にし、停止時は対象bindingがないことを確認する。既に返されたstepsや表示済み画面を撤回できる保証はなく、停止は以後の新規提示に対するものとして記録する。

## 5. 即時停止と再開

次のいずれかを確認したら、対象SkillをSUSPENDして新規適用を止め、Exposure bindingを解除する。管理操作が失敗した場合は停止成功と報告せず、担当者へ対応を引き継ぐ。

- 別Workspace / Service / 参加者の情報提示、回答・機微情報・秘密情報の露出
- 不一致のProgram版・Mission・objective・variantにSkillが提示された
- 未承認version、停止済みSkill、無効bindingで提示された
- 監査保存失敗があるのにstepsが返された、停止後の新規提示が続いた
- 支援手順に実行危険性がある、元の学習目的を変更している
- healthの異常、担当者不在、予定期間終了、対象参加範囲を維持できない

停止理由と操作監査だけを限定記録へ残し、回答・stepsを障害ログへ複製しない。履歴削除や旧Deploymentへの切戻しをSkill rollbackとして使わない。再開は原因確認、現行認可・version再検証、担当者による再承認後に明示操作する。rollbackは既存の5互換軸が全てPASSEDの場合だけ行い、UNKNOWNは保留する。

## 6. Outcome Reviewへ渡す仕様

最初のTRAINING_SUPPORT_SKILL_PRESENTEDをAssignmentの起点とし、同じAssignmentへの再提示は分母を増やさない。同じ参加者の複数Assignmentとdistinct参加者数を分ける。提示Eventはサーバー側の記録であり、端末の閲覧や理解を保証しない。

Primary Outcomeは観測終端までのMISSION_COMPLETED数 / 観測終端に達したExposure Assignment数。再HELP、MISSION_SKIPPED、Skill停止・rollbackを併記する。実務利用結果とSkill評価変化は任意のSecondary Outcomeとし、未回答を成功や失敗に補完しない。

未来のread-only集計は現在のService管理権限を再認可し、固定scope・期間を完全に読めた場合だけ結果を返す。読取打切り、削除・欠測、境界不明、途中のSkill版変更があれば、欠測を0にせず判定保留にする。退会・終了・途中停止を黙って分母から落とさず、追跡不能を区別する。実装前に重複、期間境界、削除、未成熟、版変更、停止後の結果をテストする。

全体と各表示群にdistinct参加者5人以上を要求し、成功・非成功などの非ゼロ小セルが5人未満なら関連する件数・率・補集合も一括非表示とする。参加者別表示、自由な細分化、個票ID、CSV、本文・回答・Memoryの取得は追加しない。差分からの再識別もレビューし、5人という値だけで匿名化済みとしない。

適用拒否やValidation mismatchは現行Eventだけでは全件捕捉できると証明されていない。提示Event数から拒否率や全HELPの提示成功率を推測しない。安全な読取経路・捕捉範囲・privacy条件が承認されるまで、Outcome値は未測定のまま保持する。

## 7. 完了・次Phaseの条件

本作業の完了は運用設計の人間レビューまでとする。対象と担当者の実名・実ID、開始日時、実参加範囲、非本番通し確認、本番有効化は未実施である。

十分な観測期間と最低件数を満たし、完全な読取・少数データ保護を確認できた後、Outcome Reviewのread-only集計を独立PRで検討する。Provider / Codex API、課金、自動生成・採用・改善、共通Core化、ハッシー横展開は対象外とする。

参照: [Skill Lifecycle V1設計](AI_TRAINING_SKILL_LIFECYCLE_V1_DESIGN.md)。
