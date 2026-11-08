# マナベルスタイル 動的AI研修 最小改善・検証計画（2026-11-08）

## 0. 進捗と次の承認単位（2026-11-08追補）

P0-1はPR #1491、production Release PR #1492、migration manifest同期PR #1493で完了した。公開画面、CI、Vercel Ready、health/ready、停止中Programの準備中表示を確認済みである。

P0-2の読み取り監査と最初のProgram設定単位まで完了した。実AI・LINE送信は行っていない。

共有Provider互換性はPR #1494でmainへ反映し、`gpt-5.6-terra`を7タスクの厳格出力契約と費用予約で回帰確認した。Production設定は未変更である。次の承認資料は[P0-2 Production Gate一括レビュー票](MANABERU_P0_2_PRODUCTION_GATE_REVIEW_20261108.md)とし、Request Intake、Lesson/Call Admission、Pricing、Provider Runtime、担当・停止条件を分割せず照合する。

- 専用Program: `SUSPENDED`、実行 `OFF`、`DYNAMIC_V1`、開始履歴なし、未精算Call 0。
- Program Feature: conversationだけON。multiTopic / lineLearning / extendedScope / learningNudges / toolUpdates はOFF。
- 参加制御: `currentWave=0`、`currentWaveCap=0`、internal cap 1。Enrollment 1、ACTIVE/INTERNAL Seat 1、同意1。
- Production環境: `PERSONAL_LEARNING_REQUEST_INTAKE` と `PERSONAL_LEARNING_LESSON_ADMISSION` は未登録。Call Admission / AI Pricingはentryのみ存在し、値は未承認。
- OpenAI: Production v3 ACTIVE・verified、`gpt-5-mini`、日額 `$10`、月額 `$100`、1回見込み `$0.01`、未精算予約0。ただし `gpt-5-mini` は2026-12-11停止予定。
- LINE: サービス専用設定v1は使用中・接続確認済みだが、内部参加者は未接続。Web先行のため初回変更対象外。

変更は次の3単位に分け、各単位を別承認する。

1. **Program設定（完了）**: Personal Learningだけを `DYNAMIC_V1`、conversation ONへ変更済み。その他FeatureはOFF、既存30日研修は不変。
2. **モデル互換性（完了）とProduction費用Gate（次の承認単位）**: 2026-12-11停止予定の `gpt-5-mini` のまま新規開始しない。公式移行先 `gpt-5.6-terra` の共有Provider互換性はPR #1494で確認済み。Request Intake、Lesson/Call Admission、AI Pricing、Provider model・予約額は一括レビュー後に別承認で反映する。
3. **内部1名START**: STOP担当、監視担当、最大損失額、停止条件を記録し、Seat・同意・allowlist・参加Waveを再確認してから既存Pilot Operationsで開始する。実AI呼出しはこの単位の承認後まで行わない。

現在の判定は単位1と単位2のコード互換性まで完了、単位2のProduction設定反映と単位3の実行はNo-Goである。環境変数だけを先行追加しない。

## 1. 目的と境界

自由希望から本人の実践、評価、次課題、再開までを、既存の動的学習機能で1名が完走できる状態にする。固定教材追加、新分類基盤、新しい管理台帳、新しい承認フローは作らない。

本計画の前提は [現在地と不足機能](MANABERU_DYNAMIC_PRODUCTION_READINESS_20261108.md) と [既存本番Runbook](MANABERU_PRODUCTION_RELEASE_AND_INTERNAL_TEST_RUNBOOK.md) である。実行は別承認とし、今回は計画作成だけで停止する。

## 2. 優先順位

### P0: 1名のWeb通し試験を安全に開始できる状態

#### P0-1 停止中Programの利用者導線を修正する

分類: C（既存不具合）

最小修正:

- `apps/web/app/s/[serviceSlug]/programs/page.tsx` でProgram statusを参加一覧のaction判断へ渡す。
- `apps/web/src/services/ai-training-consent.ts` で停止中Programを `READY` と表示しない。
- 停止中は「準備中です。開始案内をお待ちください」と表示し、実行不能な「今日やることを見る」「研修を続ける」を出さない。
- `ACTIVE` 復帰後は既存リンクをそのまま再利用する。

追加テスト:

- ACTIVE + Seat + Consentでは「続ける」を表示する。
- SUSPENDED + Seat + Consentでは準備中表示となり、実行リンクを表示しない。
- 既存30日研修の表示・実行を変えない。
- 他Service/他User/他Enrollmentを表示しない。

影響: 表示と遷移だけ。DB、Migration、Program設定、AI、LINEを変更しない。

#### P0-2 既存設定を動的Pilot向けに整合する

分類: A（設定）＋B（共有Provider modelの接続確認）

実行順は必ず次のとおりとし、各変更は田中さんの別承認後に行う。

1. 公開SHAとDB schema readinessを再確認する。
2. 専用Personal Learning Programだけを対象にする。既存30日研修は変更しない。
3. 停止状態のまま `DYNAMIC_V1` へ変更する。
4. Web基本試験に必要な最小Featureとして `conversation=true` を設定する。
5. 最初の1テーマ試験では `multiTopic=false` のままでもよい。複数テーマはP1で検証する。
6. `lineLearning=false`、`learningNudges=false` のままWeb経路を先に確認する。
7. `extendedScope` と `toolUpdates` は初回品質比較の対象を明確にしてから選ぶ。根拠なくONにしない。
8. `PERSONAL_LEARNING_REQUEST_INTAKE=true` をProductionへ追加する。
9. `PERSONAL_LEARNING_LESSON_ADMISSION` を対象Workspace/Service/Programと完全一致させる。
10. `PERSONAL_LEARNING_CALL_ADMISSION`、`PERSONAL_LEARNING_AI_PRICING`、Provider Runtimeのmodel・上限・発効価格を照合する。
11. 内部1名のEnrollment、INTERNAL Seat、allowlist、現行AI利用同意を再確認する。
12. START前にSTOP担当、監視担当、実費上限、停止判断を記録する。
13. 既存Pilot OperationsからSTARTする。安全制御を迂回しない。

設定値は本書に推測で記載しない。Provider公式価格、契約上限、許容予算、実測を人間が確認する。

#### P0-2a 共有Providerのモデル移行を先に限定検証する

OpenAI公式の2026-11-08時点の[廃止予定](https://developers.openai.com/api/docs/deprecations)では、`gpt-5-mini` は2026-12-11停止予定、推奨移行先は `gpt-5.6-terra`。[`gpt-5.6-terra` モデル資料](https://developers.openai.com/api/docs/models/gpt-5.6-terra)ではResponses API、Structured Outputs、画像入力をサポートする。公式単価は入力 $2.00、cached input $0.20、出力 $12.00 / 100万tokens。

最小PRの対象:

- 共有Providerの非学習タスクmodel allowlistへ、公式移行先を追加できるか確認する。
- 動的Lesson、Conversation、Practice Support、Persona、既存30日研修評価の厳格JSON Schemaを合成応答で回帰する。
- Provider設定は全サービス共有のため、既存30日研修と他のOpenAI利用経路の拒否・誤変更がないことを確認する。
- `PERSONAL_LEARNING_AI_PRICING`、Lesson/Call Admission、Provider `requestCostUsdMicros` のmodel・価格・予約額を同時に更新する運用案を作る。
- Prompt改変や新AI基盤は行わない。互換性差分だけに限定する。

費用候補（承認前・未反映）:

- `dailyAttemptLimit=12`、`maxConcurrent=1`、`maxRequestBytes=16384`、`maxOutputTokens=2048`。
- 保守的予約式では1回最大 $0.057344、12回最大 $0.688128。Program日次Hard Stop候補 `$1`（`dailyCostLimitUsdMicros=1000000`）内。
- 上記は実使用料の予測ではなく、byteをtoken上限として扱う安全側予約。Provider Runtimeの日額 `$10`・月額 `$100`を緩めない。

このPRの対象・理由・影響・テストを人間承認してから実装する。PR前にProvider、環境変数、Pricingを変更しない。

#### P0-3 内部1名・Web限定でシナリオAを完走する

対象:

> AIを使えるようになりたいが、何から始めればよいか分からない

順序:

1. 本人Auth、Enrollment、Seat、同意を確認。
2. 自由希望を自然文で保存。
3. AIが不足情報だけを質問するか確認。
4. 本人が回答し、Candidateを確認。
5. 本人が明示的に開始。
6. 今日の実践を本人が行う。
7. 分からない点を同画面で質問。必要なら説明方法を変える。
8. 作業記録と証拠を提出。
9. 評価PENDING→READYを確認。
10. 本人申告と確認済み事項が分離されていることを確認。
11. 次候補を確認し、本人操作でPlan revisionを開始。
12. ログアウト/再ログイン後、同じ位置から再開。
13. STOPして入口とProvider実行が閉じることを確認。

P0完了条件:

- 上記13段階が1つのEnrollment/Topicで成立する。
- 2重Candidate、2重Assignment、2重評価、2重課金予約がない。
- 実Token、実費、応答時間、失敗、手動介入を記録できる。
- STOP後に新Provider呼出しが行われない。
- 既存30日研修が継続して利用可能。

### P1: 1〜3名で汎用性・継続・LINE復帰を確認

#### P1-1 シナリオB/Cを追加

- B: 「AIを使って自分でホームページを作りたい」
- C: 「毎日のExcel作業をAIで効率化したい」

成功条件:

- 3テーマ専用の分岐や教材名置換ではなく、同じ汎用Request/Candidate/Practice経路を使う。
- 目的、経験、時間、端末、利用ツールに応じて内容が変わる。
- 完成物をAIが代行せず、本人操作と確認可能な証拠が残る。
- 課題が難しい場合、会話または途中支援で一段小さい行動へ調整できる。
- 評価と実践結果が次候補に反映される。

#### P1-2 複数テーマと再開

1. `multiTopic=true` を別承認で有効化。
2. 同一受講者が2テーマを作成。
3. Request、Conversation、Goal、Plan、Practice、支援、評価がTopic間で混ざらないことを確認。
4. 片方を中断し、もう片方を進め、元のテーマへ戻れることを確認。

成功条件:

- Topic Aの会話・Memory相当・回答・次課題がTopic Bへ表示されない。
- URL、画面タイトル、現在の実践が利用者に理解できる。
- 4テーマ上限到達時に自然な案内が出る。

#### P1-3 LINEを段階化して確認

順序:

1. 本人接続と通知同意。
2. Web学習への復帰リンク。
3. 標準リッチメニューの公開内容確認と限定公開。
4. `learningNudges` の固定文面N-1だけを内部対象で確認。
5. 休止、停止、再開、頻度、重複防止。
6. `lineLearning=true` と `conversation=true` の内部限定対話。
7. 画像1枚、本文、現在Topic、現在Assignmentの対応確認。
8. 必要性が確認できた場合だけN-2 AI文面。

成功条件:

- 本人接続、友だち状態、通知同意、Feature、Program実行状態を送信直前に再確認する。
- Webリンクだけを「LINE対話完成」と扱わない。
- 同一通知・返信の重複送信がない。
- LINEから戻った先が現在のTopic/Practiceである。
- 参加者が「止める」「休む」を迷わず操作できる。

### P2: 小規模外部モニターへ進むための運用完成

P2で行うのは新基盤開発ではなく、実測に基づく調整である。

- 5〜10名の限定Waveでテーマの幅、離脱点、支援回数、評価品質を確認する。
- Provider失敗、原価UNKNOWN、評価滞留、LINE失敗の既存運用手順を実地確認する。
- 受講者向けの表示文と管理者の日常操作を、実際に迷った箇所だけ簡素化する。
- 月額/日額上限、並行数、timeout、支援回数は実測と公式上限で調整する。
- 本人がAIを使って成果を再現できたかを評価し、生成数だけをKPIにしない。

## 3. テスト別の成功条件

| テスト     | 必須成功条件                                                              |
| ---------- | ------------------------------------------------------------------------- |
| 登録・参加 | 正しいService/User/Enrollment/Seatだけが利用でき、他Userは404/拒否        |
| 希望入力   | 自然文を保持し、固定メニューへ勝手に置換しない                            |
| 追加質問   | 不足情報だけ、最大4問、回答後に候補を再生成可能                           |
| Candidate  | READY/NEEDS_CONTEXT/OUT_OF_SCOPEが内容と整合、本人確認前に開始しない      |
| Goal/Plan  | 確認済み候補と同じ内容・版で作成、重複なし                                |
| 実践       | 本人の操作が中心、AIが外部作業完了を主張しない                            |
| 途中支援   | 現課題・版・既知環境に固定し、説明方法を調整可能                          |
| 評価       | 提出物にない事実を認定せず、本人申告と確認済み事項を分離                  |
| 次課題     | 前結果を入力に使い、本人確認後だけrevision切替                            |
| 再開       | 再ログイン、通信失敗、評価待ちから同一状態へ復帰                          |
| 原価       | 各Provider試行にmodel/prompt/tokens/cost/latency/status、予約・精算が残る |
| 停止       | STOP後に新規Provider/LINE処理を許可しない。既存履歴は読取可能             |

## 4. 実行時の停止条件

次のいずれかで新規試行を停止し、既存STOP手順と運営確認へ移る。

- Program/Enrollment/Seat/Consent/allowlistの不一致。
- `PERSONAL_LEARNING_REQUEST_INTAKE`、Admission、Pricing、Provider modelの不一致・欠損。
- 費用上限超過、原価UNKNOWN、未精算予約、利用量保存失敗。
- 同じ操作でCandidate、Assignment、Answer、Evaluation、LINEが重複。
- 他User、他Service、他Topicの情報が表示またはPromptへ混入。
- AIが外部操作の完了、公開成功、本人能力、合格を根拠なく断定。
- AIが医療・法律・税務等の高リスク判断を断定し、安全な代替案を出さない。
- 評価がPENDINGのまま運用基準時間を超え、再送で二重課金の恐れがある。
- LINEが未同意者、未接続者、別Serviceへ送信される恐れがある。
- 既存30日研修へ影響が出る。

通信終了不明や原価不明を0円・未実行と推測しない。自動再送せず、保存済み状態とProvider側証拠を照合する。

## 5. モニター募集開始条件

### 内部1〜3名

- P0-1の表示不具合修正がレビュー・CI・本番反映済み。
- P0設定が対象専用Programへだけ反映され、30日研修が不変。
- 実AI上限、最大損失額、STOP担当、連絡方法が明確。
- シナリオAのSTOP rehearsalを含む1回の通し成功。

### 外部5〜10名

- A/B/Cを内部1〜3名で完走。
- 実費、失敗率、中央値/上位の待ち時間、手動介入が許容範囲。
- スマートフォンと再ログイン再開が成功。
- LINEを募集入口にする場合は、本人接続・復帰リンク・停止が実機成功。
- 同意文、問い合わせ先、データ削除、返金/費用負担の運用が確認済み。

### 100名募集

- 5〜10名限定Waveの結果を人間レビュー済み。
- 少なくとも主要な離脱・Provider障害・評価滞留・LINE失敗の復旧を実地確認。
- 100名時の予算、並行数、サポート時間を実測から算出。
- 参加枠拡大を自動化せず、別のGo判断を記録。
- 「AIを学んだ」ではなく「本人がAIを使って自分のできることを増やした」証拠を収集できる。

## 6. PR分割案

承認後も変更を混ぜない。

1. **PR-1: 停止中Program表示修正**
   - Web表示・read model・テストのみ。設定、DB、Migrationなし。
2. **Release作業: 動的Pilot設定**
   - コードPRと分離。既存Runbook、対象Program、env、STOPを明示承認。
3. **Evidence PR: 内部試験結果**
   - 秘密・本文・個人情報を含めず、成功/失敗、原価、時間、停止、未解決を記録。

## 7. 次Phaseへ進める条件

P0-1の小規模修正対象・理由・影響・テストについて承認を受けること。承認前にコード修正、本番設定、実AI、LINE送信へ進まない。
