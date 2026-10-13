# マナベル自由希望：教材候補の生成・保存・同版確認

## 今回の範囲（2026-10-13）

自由希望の第5分割。通常の有効受講者の保存済み希望・端末・ツール・経験・現在位置から、教材候補を生成し、サーバーに一度保存し、本人が表示された同じ候補を確認するまで。

開始時mainは8bb9ca593403b913cd1c442fd9508b6465b19414。依存PR #1264のhead fd715e43cc149eb2ef3ce3cfc71957bef66b5b70（CI verify/database成功）から分岐し、作業中に#1264のマージを確認。最新mainは79c2d5b92a3caf302b0da15c0b18ea67a3df067c。productionは4c7928a66586ca77f22b77916a8c3cabf5c8e5f1の別release系統で、この変更の本番反映はしていない。

**一課題を実践・支援・評価・再開まで通す完成条件には未到達。** 候補の本人確認をGoal/Plan/Assignmentの確定、学習達成、運営承認と扱わない。既存の確定計画と実践中課題は変更しない。

## 利用フローと再利用

1. 既存の通常登録・有効Enrollment・希望入力を再利用。ProfileやPilot席の個別準備は要求しない。
2. 保存済み希望版に対し「教材候補を作る」。サーバー側のモデル・料金・予算設定がなければAI送信前に拒否。
3. 説明・短い例・本人の実践・確認する証拠・今回の評価基準を候補として保存し表示。
4. 端末・ツールなどが不明なら必要条件の質問を表示し、実践開始可能と推測しない。希望更新で新しい版となる。
5. 本人確認は候補ID・希望ID・希望版だけを送る。AI再実行やクライアント教材の書戻しなし。
6. 再訪は保存済み候補を表示。同じ候補の再確認は冪等。確認後も現時点では「実践への接続は次段階」と表示。

希望・候補は既存PersonalLearningRequestに保持し、元の希望を固定テーマへ置換しない。本人データ出力・ALL削除・既存保持処理の対象となる。新しい利用者体系・進捗DB・テーマ別Routerを作っていない。

## 実装箇所

| 責務                             | 主なファイル                                                                                        |
| -------------------------------- | --------------------------------------------------------------------------------------------------- |
| 候補型・構造検査・Port           | packages/application/src/personal-learning-lesson-candidate.ts                                      |
| 再認可・所有・保存・同版確認     | packages/database/src/personal-learning-lesson-candidate.ts                                         |
| 既存希望への2項目追加            | packages/database/prisma/migrations/20261013020000_personal_learning_lesson_candidate/migration.sql |
| 構造化出力・制限付きProvider     | apps/web/src/providers/openai-learning-lesson.ts                                                    |
| 既存Program/Provider原価枠の接続 | apps/web/src/services/personal-learning-lesson-candidate.ts                                         |
| 認証・同一origin・厳格入力       | apps/web/src/http/personal-learning-lesson-candidate.ts                                             |
| 表示・確認・再訪                 | apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/learning-request/candidate-card.tsx     |
| 本人データ出力の日付変換         | packages/database/src/training-personal-data-export.ts                                              |

共通方針版はLEARNER_PRACTICE_TOOL_INDEPENDENT_V1、教材版は1、Prompt版はlearning-lesson-tool-independent-v1。テーマ別コードは不要。架空の管理者承認は付けない。

初版はツールに依存しない本人実践の説明に限定する方針。未知の画面・ボタンや機能を断定しないよう指示するが、**構造検査や本人確認は事実性・教育品質の保証ではない**。特定ツールの参照情報取得・確認時点管理は未接続で、推測手順を安全に提供できる完成状態とは報告しない。

## 原価・失敗・競合

- DB内で認可と費用枠を確認→DB外でAI→既存共通台帳へ費用記録→再認可と希望版照合→保存。
- 課題/回答のない実操作IDと試行IDを使い、架空のAssignment/Answerは作らない。
- Programに保存された凍結予約額をProvider共通枠にも使う。料金不明・Token欠測は0円でなくUNKNOWN。非終端応答や費用保存失敗では予約を解除しない。
- 最大入力byte・出力Token、応答byte、45秒timeout、同時実行・日次回数・費用枠を維持。自動retryなし。
- 希望が送信後に変わった場合、候補保存を拒否。発生した費用は保存し、既存計画は保持。
- 一度保存した候補を上書きしない。候補確認ではAIを呼ばない。
- 費用保存後に候補保存が失敗した場合の生成結果復旧、UNKNOWN費用の照合・枠回復、同一操作IDでの送信結果回復は未実装。無限再試行で迂回しない。

## 検証と未確認

合成Providerと使い捨てローカルDBで、構造検査、原価記録順序、所有、古い希望版拒否、同版確認、既存計画不変更を検証。スマホ幅の合成画面では候補生成・確認ID・条件質問・確認済み再訪を検証した。

ホームページ希望と別の希望は同じ構造経路のテスト対象。**実AIで双方の個別教材品質や一課題の通し動作を確認した結果ではない。**

既存APIキーの存在は安全に確認したが、元のローカル環境にはPERSONAL_LEARNING_LESSON_ADMISSION / PERSONAL_LEARNING_AI_PRICING / OPENAI_MODEL / OPENAI_REQUEST_COST_USD_MICROSが未設定。実料金や承認枠を推測せず、この分割で実AI送信・実費測定は行っていない。合成単価はテスト限定。

参考：[OpenAI構造化出力の公式仕様](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses)。JSON形式と教材の妥当性は別の検証対象。

公開は既存のdevelopment/staging限定希望入力Gateを維持。本番設定・Migration・送信・課金・Deployは未実施。本番へ出す前に追加Migrationが必要で、旧コードへ戻す場合も既存列を消す必要はない。

## 次の完成条件

保存済み同版候補を既存Goal/Plan/Assignmentへ安全に接続する。本人実践、途中相談、証拠型の提出・動的評価・履歴再開まで一課題を通す。その後、画像1枚・継続/次課題・LINE・実AI検証を接続する。実受講者の学習効果・人手介入時間は未測定のまま明記する。
