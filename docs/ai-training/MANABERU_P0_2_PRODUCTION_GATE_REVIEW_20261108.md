# マナベルスタイル P0-2 Production Gate 一括レビュー票（2026-11-08）

## 1. 判定

**設定変更はNo-Go、レビュー準備はGo。**

PR #1494で`gpt-5.6-terra`の共有Provider互換性と費用予約の合成回帰はmainへ反映済みである。ただし、本書作成時点ではProductionの環境変数、Provider設定、Program実行状態を変更していない。実AI、LINE、参加者追加、課金も行っていない。

本書は、次の5項目を同じ承認単位で照合するためのレビュー票である。1項目だけを先行変更しない。

1. `PERSONAL_LEARNING_REQUEST_INTAKE`
2. `PERSONAL_LEARNING_LESSON_ADMISSION`
3. `PERSONAL_LEARNING_CALL_ADMISSION`
4. `PERSONAL_LEARNING_AI_PRICING`
5. Production OpenAI Provider Runtime

対象は停止中のPersonal Learning専用Programだけである。既存30日研修のProgram、学習モード、Feature、参加者を変更しない。OpenAI Provider Runtimeは共有設定なので、変更前後に既存30日研修を含む全対応タスクへの影響をレビューする。

## 2. 変更前の正本

| 項目                      | 2026-11-08の既知状態                                                          | 開始前の再確認                    |
| ------------------------- | ----------------------------------------------------------------------------- | --------------------------------- |
| main                      | PR #1494を含む`61bd2fba`                                                      | release候補SHAとrequired CIを記録 |
| Personal Learning Program | `SUSPENDED`、実行`OFF`、`DYNAMIC_V1`、conversationのみON                      | Program識別子を画面上で二者確認   |
| その他Feature             | multiTopic / lineLearning / extendedScope / learningNudges / toolUpdatesはOFF | OFFのまま維持                     |
| 既存30日研修              | `ACTIVE`、実行`ON`、`FIXED_DEFINITIONS_V1`                                    | 変更前後で不変                    |
| Request Intake            | Production未登録                                                              | UNKNOWNなら変更しない             |
| Lesson Admission          | Production未登録                                                              | UNKNOWNなら変更しない             |
| Call Admission / Pricing  | entryあり、値は未承認                                                         | 秘密を転記せず完全一致を確認      |
| OpenAI Provider           | Production v3 ACTIVE・verified、modelは旧`gpt-5-mini`、日額$10・月額$100      | 現行版と未精算予約0を再確認       |
| 内部参加者                | Enrollment 1、ACTIVE/INTERNAL Seat 1、AI利用同意1                             | 本人、scope、同意版を再確認       |
| LINE                      | 初回Web試験では対象外                                                         | Feature OFF、送信しない           |

上表は先行の読み取り専用監査結果であり、実行日の再確認を代替しない。Chromeの再接続に失敗した場合や画面値が読めない場合はUNKNOWNとして停止し、過去値を現在値とみなさない。

## 3. 承認候補値

UUID、秘密値、実参加者情報は本書やPRへ記載しない。`<...>`は実行担当者が管理画面と承認記録で照合するプレースホルダーであり、そのまま設定してはならない。

### 3-1. Request Intake

```text
PERSONAL_LEARNING_REQUEST_INTAKE=true
```

これは入口Gateだけである。Programが`SUSPENDED`なら利用者経路は開かない。入口だけを先行追加して開始可能と判断しない。

### 3-2. Lesson AdmissionとCall Admission

両方とも、最新コードの厳格な設定契約に合わせて次の同一scope・同一model・同一上限候補を使う。未知field、欠損、UUID不一致、model不一致はfail-closedとなる。

```json
{
  "workspaceId": "<APPROVED_WORKSPACE_UUID>",
  "groupId": "<APPROVED_MANABERU_SERVICE_UUID>",
  "serviceProgramId": "<APPROVED_PERSONAL_LEARNING_PROGRAM_UUID>",
  "dailyAttemptLimit": 12,
  "maxConcurrent": 1,
  "model": "gpt-5.6-terra",
  "maxRequestBytes": 16384,
  "maxOutputTokens": 2048,
  "dailyCostLimitUsdMicros": 1000000
}
```

- 12回はProgram全体のUTC日次上限であり、参加者ごとではない。
- 失敗と再試行も消費する。終了不明の枠を自動解放しない。
- `maxRequestBytes`は実token数ではなく、安全側の入力token上限として費用予約に使う。
- 日次$1はPersonal Learning ProgramのHard Stop候補である。共有Providerの日額$10を緩めない。
- 初回は内部1名・Web限定であり、人数増加を理由に上限を自動拡大しない。

### 3-3. AI Pricing

公式価格の人間再確認後、実行時刻以前の発効日時で次の1行を追加する。既存価格行を削除・上書きせず、配列全体のJSONとして妥当性を確認する。

```json
{
  "provider": "openai",
  "model": "gpt-5.6-terra",
  "effectiveFrom": "<APPROVED_ISO8601_INSTANT_NOT_IN_THE_FUTURE>",
  "inputPriceMicrosPerMillion": 2000000,
  "outputPriceMicrosPerMillion": 12000000,
  "cachedInputPriceMicrosPerMillion": 200000,
  "currency": "USD",
  "pricingVersion": "<APPROVED_PRICE_VERSION>"
}
```

単価候補はOpenAI公式の[`gpt-5.6-terra`モデル資料](https://developers.openai.com/api/docs/models/gpt-5.6-terra)にある入力$2.00、cached input $0.20、出力$12.00 / 100万tokensをUSD microsへ変換した値である。[廃止予定](https://developers.openai.com/api/docs/deprecations)では`gpt-5-mini`の停止日は2026-12-11、推奨移行先は`gpt-5.6-terra`である。実行日に公式価格、契約条件、対象modelを再確認し、差異があれば本書の数値を使用せずレビューへ戻す。

### 3-4. 保守的な1回予約額

cached割引を使わず、現行コードと同じ切り上げ式で計算する。

```text
ceil(16,384 × 2,000,000 / 1,000,000)
+ ceil(2,048 × 12,000,000 / 1,000,000)
= 32,768 + 24,576
= 57,344 USD micros ($0.057344)
```

12回の最大予約は688,128 USD micros（$0.688128）であり、日次Hard Stop候補1,000,000 USD micros以内である。これは実使用料の予測ではなく、送信前の安全側予約である。

### 3-5. Production OpenAI Provider Runtime

新しい追記版を作成し、接続確認済みの版だけをACTIVE候補とする。

| field              | 承認候補                                                     |
| ------------------ | ------------------------------------------------------------ |
| environment        | `PRODUCTION`                                                 |
| provider           | `OPENAI`                                                     |
| model              | `gpt-5.6-terra`                                              |
| model capabilities | `STRUCTURED_OUTPUT`、`IMAGE_INPUT`                           |
| request cost       | 57,344 USD micros                                            |
| daily budget       | 現行$10を維持                                                |
| monthly budget     | 現行$100を維持                                               |
| API key            | 現行秘密の登録有無だけ確認。本文・画面共有・ログへ転記しない |

Provider Runtimeは既存30日研修や他のOpenAI処理と共有される。PR #1494は7タスクの互換性を合成応答で検証済みだが、実Provider成功の証拠ではない。ACTIVE切替は環境Gateと同じ保守時間帯・同じ承認記録で行い、切替後の実呼出しは内部1名STARTの別承認まで行わない。

## 4. 適用順序

各段階でProgramは`SUSPENDED`・実行`OFF`を維持する。

1. 対象SHA、CI、Vercel Ready、health/ready、DB schema currentを確認する。
2. STOP担当、監視担当、環境担当、復旧判断者、緊急連絡方法を記録する。
3. 対象Programと既存30日研修を画面上で照合する。
4. 未精算Personal Learning Callと共有Provider予約が0であることを確認する。
5. Pricing配列、Lesson Admission、Call Admission、Request Intakeの完成値を相互レビューする。
6. Production OpenAI Providerの追記版を作り、秘密を表示せず接続確認する。
7. Provider model、両Admission model、Pricing model、予約額57,344が完全一致することを確認する。
8. 承認済み環境設定を反映し、承認済みdeploymentへredeployする。
9. health/readyと、停止中Programが依然として準備中表示であることを確認する。
10. 管理画面のPilot準備Gateを再読込し、未確認項目を推測でチェックしない。
11. 既存30日研修がACTIVE・固定方式のままであることを確認する。
12. ここで停止する。Program START、実AI、LINEは別承認とする。

環境変数だけ、Pricingだけ、Provider modelだけを先行反映しない。途中失敗時は残りを続行せず、どこまで反映されたかを読み取り直す。

## 5. Go / No-Goチェック

| Gate              | PASS条件                                          | 現在             |
| ----------------- | ------------------------------------------------- | ---------------- |
| Code              | PR #1494 main反映、required CI成功                | PASS             |
| Program isolation | Personal Learning専用Program、既存30日研修不変    | 実行日再確認待ち |
| Provider          | 追記版、verified、terra、能力、予約額、予算一致   | UNKNOWN          |
| Intake            | Productionで`true`、承認済みdeploymentへ反映      | UNKNOWN          |
| Lesson Admission  | scope・model・上限・日次費用が完全一致            | UNKNOWN          |
| Call Admission    | scope・model・上限・日次費用が完全一致            | UNKNOWN          |
| Pricing           | terraの有効価格が完全一致、公式再確認済み         | UNKNOWN          |
| Participant       | 本人Enrollment、INTERNAL Seat、allowlist、同意    | 実行日再確認待ち |
| Operations        | STOP/監視/環境/復旧担当と連絡方法が記録済み       | UNKNOWN          |
| Cost              | Pilot日次$1、1回$0.057344、最大12回、共有予算維持 | 人間承認待ち     |
| LINE              | Feature OFF、送信対象外                           | 実行日再確認待ち |

1件でもUNKNOWNまたは不一致なら内部1名STARTはNo-Goである。

## 6. 停止条件と最大損失額

初回内部1名・Web限定の最大増分損失額は、Personal Learning Admissionの日次Hard Stop **$1** とする。次のいずれか1件で新規試行を止める。

- scope、Program、Enrollment、Seat、allowlist、同意の不一致。
- Intake、Lesson/Call Admission、Pricing、Provider modelの不一致・欠損。
- 原価UNKNOWN、利用量保存失敗、未精算予約、終了不明call。
- 実費または予約額が日次$1へ到達、または共有Provider予算の異常。
- Candidate、Assignment、Answer、Evaluationの重複。
- 他User、他Service、他Topic、既存30日研修への情報混入や回帰。
- AIが外部操作完了、公開成功、本人能力、合格を根拠なく断定。
- Provider認証、rate limit、timeout、不正応答が連続し、自動再送で二重課金の恐れがある。
- STOP担当、監視担当、復旧判断者のいずれかと連絡不能。

UNKNOWNを0円、未実行、成功とみなさない。停止後に同じ入力を再送しない。

## 7. 停止と復旧

1. 既存Pilot Operationsの`STOP`を最優先し、Program実行を閉じる。
2. 利用者入口が準備中表示へ戻り、新規Provider処理が拒否されることを確認する。
3. 未精算Call、実行中Job、Provider予約、評価PENDINGを読み取り、UNKNOWNを保持する。
4. LINE FeatureはOFFのままとし、送信や声かけを行わない。
5. 共有Providerを直ちに旧modelへ戻さない。既存30日研修への影響とProvider側状態を確認し、別承認で追記版を切り替える。
6. 原因、時刻、対象操作、一般化したエラー分類、予約/実費だけを記録する。Prompt、本文、秘密、個人情報を記録しない。
7. 再開は新しいGo判断とし、未知枠の削除、TTL、自動reset、安全制御の迂回を行わない。

## 8. 次の承認単位

本書の全UNKNOWNを権限者が画面上で解消し、設定候補値、担当者、最大損失額、適用時間帯、停止方法を承認する。その後に限り、停止状態のまま設定反映とGate再読込を実施する。

設定反映が完了しても内部1名STARTは別承認である。START後の最初の試験はWeb限定シナリオAとし、LINE、multiTopic、learningNudges、extendedScope、toolUpdatesを有効化しない。
