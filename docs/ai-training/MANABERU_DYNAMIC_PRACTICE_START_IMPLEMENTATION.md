# 自由希望の第6分割：同版教材での実践開始・記録・再開

2026-10-13。基準mainは`069b3dd73be3c6b228ddf14f2cf8f560810f52cd`（#1265マージ）。productionは別系統`4c7928a66586ca77f22b77916a8c3cabf5c8e5f1`。本番変更は行わない。

## 今回の完成単位

有効な通常受講者が、保存した教材候補を本人確認し、同版から実践開始する。短い作業・つまずき記録を本人申告として保存し、再訪時に同じ希望・教材・評価基準・前回記録へ戻る。新しい希望の下書きは現在の実践を置き換えない。

これは自由希望研修全体の完成ではない。AIによる途中支援、画像1枚、証拠別提出・動的評価、次課題、LINE再開、実AI通し確認は未接続。記録だけで課題完了・Goal達成・独力再現とは判定しない。

## 再利用と主要な設計

- 既存Enrollmentのlock・5軸認可・期限・削除停止・通常PARTICIPANTを再利用。Profile未作成でも開始でき、経験・能力を推測したProfileは作らない。別の利用者体系や進捗DBは追加しない。
- ServiceProgramの共通方針`settings.personalLearningPracticePolicy = { enabled: true, version: "LEARNER_PRACTICE_TOOL_INDEPENDENT_V1" }`を明示したServiceだけ開始・記録できる。設定なしは停止。教材のREADY構造検査と本人確認だけを提供許可・教育効果の実証にしない。受講者ごとの管理者承認待ちや架空の承認は作らない。
- 本人が確認した候補ID・希望版をサーバーで再照合し、一つのtransactionで既存Goal・Plan・Assignment・ActionEvent・Progressを保存。開始時はAIを再実行しない。Goalの元の全文は候補snapshotに保持し、表示用titleのみ160文字に制限。
- 教材・評価基準・生成方針版・利用環境・所有scopeをAssignmentの不変snapshotへ保存。Planには同版教材参照を保存。現在のCONFIRMED Planや未完了課題があれば暗黙切替を拒否。新しい希望は最新提案、実行課題は独立して取得。
- 作業記録はActionEventにappend-onlyで保存。operation UUID＋内容digestで二重適用を防止し、期待版で競合を拒否。`SELF_REPORT`を明示し、旧prompt回答／6技能評価や旧支援スコアへ流さない。旧Profile更新から実行中Goalを上書きする操作も拒否。
- 本人向け既存exportへ動的snapshotと本人の記録を接続。ALL削除は既存処理を再利用する。保持処理のsnapshot/metadata消去経路を維持。schema/migration追加なし。
- Web/HTTPは既存development/staging限定の希望入力Gateを維持する。POSTはsame-origin、strict入力、現在ユーザーからの認可、no-store。共通方針停止時には保存済み課題を読めるが変更できない。

## 実際の利用フロー

通常登録・有効受講資格 → 元の希望と実環境を保存 → 教材候補の同版確認 → 「希望と教材を確認して実践を始める」 → 本人が自分のAIツールで取り組む → 短い作業／つまずきを保存 → 再訪で同教材と前回記録。

ホームページの合成例では紹介ページの見出し修正を本人が行う教材を維持し、「画面が違う」を未達成の自己申告として記録。別の希望「AIで発表の練習をしたい」を保存してもホームページの実行課題は変わらない。別テーマの生成品質を実AIで確認した結果ではない。

## 検証・公開条件

ローカル検証とGitHub CIの結果はPRへ記録する。合成DBは使い捨てmarker確認済み環境のみ。元のプロジェクトcheckoutの未解決変更は触らない。

今回の開始・記録・再訪には新たなAI呼び出しはない。教材生成の利用量・費用事実は#1264/#1265の既存経路を引き継ぐ。実AI利用量・原価、学習効果、人手対応時間は今回測定していない。実キー再利用は許可済みだが、検証環境の価格版・Service予算・Provider設定不足を推測で補わない。

本番反映は未実施。本番公開条件は、途中支援・証拠別結果・同課題継続／次課題を含む一課題経路を異なる自由希望で通すこと。現段階のGateを解除して本番公開しない。実AI確認と実受講者での学習効果検証も分離する。

## 主要ファイル・次段階

`packages/application/src/personal-learning-practice.ts`、`packages/database/src/personal-learning-practice.ts`、`apps/web/src/http/personal-learning-practice.ts`、既存learning-request画面のpractice-card。互換境界はtraining-answer/interaction/profile、本人export。Decision Logに提供方針と不変保存を記録。

次は、現在のAssignmentと不変評価基準に結び付くAI途中支援・証拠別結果の接続。追加説明を教材書換えと分離し、費用予約・失敗・再認可・提出版を照合する。画像とLINEはその後に接続する。
