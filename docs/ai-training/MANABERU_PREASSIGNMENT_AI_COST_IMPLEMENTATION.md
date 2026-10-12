# 課題作成前のAI操作・原価管理（第4分割）

2026-10-13。基準main `e9b838aee6e499099f77096688babf049b95a821`（#1263）。#1262は開始時OPENで、競合解消後のCI成功を確認したが本分割へ未マージの変更を取り込まない。productionは別release系統。本番設定・Migration・Deploy・実AI・実送信・実課金・Pilot開始を行わない。元のdirty checkoutへ変更しない。

## 調査・実装範囲

既存の`PrismaPersonalLearningCallAdmission`は評価Assignment/Answer/LEASED JobとPilot席を必要とする。希望相談や教材生成前にこれらを架空作成して制限を通す構造は採用しない。

通常の有効受講者向けに、保存希望のID・期待版・実操作UUID・最大3試行を受ける内部Portと実行関数を追加した。今回の到達点は**課題作成前の費用予約と各試行の費用記録を実DBまで通せること**。教材生成・候補表示・同版確定・実践の完成ではない。Web/API/Providerの新たな公開入口は作らず、本番で呼び出されない。

## 再利用と境界

- 5軸の所有、ACTIVE User/Workspace/Service/Membership、通常PARTICIPANT、有効受講期間、AI_TRAINING_V1 Program、ALL削除Gateを既存Repositoryから再利用。新しいUser/Profile/進捗DBを作らない。Profile未作成でも保存希望に基づき認可できる。Pilotの予約された経路は迂回しない。
- `REQUEST_INTERPRETATION`と`LESSON_GENERATION`のみ。画像はbyte数だけで安全な料金予約ができないため拒否し、対応済みと表示しない。
- 既存`PersonalLearningCallAdmission`へnullable `operationContext`を追加。既存評価行はNULLのまま。新しい行も同じProgram advisory lock・同じ回数/同時実行/USD予算を利用するよう費用確認を共通化。
- 操作・試行IDは5軸を含むhashで保存する。Contextは操作種別、本文を含まない照合hash、Provider/model/Prompt Version、開始時に選んだ価格、上限、計測事実のみ。希望本文・画像・秘密情報・直接の受講者IDは保存しない。
- 希望版・受講資格・原価枠を確認して予約transactionを終了してからProvider Portを呼ぶ。外部通信をDB transaction内で待たない。新教材やGoal/Plan/Assignmentを作成・適用しない。

## 再試行・費用の扱い

同じ操作・試行の予約は再取得を拒否する。二重送信を実AIの再呼出しとしない。次試行は直前の試行が完了・費用記録済み・失敗で、同じ希望版/操作種別/Provider/model/Prompt Versionの場合のみ。成功後の再試行、飛び番、4回以上を拒否する。実行関数は自動再試行しない。

各実試行を既存`AiUsageEvent`へ一度保存し、同じtransactionで予約台帳へ計測事実を確定する。同一の費用報告の再送は何も増やさず、異なる報告で書き換えない。JSONBのキー順序に依存せず照合する。料金は開始時の価格版で計算する。後で設定が変わっても別の価格に置換しない。

既知の実費が予約を上回った場合は予算使用額を引き上げる。費用確定も新規予約と同じProgram lockで直列化する。予約額は安い実測値へ減らさず保守的に保持する。失敗でも既知の使用量・費用を記録する。原価不明はNULL/UNKNOWNで、0円にしない。通信完了不明または費用不明ではslotを閉じず、新しい操作の未知費用はUTC日を越えてもProgram単位で開始を拒否する。

Providerの不透明な例外・不正な計測はUNKNOWNとして記録し、秘密を含み得る例外本文を台帳へ渡さない。処理時間は実行関数で計測する。台帳保存に失敗した場合は成功出力を返さずslotを保持する。既存評価用settleはContextがNULLの行に限定し、新しい操作を費用記録なしに解放できない。

## 削除・期限後の扱い

開始時の認可済み予約に照合して、既に発生した費用を記録するため、途中で受講期限切れやALL削除になっても費用事実を捨てない。希望・回答・進捗を復元せず、内容の適用権限も与えない。後続の教材保存/表示/本人確定は、その時点で再認可・希望版/候補版確認が必須。

会計・監視の`AiUsageEvent`と予約行は学習者原文とは異なる既存保持方針を引き継ぐ。Programの台帳がService/OEM帰属を持ち、共通利用台帳にもWorkspace/User・操作種別の費用を残す。OEM請求方式・人数計算・請求確定は変更しない。既存OEM画面のService別内訳に新操作が表示できた証拠はなく、後続検証とする。

## 検証記録

- Applicationの新規9件成功。予約拒否時に呼び出さない、例外・不正モデル・記録失敗で成功出力を返さない、試行上限・画像拒否を確認。Providerは合成Portで、実APIを呼ばない。
- DB名・run ID・live markerを確認した既存隔離DBへMigration `20261013010000_personal_learning_operation_cost`を適用成功（243番目）。本番接続なし。
- 新規9件と既存費用制限3件のDB結合計12件成功（全210件中198件はこの実行では選択外）。通常受講/Profileなし/架空課題なし、二重報告、所有/希望CAS、同時実行、再試行費用、実費超過、価格不明、原価不明、削除後の費用記録、他者permit、既存評価用settleによる新操作slotの解放拒否を確認。
- DB readiness unit 3件成功。最新Migration定数と実DBの準備完了条件を確認。
- 初回Database型検査は新規結合fixtureが既存削除APIの引数・結果型を誤って使用して失敗。正式なpreview/revision/targetを使用する形へ修正後、全体`pnpm typecheck`（25 tasksとlearning-ui）成功。
- 初回対象formatは新規Application testで失敗し、再整形。新規Application/DBコード・Application testのeslintは成功。
- 全体`pnpm format:check`成功。全体lint・unit・buildと全210件のDB結合は最終結果確認前であり、未確認分をPASSと扱わずPR checksと区別する。

## 次の条件・未完了

1. サーバー設定からのpolicy/価格とProvider runtime全体予算・モデル互換性・要求byte/token制限を、実Adapterへ接続する。キーや価格を利用者POSTから受け取らない。合成価格は実APIに使わない。
2. 原価UNKNOWN/通信終了不明/記録失敗は、人間の証拠確認に基づく照合・回復手順が必要。現行新Portは未知費用の訂正やslot解放を自動化しない。無期限に停滞する運用が許容できるかを確認せず公開しない。
3. 共通提供方針下の教材候補生成、保存・同版確定、Goal/Plan/Assignment接続、途中支援・証拠別結果・再開。原価Portの存在を教材品質や本人確認済みの証拠にしない。
4. 画像の安全な費用予約、LINE、実Auth、実AI通し、実受講者の学習効果。今回の数値は合成使用量であり、実測AI原価・学習効果・人手対応時間を測定したものではない。

## 移行・切り戻し

必要DB版を同Migrationへ更新。コード配備前に承認済みMigrationを適用する。既存評価はContext=NULLで共通予算を引き継ぐ。本番は別release系統を基点に個別確認する。

切り戻しは新Portの呼出しを停止し、既存評価のNULL Context経路を維持する。未確定の費用やslotをSQLで一括消去しない。追加列は残せるが、旧アプリの評価用settleを新操作へ使わない。新しい台帳行が発生した環境では未確定行を照合してからバージョンを戻す。

主要ファイル: Application/Database `personal-learning-text-operation.ts`、Database `personal-learning-call-budget.ts`、既存call-admission、schema/migration/readiness、結合テストとApplication test。
