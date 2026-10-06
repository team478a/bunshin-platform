# Personal Learning Pilot Call Admission

## 範囲と基準

- 基準main: `a10b2b2fc5de0325c60c46f07117a956116664a5`（PR #1159反映済み）。
- branch: `feat/personal-learning-call-admission`。commitは本PRのheadを正本とする。
- 今回はPilot専用Provider呼出し上限・同時実行制限だけ。trusted Production準備、100人Hard Capは別PR。
- 本番接続・Migration適用・Deploy・Pilot enable・Definition承認・Enrollment作成・実課金Provider呼出しは行わない。認証キーの取得・新規作成・変更も行わない。

## 最小構成

`application`のProvider非依存の厳格な設定契約、`database`のAdmission ledgerと既存Assessment Gateを再利用した認可、Web Workerの送信直前Admission、既存Provider AdapterのPilot限定request size / output token制限を追加した。

変更ファイルはPR diffを正本とする。新規主要ファイル:

- `packages/application/src/personal-learning-call-admission.ts`
- `packages/database/src/personal-learning-call-admission.ts`
- `apps/web/src/services/personal-learning-call-admission.ts`
- `20261006120000_personal_learning_call_admission/migration.sql`

UI・LINE・Router・Mission・Definition・ブランド・モデル選定・既存V1の評価仕様は変更しない。

## 設定 / Fail-closed

サーバー環境変数`PERSONAL_LEARNING_CALL_ADMISSION`はJSON object。必須項目は`workspaceId`, `groupId`, `serviceProgramId`, `dailyAttemptLimit`, `maxConcurrent`, `model`, `maxRequestBytes`, `maxOutputTokens`。

数値の本番デフォルトは設けない。Wave 0の人間レビューで数値・モデル・費用見積もりを決める。未知field、未設定、不正値、モデル不一致、別Program、利用不能DB/schema、認可失敗は送信前にnon-retryableで停止。既存Runtimeのキー・モデル設定を変更せず、指定モデルとの完全一致を要求する。

一つの設定で一つのProgramのみ許可する。複数Programへの分割で上限を回避しない。Program/configの差替えは新しいRelease Gateレビュー対象。deploy中の旧instanceや別Providerの利用はこの台帳だけでは制限できないため、全instance更新・外部Provider budget確認は別Gate。

## 正本 / 日次上限 / 同時実行

- 新規`personal_learning_call_admissions`のみがAdmission正本。月次QuotaとAI Cost Telemetryは変更しない。
- UTC日次、DB時計でAdmission時刻を確定。失敗・再挑戦・通信再送を含め、admitted attemptを数える。失敗refundなし。送信前validationで止まったAdmissionも保守的に日次件数へ残る。
- 同一Programをadvisory transaction lockで直列化し、既存Serializable transaction内でcount / insertする。Serializable conflictはfail-closedで停止、Providerへ進まない。
- `Job ID + attemptCount`のSHA-256 digestは同一scopeでunique。既にadmittedのattemptは再送不可。別attemptは新規件数を消費する。
- `settledAt=null`は日付を越えても同時実行枠を占有する。TTLで解放しない。
- 完全なJSON response bodyを受信できた場合、またはProvider送信が始まらなかった場合だけsettleする。HTTP失敗でもbody受信済みならsettle、timeout・transport・body parse失敗・worker crashは保守的に保持。settleのDB失敗も保持する。
- daily limitは金額上限ではない。JSON byte数は厳密なinput token数でもない。価格変更を含む正確な金額Hard Stopを主張しない。

Provider Adapterは送信JSON全体をUTF-8 bytesで検査し、Pilotだけ`max_output_tokens`を指定する。[OpenAI公式token counting](https://developers.openai.com/api/docs/guides/token-counting)を確認した。出力上限には非表示tokenも含まれるため、採点JSONが完了できる余裕は人間レビュー・限定実測で確認する。未知・不完全な出力をPASSへ補完しない。

## 認可 / Privacy

Admission transactionで、既存Actor / Tenant / Enrollment / Pilot allowlist / Goal / current Plan revision / Definition Approval / Assignment / Answerの再検証を行う。さらに現在のJob environment、workspace、requester、type、payload、attempt、LEASED状態、有効leaseを検証する。クライアント指定IDだけで呼び出さない。Workerは非同期Admission後にも環境Kill Switchを再確認する。

ledgerはworkspace / group / ProgramとJob attempt digest、時刻のみ。User / Enrollment / AnswerのFK、相談本文、成果物、回答、Provider response、API keyを保持しない。digestは匿名ではなく仮名化情報。回答削除で台帳を減らさない。Program削除のscope FK cascadeは通常の呼出し復旧に使わない。

新tableはRLS有効、public policyなし。既存trusted server roleだけを利用する。本番roleの権限・RLS実効性はProduction監査Gateへ残す。

## Migration / Rollback

小さな空table、scope FK、indexes、CHECK、RLSだけのadditive SQL。既存tableへのDML・backfill・破壊的変更なし。schema readinessの最新Migrationを更新した。本番未適用。

適用前backup・本番migration履歴・role/RLS・lock/time・deploy順序をレビューする。CI disposable DBの成功を本番安全確認とみなさない。

停止時は既存Pilot Kill Switchをoff。台帳と既存Goal / Planは削除しない。コードrollback後に旧コードをPilot enabledで動かすとAdmissionを迂回するため、全instanceのflag offを必須とする。Migrationの逆DROPは不要。保持枠の復旧は停止とProvider終了確認後、人間レビューを経た別操作。今回復旧endpoint / cron / 自動resetはない。

## 検証

Pure policy、server wrapper、Provider、Worker、実PostgreSQL integrationを追加。日次上限、重複拒否、並行実行、日付を越える未知枠、回答削除後の件数維持、cross-scope、Job lease、Approval再検証を対象とする。

ローカルとCIの最終結果はPRと完了報告に記録する。全テストはsynthetic data / mocked fetchまたはCI disposable DBだけ。実Providerを呼ばない。

ローカル確認: Web関連5 files / 41 tests、application policy 11 tests成功。database TypeScriptとarchitecture check成功。lint / 全体CIの最終結果はPR headに対応するcheckを正本とする。

## 残るGate

Productionは引き続きNO-GO。Production Migration安全確認、差分deploy計画、3 Definition Human Approval、Wave 0アカウントと実認証E2E、実Provider / 価格 / 費用Alert、trusted準備操作、100人Hard Cap、本番設定数値、未知枠復旧手順は未承認・別作業。今回の完了をPilot開始承認とみなさない。
