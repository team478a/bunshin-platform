# 自由希望の第7分割：実践途中のテキストAI支援

2026-10-13。基準main `55ef58c3c9bb1c4f1edf76ac880ad7de737e347c`（#1266）。同mainのCI成功を確認。productionは別系統`4c7928a66586ca77f22b77916a8c3cabf5c8e5f1`。元のdirty checkout、本番設定・DB・Migration・Deploy・課金・LINE送信は変更しない。

## 完成単位と利用フロー

通常の有効受講者 → 本人確認済み教材で実践 → 作業やつまずきを記録 → 相談の選択肢と短い自由入力 → 現在の課題に沿うAIのヒントまたは短い確認質問 → 同じ課題へ戻る → 再訪で教材・作業記録・支援履歴を復元。

今回の対象はテキストの途中支援。自由希望研修全体は未完成。画像、証拠型の提出・課題固有評価、次課題、LINE再開、実AIの通し確認、実受講者の学習効果、本番反映は未完了／未検証。

既存の回答と評価Jobは固定課題の6技能評価へ接続されているため、この相談を回答欄へ押し込まない。結果確認は次の実装単位で、既存Answer/評価Jobを課題固有の証拠・基準に接続する。

## 再利用と設計

- Applicationの支援契約、Databaseの既存Enrollment lock・5軸認可、Webの既存Provider Runtime/HTTP/画面を使用。新しい利用者体系・進捗DB・エージェント基盤・テーマ別コードを作らない。schema/migration追加なし。
- 理解、次の操作、環境・画面差異、機能不足、出力の目的不一致、作業量、原因不明を区別。原因不明の構造は質問＋空の次操作を必須とする。選択理由だけを能力診断に変換しない。
- AI入力は現在Assignmentの不変教材・評価基準・元の希望、本人環境、SELF_REPORTの作業記録、直近5件の保存済み支援、今回相談に限定。他ユーザー／Service／Bunshinの記憶は取得しない。本文中の指示は評価対象データであり権限ではない。
- 操作画面の公式参照・確認時点管理は未接続。初版はツール非依存の支援と必要条件の質問に限定する指示を使い、未知のボタン・画面・公開成功・独力能力を断定しない。構造検査は助言の事実性や教育効果の保証ではない。
- 相談を既存ActionEventへ先に保存。応答は別のappend-only Eventに記録。Assignmentの到達点・評価基準、Goal/Plan、能力スコア、課題・受講の完了状態を変更しない。
- 保存版は`PERSONAL_LEARNING_SUPPORT_V1`、Prompt版は`learning-practice-support-tool-independent-v1`。相談には候補ID・教材版・作業記録版・相談版、応答にはPrompt版と共通AI利用台帳参照を保持。
- 新しい希望のDRAFTがあっても現在課題の支援を継続する。保存時に再認可、課題・教材・作業記録・相談版を照合し、遅延応答はSTALEとして助言を現在状態へ適用しない。後から作業記録が変わった支援も画面に過去版として明示。
- 本人の既存データ出力へ限定した相談／応答本文を追加する。一般操作・管理者Eventのmetadataは引き続き非取得。既存ALL削除と仕事情報保持期限のmetadata/snapshot消去を再利用する。

## 原価と再送・失敗

既存`PERSONAL_LEARNING_LESSON_ADMISSION`を共通Program枠として再利用し、`PRACTICE_SUPPORT`操作種別と真のAssignment・相談参照を追加。希望・教材生成と同じ日次回数／同時実行／USD上限を利用する。別予算や架空のAssignment/Answerは作らない。

相談の認可・保存 → Program費用予約 → Provider共通枠の凍結額予約 → DB transaction外で1回だけAI → 実使用量・原価の保存 → 再認可・版照合 → 応答保存。既知の費用事実が永続化された時だけ共通枠を精算する。失敗・不正出力も使用量が取得できれば記録。原価NULLや通信完了不明を0円・空き枠に置き換えない。

同操作IDのREADY再送は保存済み応答を返すだけ。PENDING/FAILED/STALEの同操作は再送しない。失敗後は現在状態を読んだ本人による新操作が必要で、各実試行の原価を残す。処理中の別相談も止める。自動リトライなし。最大45秒・128,000応答byte、設定された入力byte・出力Tokenを維持。

1課題の相談は最大1,000件。読取は不変Eventを上限付きで検査し、直近20件を返し、UIは直近3件を表示。これは無制限の相談サービスではない。プロセス停止で応答未保存の相談、原価UNKNOWN、通信終了不明の自動復旧は今回作らず、運営確認が必要。本番公開前に運用復旧条件を確認する。

## 検証記録

- Applicationの支援契約／既存text operation 25件、WebのProvider／HTTP／service／旧lesson 33件、本人export 6件成功。合成Providerで実API呼び出しなし。
- marker確認済みの使い捨てPostgreSQLで、途中支援9件＋既存実践5件＋既存費用操作9件、計23件成功（全227件中204件はこのローカル実行では選択外）。再送、DRAFT不影響、記録変更後の遅延応答、5軸所有、失敗後の新操作、提供停止、UNKNOWN費用、本人出力、ALL削除を確認。
- スマホ幅390×844の合成E2E 36件成功。新規5件は相談・元の教材保持、再訪でAIを呼ばない、失敗時の入力／作業記録保持、処理中／停止時の二重送信拒否、原因不明の質問とSTALE非適用。
- 初回DB検証のfixtureが教材保存入力を費用操作入力として誤って使用したため修正。その後の遅延応答テストを実予約→作業記録変更→実績記録の順へ修正し、scope拒否をPromise rejectionで返すようcompleteSupportをasyncに統一。最終の上記23件は成功。
- 型指定漏れと不要な型アサーションを修正。WindowsのDB検証とPrisma再生成の並列実行ではDLL renameがEPERMで停止したため、DB検証終了後に全体検査を順番に再実行。環境起因の停止も成功扱いにしない。
- 全体format／typecheck／lint／unit／build、GitHubの全DB結合とE2EはPR #1267のchecksで最終確認する。文書作成時点では全体検査を進行中であり、未完了の項目をPASSと記載しない。

ホームページ教材の合成例では、作業記録を残したまま「画面が違う」へ環境差異に対応する質問を表示。別の希望「AIで発表の練習をしたい」は同じProvider入力経路で元の希望と未回答経験を保持し、原因不明は短い質問へ止める。これは実AIの教材品質や実受講者の効果を確認した結果ではない。

実APIキーの再利用承認と存在は確認済み。しかし元の既存ローカル環境には`PERSONAL_LEARNING_LESSON_ADMISSION`、`PERSONAL_LEARNING_AI_PRICING`、`OPENAI_REQUEST_COST_USD_MICROS`、`AI_PROVIDER_MAX_REQUEST_COST_USD_MICROS`がない。新しい価格・上限を推測で設定せず実API未実行。今回測定した実AI Token・費用・学習効果・人手対応時間はない。合成価格は実送信に使用しない。

## 公開条件・切り戻し・次段階

既存development/staging限定希望入力GateとService共通提供方針を維持し、今回本番公開しない。最初のリリース条件は異なる自由希望で本人実践・支援・証拠に応じた結果確認・再開の一連の成立。結果確認と継続／次課題を優先し、次に画像・LINE・実AI確認。実ユーザーの学習効果は別途記録する。

切り戻しは希望入力Gate／共通提供方針を停止し、AI送信の終了と未精算予約を確認してコードを戻す。相談・費用台帳を削除して回復しない。以前のコードは追加Eventを無視して読めるが、旧コードへの戻しだけで全実行が停止したとはしない。

主要ファイル: Application `personal-learning-practice-support.ts`、Database `personal-learning-practice-support.ts`／historyと既存text-operation、Web `openai-learning-support.ts`／service／HTTP／support-card、既存本人export、結合・単体・スマホ幅E2E。Decision Logに判断を記録。
