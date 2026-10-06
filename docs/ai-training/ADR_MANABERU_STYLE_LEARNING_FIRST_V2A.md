# V2-A: 本人実践の事実と能力判定を分離する

基準main `2c8ae2841c43949ebc05cde2d06394ef5d95e61d`、#1158設計と今回の実装指示を根拠とする。

- 既存3Definition、Goal/Plan/Assignment/Answer/Assessment/Routerを維持する。新しいPractice RuntimeやDB modelを作らない。
- 1 Assignmentの実践開始を1 Practice Sessionと定義する。ブラウザ訪問sessionとは別。開始/操作申告/完了/First Successを既存ProgramActionEventへ版付き・本文なし・append-onlyで記録する。
- 本人の明示開始、AI操作と結果確認の申告、本人の既存Answerと同版PASS Assessment監査、役立つ結果を自分で完成した確認を必要とする。外部Tool操作は自己申告であり、直接観測したとは表示しない。AssessmentはPrompt評価であって完成品品質/能力Levelの認定ではない。
- Support Levelは本人が選んだ支援方式と既存hint/help使用事実から保守的に増やす。難易度や能力Levelへ変換しない。支援の自動最適化なし。
- Enrollment lock/Serializable/unique Event keyで初回成功をEnrollment内一度だけにする。全操作で現在のPilot/本人scope/Goal/Plan版/Definition承認を再確認する。再送は同内容のみ、履歴を上書きしない。
- CoreへのAI固有Skill/本文追加なし。最小契約は既存capability-trainingに置き、Web/Prisma/Provider型を混ぜない。AI評価Providerを新設・変更しない。
- Real Use/Toolkit/旧APIのPilot隔離追加、能力5段階Rule、実務成果本文の保存、転移評価、Discoveryは別PR。100cap/費用Hard Stop/実環境Gate未完につき本番開始NO-GOを維持する。
