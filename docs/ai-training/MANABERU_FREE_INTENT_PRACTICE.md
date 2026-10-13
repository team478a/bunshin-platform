# 自由希望から本人の実践へ（2026-10-12）

第7分割のテキスト途中相談は`MANABERU_PRACTICE_SUPPORT_IMPLEMENTATION.md`。現在課題の教材・作業記録版を維持して、支援と原価・再訪を接続する。旧6技能評価へ転用せず、結果確認・画像・次課題・LINE・実AI／本番を完成と扱わない。

第6分割の開始・本人申告記録・同版再訪は`MANABERU_DYNAMIC_PRACTICE_START_IMPLEMENTATION.md`を参照。Service共通方針の明示設定と本人操作で既存Goal/Plan/Assignmentへ接続する。旧6技能評価への流用を拒否し、AI途中支援・画像・証拠別評価・次課題を完成とは扱わない。

教材候補の生成・不変保存・同版確認の実装範囲は`MANABERU_LESSON_CANDIDATE_IMPLEMENTATION.md`を参照。これは一課題を通す完成ではなく、既存Goal/Plan/Assignment・支援・評価への接続は未完了。初版候補はツール非依存の実践に限定し、特定操作の参照根拠と確認時点の接続前に画面操作を確認済みと扱わない。

基準main: `ad6fff672ad3e0ecc14e067aa607310a9f744468`（開始時にremoteを確認）。旧3Definition限定、個別教材の運営者手動承認待ちを新経路の条件にはしない。旧経路は互換性を維持する。

## 提供方針

本人がAIを使ってできることを増やす研修。説明、短い例、本人の実践、ヒント、証拠に限定したフィードバックを提供し、制作・公開・運用を代行しない。元の希望は書き換えず保存する。テーマ別コードや汎用Definition Factoryは追加しない。

運営の共通方針版の下で、本人用の到達点・教材・証拠・評価基準・参照情報を版固定する。構造検査だけを教育品質、管理者承認、独力再現の証拠にしない。操作画面の根拠が不足する場合は質問へ止める。本人確認は保存済み候補を使用し、AIを再実行しない。

## 保存・実行境界

- User/Service/Enrollment/Profile/Goal/Plan/Assignment/Answer/Eventを再利用する。個人用教材候補はこのscopeに保存し、進捗や利用者体系を別に作らない。
- 新DRAFTは現在のCONFIRMED Planを失効させない。実行版と最新提案版を分け、明示確定時だけ未完了課題・期待版を再確認して切り替える。
- AIは認可・状態確認、費用予約、送信、再認可・版照合、保存の順。送信をDB transaction内で待たない。各試行の費用を記録し、二重適用を防ぐ。
- 本人申告、提出物で確認した範囲、支援を減らした別実践、材料不足を分離する。旧6技能へ転用しない。一課題完了でGoal/Enrollmentを終了しない。
- 画像は本人選択の静止画1枚。所有・版・保持を迂回しない。読取失敗・未対応モデルを成功と扱わない。
- LINEは現在学習への入口。受講資格・通知・停止Gateを維持し、再訪・通知retryでは教材を生成しない。

## 実装順・受入

1. 新規Profile、自由希望、候補確認、本人実践、テキスト支援、証拠別結果、再開。
2. 画像Storage/保持・削除、同課題継続/次課題。
3. LINE/スマホ、費用・失敗・競合、隔離DB/E2E/許可された実AI確認。

異なる希望で上記体験を完走してから完成とする。契約・schema・unit testだけでは完成ではない。本番設定・Migration適用・実課金・実送信・Pilot開始は別承認。合成テスト、実AI試験、実受講者の効果、本番反映を分けて報告する。

第1分割は `MANABERU_PLAN_CONTINUITY_IMPLEMENTATION.md`。現在の確定Planを新しい提案から保護する前提修正であり、自由希望の生成・画像支援等の完成報告ではない。

第3分割の自由希望入口は`MANABERU_FREE_INTENT_INTAKE_IMPLEMENTATION.md`。希望・任意の利用環境を`PersonalLearningRequest`へ保存するだけではGoal確認・教材提示としない。新規Profileがなくても有効な通常PARTICIPANTは希望を保存できるが、未回答を推測してProfileを作らない。教材生成・原価予約・候補確定まで接続する前は、本番では入口を公開しない。

第4分割の課題作成前AI原価Portは`MANABERU_PREASSIGNMENT_AI_COST_IMPLEMENTATION.md`。既存予約台帳・利用台帳を再利用し、Assignment/Answer/Jobを架空作成しない。内部Portの実装だけで教材生成・同版確定・実AI・実受講者の効果・本番公開を完成扱いにしない。

## 2026-10-13 実装更新：証拠別の結果確認

`MANABERU_PRACTICE_RESULT_REVIEW_IMPLEMENTATION.md`に第8分割の実装範囲と確認状況を記録する。既存TrainingMissionAnswer・評価Jobを使い、動的課題の確定教材と評価基準を変えずに提出Revisionごとの課題固有レビューを保存する。TEXT提出から確認できた事実、SELF_REPORT、未確認項目を分け、旧6技能評価やGoal全体の達成へ拡張しない。

回答履歴用migrationの適用は行っていない。隔離DB結合試験、実Provider試験、画像添付、課題の継続/次課題、LINE再開、本番適用は未確認であり、自由希望全体の完成や受講者の学習効果を意味しない。
