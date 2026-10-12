# 自由希望の保存・再訪入口（第3分割）

## 位置付けと調査

2026-10-13。基準mainは`52c34e8097aab75ee151b6bfef3a758d00818ad5`（#1261）。#1262は開始時OPENのため含めず、重複するプロフィール画面修正を行っていない。productionは`4c7928a66586ca77f22b77916a8c3cabf5c8e5f1`で別release系統。元のプロジェクトcheckoutの変更には触れていない。

既存のプロフィール保存はACTIVE Goalを取り消すため、進行中の希望変更へ流用しなかった。既存Personal LearningのEnrollment lock・5軸認可・受講期限・削除済みGateを再利用した。独立した受講者体系・学習進捗DB・Providerを追加していない。

**今回完成したのは「自由な希望を保存し、再訪で同じ希望を読み出す入口」。個別教材の生成・実践・支援・評価までの完成ではない。**

## 利用フロー

1. 検証環境で通常PARTICIPANTの有効なEnrollmentを持つ本人が、通常の研修画面から「自由な学習希望を保存（検証中）」へ進む。専用招待・allowlistは不要。Profile未作成でも保存可能。
2. 元の希望（最大2000文字）を入力する。端末、使うツール、経験、現在位置は任意。未回答はnullであり、BEGINNERや能力不足へ置換しない。
3. 希望と本人申告の環境をサーバーへ保存。確認済みGoal/Plan/Assignmentを作成・取消・切替しない。
4. 再訪時は保存済みの最新希望・環境・現在位置を表示する。GETや再ログインによってAIを実行しない。
5. 再保存は新しい版。期待版が古ければ409とし、入力を残して再読込を案内する。同一内容の送信失敗後の再試行では同じ操作キーを使用する。

保存だけで教材候補確認・学習開始・能力習得と表示しない。原文は前後の空白・改行も保持する。保存内容は本人申告であり、提出物で確認された達成ではない。

## データと安全性

- `PersonalLearningRequest`: Workspace/Service（groupId）/Enrollment/Membership/User、revision、原文、任意環境、操作キー、digest、保存時点。複合FK、版・操作キーunique、RLS有効。直接ブラウザー向けのRLS許可は作らない。
- 既存認可transactionでACTIVE User/Workspace/Service/Membership/Program、受講期間とALL削除を再確認。通常PARTICIPANTのみ。予約されたPilotのプログラムやSERVICE_OWNERを新入口から迂回して利用させない。
- Enrollment lock、期待版、Serializable transaction、操作キーと内容digestで競合・二重適用を拒否。古い操作の再送はその操作の同じ保存版を返す。AI呼出し・長い外部通信はない。
- 内容の未知フィールドをApplication/HTTPで拒否。HTTPはsame-origin、JSON、16KB上限、UUID、厳格な入力検証。本人文をエラー応答やログへ出さず、private/no-store。
- 既存の本人データ出力へ`LEARNING_REQUEST`として接続。ALL削除の版確認・削除件数に含め、削除後の再作成を拒否。仕事情報の保持期限（終了後90日）でも削除し、進捗の1年保持まで原文を残さない。保持previewの版に含める。アカウント退会は物理User削除ではないため、既存の退会purgeにも本人userIdの希望削除と件数記録を明示接続する。
- 既存の出力上限を超える履歴を増やさないため、Enrollmentあたり最大`TRAINING_EXPORT_MAX_ROWS`版で新しい保存を止める。再送は既存版を返せる。上限時は運営による正式な本人データ整理が必要で、勝手に過去希望を破棄しない。

## 公開・移行・戻し方

`PERSONAL_LEARNING_REQUEST_INTAKE=true`かつAPP_ENVがdevelopment/stagingの時だけ入口を提供する。productionではフラグを指定しても拒否する。ユーザーを招待制にする仕組みではなく、未完成機能を公開しない制御。

Migration `20261013000000_personal_learning_requests`は追加テーブル・index・所有FK・RLSのみ。隔離した合成DBへ適用。本番設定変更・Migration・Deploy・参加者登録・実送信・実課金は未実施。

戻す時は検証フラグを無効化して入口を閉じる。既存Goal/Plan/Assignmentに変更がないため既存研修を継続できる。保存済み希望は破壊的down migrationで消さず、既存本人削除・保持処理を利用する。将来の本番releaseは全体受入条件とproduction基点の差分を確認して別途判断する。

## 検証

- Application contract 7件、Web HTTP/access 15件、既存export/deletion/retention unit 22件が成功。
- 390×844合成E2Eは新規3件を含む5ファイル21件成功。希望保存、再訪の環境復元、競合時入力維持、送信失敗後の同じ操作キー再試行を確認。
- 初回の対象DB結合4件成功。全体200件は195成功・5失敗。追加した保持fixtureの期間逆転1件を修正し、残る4件はタイムアウト（1件では終了後処理との競合も発生）。メモリ逼迫下で型検査/lintと並行していた。上限変更なしで単独全体再実行は198成功・既存2件タイムアウト。その2件の単独再確認は1成功・既存export 1件タイムアウト。これをローカル全体PASSとは扱わない。
- ソース`beb22fd3`のGitHub databaseはMigration/schema-ready/全200件成功（run `38269771185`）。後続で追加した退会削除1件はローカル実DBで成功（対象外200件）。退会の外部Auth削除や実受講者退会を実行した証拠ではない。後続headのCIは再確認する。
- 初回型検査は保持件数の型定義位置で失敗し修正。修正後全体typecheckは25タスクとlearning-uiが成功。退会処理追加後にDatabaseの`tsc --noEmit`も成功。
- 初回lintはテストmockの不要asyncで失敗し修正。`beb22fd3`のCIでは全package lintまで成功したがlearning-uiのJSON.parse由来のanyで失敗。E2E送信データをunknownから厳格に検査する形へ変更し、learning-ui lint/typecheckと新規3 E2Eを再実行して成功。途中のzod利用試行はroot依存がなくcollection/typecheckで失敗したため撤回し、新依存は追加していない。
- 初回の全体formatは途中で修正したaccessファイルで失敗し、再整形・対象check成功。`beb22fd3`のCI全体formatは成功。最終headのCI・buildは確認中であり未完了をPASSとは記載しない。
- 242番目のMigrationを、DB名・run ID・live marker確認済みの既存隔離DBへ適用成功。本番DBへの接続・適用なし。

合成ブラウザーは実端末・通常登録画面・実Auth再ログイン・LINE送信・実AIの証拠ではない。最終確認結果はこの節を更新する。

## 未完了・次の条件

- 課題作成前の希望解釈・質問・教材生成用の実操作IDと原価予約・上限・各試行の費用記録。Assignment/Answerを架空作成しない。
- 共通提供方針下の本人用教材候補、サーバー保存、同版確認、課題固有rubric・参照根拠・評価Jobと既存Goal/Plan/Assignmentへの接続。希望保存を承認済み教材とは扱わない。
- 途中支援、画像1枚、証拠別評価、同課題継続/次課題、LINEからの現在課題復帰。
- 許可済み隔離環境での実AI確認。既存キーの確認結果403はモデル一覧の応答であり、生成権限失敗の原因とは断定しない。料金不明を0円や架空単価で通さない。
- 異なる自由希望の実AI一連の利用が通り、課題・支援・結果・再開の全受入を満たしてから本番公開を検討する。実受講者の学習効果は別途未検証。今回AI利用量・料金は測定しておらず、この入口自体はAIを呼び出さない。

## 主要ファイル

- Application: `packages/application/src/personal-learning-request.ts`
- Database: `packages/database/src/personal-learning-request.ts`、schema/migration、既存export/deletion/retention
- Web: `apps/web/src/http/personal-learning-request.ts`、`personal-learning-request-access.ts`、通常研修画面と`learning-request/page.tsx`・`card.tsx`
- Tests: Application contract、Web HTTP/access、既存DB integration内の`free request`、既存プライバシーunit、`scripts/test/learning-ui/learning-request.e2e.ts`
