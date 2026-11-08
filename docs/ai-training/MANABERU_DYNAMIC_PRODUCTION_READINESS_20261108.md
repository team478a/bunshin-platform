# マナベルスタイル 動的AI研修の現在地と不足機能（2026-11-08）

## 1. 結論

**現在の本番は、内部1名の動的AI研修開始について No-Go。**

理由は動的学習エンジンの再開発不足ではない。自由希望から次課題・再開までのコード、API、UI、永続化、費用制御は最新mainと公開Vercelへ収録済みである。一方、実際の専用Programは `SUSPENDED`、実行 `OFF`、`FIXED_DEFINITIONS_V1`、全学習Feature `OFF` で、動的入口と候補生成・相談に必要な本番環境設定も不足している。実AI・実受講者で最初から最後まで成功した証拠はない。

したがって今回の判定は次のとおり。

- コード完成度: 限定Pilotを開始できる構成要素は揃っている。
- 現在の本番利用可能範囲: 既存30日研修、参加・同意確認、Personal Learningの停止状態での準備、専用LINE設定の確認まで。
- 動的学習の実利用: 現在は利用不可。
- 次の方針: 新基盤や固定教材を追加せず、既存設定の整合、1件の表示不具合修正、1名ずつの実運用検証を行う。

本書は読取監査と検証計画であり、DB、Migration、Feature Flag、Program、Provider、LINE、参加者、課金を変更していない。実AI呼出しとLINE送信も行っていない。

## 2. 監査基準と証拠

### 2.1 Git・CI・公開Deployment

| 対象                | 2026-11-08 JSTの確認結果                                                                                 |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| `origin/main`       | `1bb772785d7b63536ecd5946274f76490107cad8`、2026-11-07 15:03:31 JST                                      |
| `origin/production` | `9473b4294f0b6f36c339d659aca0e397637009f9`、2026-11-04 02:06:04 JST                                      |
| branch差分          | 共通祖先 `30244f48` から production側2件、main側46件。単純なfast-forward関係ではない                     |
| 公開alias           | `https://www.watashi-works.com`                                                                          |
| 公開Vercel          | `bunshin-platform-lj1udd70k-team478as-projects.vercel.app`、Ready、2026-11-07 15:04:28 JST               |
| 公開SHA             | `1bb772785d7b63536ecd5946274f76490107cad8`。公開環境は現mainと一致し、Gitの`production` branchより新しい |
| main CI             | GitHub Actions run `42345312108` の `verify` / `database` が成功                                         |
| 本番Smoke           | 公開SHAに対する複数の `Production Health Smoke` が成功                                                   |

`production` branch名だけで公開コードを判断してはならない。今回の公開Vercelは現mainを実行している。

### 2.2 実本番画面で確認した状態

| 項目                  | 実状態                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 既存30日研修          | `マナベルスタイル AI研修30日`、`ACTIVE`、全体実行 `ON`、`FIXED_DEFINITIONS_V1`、参加中2名                                                         |
| 動的学習用専用Program | `マナベルスタイル Personal Learning`、Program ID `d6a0d526-f3ac-455d-9f18-386ed833f70b`                                                           |
| 専用Program状態       | `SUSPENDED`、初期化済み、開始履歴なし、実行 `OFF`、`FIXED_DEFINITIONS_V1`、未精算Call 0                                                           |
| 専用Program Feature   | conversation / multiTopic / lineLearning / extendedScope / learningNudges が全て `OFF`。一般Program設定画面では toolUpdates も `OFF`              |
| 参加状態              | Personal Learningの参加中表示1名。監査アカウントにはEnrollment、内部Seat相当、現行AI利用同意があり、同意日は2026-10-20と表示                      |
| Definition承認画面    | `PERSONAL_LEARNING_DEFINITION_ADMIN` が有効でないため操作不可。なお動的モードのSTARTはサーバー実装上、旧3 Definition承認と固定Profileを要求しない |
| OpenAI                | Productionで接続確認済み・使用中、`gpt-5-mini`、有効設定の月額上限表示 `$100.00`、未精算予約なし                                                  |
| 専用LINE              | サービス専用LINE設定 v1 は使用中・接続確認済み。Webhook表示あり                                                                                   |
| 本人LINE              | 監査アカウントは未接続、通知同意チェックも未選択                                                                                                  |

既存30日研修は変更しておらず、専用Personal Learning Programと明確に分離されている。

### 2.3 Production環境設定

Vercel APIから値を開かず、Production entryの名前だけを確認した。

| 設定                                        | 判定                                                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------------------- |
| `PERSONAL_LEARNING_REQUEST_INTAKE`          | **未登録**。`personalLearningRequestEnabled()` はfalseとなり、動的ページ/APIは404       |
| `PERSONAL_LEARNING_LESSON_ADMISSION`        | **未登録**。候補生成、会話、途中支援、Persona推測、AI声かけはProvider送信前に設定エラー |
| `PERSONAL_LEARNING_PILOT`                   | entryあり。暗号化値は読んでいない                                                       |
| `PERSONAL_LEARNING_PRODUCTION_CLOSED_PILOT` | entryあり。暗号化値は読んでいない                                                       |
| `PERSONAL_LEARNING_PILOT_OPERATIONS`        | entryあり。準備画面の読取操作は利用可能                                                 |
| `PERSONAL_LEARNING_PRODUCTION_PREPARATION`  | entryあり。専用Service/Programを固定している                                            |
| `PERSONAL_LEARNING_CALL_ADMISSION`          | entryあり。値・Program scope・上限は今回読んでいない                                    |
| `PERSONAL_LEARNING_AI_PRICING`              | entryあり。実価格、発効日、model一致は今回読んでいない                                  |

`PERSONAL_LEARNING_CALL_ADMISSION` と `PERSONAL_LEARNING_LESSON_ADMISSION` は別用途である。前者が存在しても、後者を使う教材候補・会話・途中支援は実行できない。

## 3. 動的学習エンジンの実装状況

凡例: 「実装」はコード/API/保存経路、「本番可」は現在の実設定で利用できるか、「実証」は実AI・実受講者の成功証拠があるかを表す。

| 機能                      | 実装・接続                                                                           | UI・保存・次処理                                                          | 自動検証 | 現在本番可 | 実証               |
| ------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | -------- | ---------- | ------------------ |
| Personal Learning Request | `personal-learning-request` APIと版付きRequest repositoryあり                        | 自然文、端末、ツール、経験、現在地を保存・再取得                          | 成功     | 不可       | なし               |
| 学習テーマの理解          | AI候補が `READY / NEEDS_CONTEXT / OUT_OF_SCOPE` を返す。独立した固定分類表は持たない | 希望を固定メニューへ置換せず、必要時だけ最大4質問                         | 成功     | 不可       | 実AI品質は未実証   |
| 複数テーマ境界            | Topic単位でRequest、Goal、Plan、会話、実践を分離                                     | `multiTopic` ON時のみ最大4テーマ。現本番はOFF                             | 成功     | 不可       | なし               |
| Lesson Candidate          | OpenAI学習提案、厳格JSON Schema、本人確認、同版確認                                  | 候補を保存し、本人が表示済み版を確認するまで開始しない                    | 成功     | 不可       | なし               |
| Goal / Plan               | 確認済みCandidateから既存Goal / Plan / PlanRevisionを生成                            | 同一Goal配下、初版revision 1、旧履歴保持                                  | 成功     | 不可       | なし               |
| Dynamic Practice          | Assignment生成、開始、作業メモ、再訪                                                 | 旧6技能や固定Definitionの達成へ誤転記しない                               | 成功     | 不可       | なし               |
| AI Consultation           | 同一テーマ・同一Requestの会話スレッド                                                | 追加質問後の候補再生成、同じ画面で継続                                    | 成功     | 不可       | なし               |
| Practice Support          | 現課題・教材版・作業記録版に固定した相談。画像1枚対応                                | conversation Featureと共通費用枠を再利用                                  | 成功     | 不可       | なし               |
| AI Evaluation             | 証拠提出後に非同期Job、Provider再認可、費用予約・精算                                | `CURRENT_STEP_EVIDENCE / FOLLOW_UP / SELF_REPORT_ONLY / UNABLE_TO_ASSESS` | 成功     | 不可       | なし               |
| Result Review             | 提出revisionごとに本人申告と確認済み事項を分離                                       | PASS、能力点、Goal完了を推測しない                                        | 成功     | 不可       | なし               |
| Next Practice             | 確認結果から別Request revisionとして次候補を生成                                     | 本人確認後だけ次Plan revisionとAssignmentへ切替                           | 成功     | 不可       | なし               |
| Plan Revision             | 前Assignment・回答・評価を保持してrevisionを追加                                     | Goal全体を完了扱いにしない                                                | 成功     | 不可       | なし               |
| Learning Resume           | GET投影で現在Request、Candidate、Practice、支援、提出、次候補を復元                  | 新しい希望DRAFTがあっても実行中課題を暗黙切替しない                       | 成功     | 不可       | 実端末再開は未実証 |

主要実装は次を参照する。

- [自由希望仕様](MANABERU_FREE_INTENT_PRACTICE.md)
- [本番Runbook](MANABERU_PRODUCTION_RELEASE_AND_INTERNAL_TEST_RUNBOOK.md)
- `apps/web/app/s/[serviceSlug]/programs/[programEnrollmentId]/learning-request/`
- `apps/web/src/http/personal-learning-*.ts`
- `apps/web/src/services/personal-learning-*.ts`
- `packages/application/src/personal-learning-*.ts`
- `packages/database/src/personal-learning-*.ts`

## 4. AIによる個別指導の品質

### 構造上できていること

- 希望を固定教材名へ置き換えず、原文と本人申告環境を保存する。
- 不足時は `NEEDS_CONTEXT` で必要質問だけを返し、範囲外は `OUT_OF_SCOPE` と代替方向を返せる。
- Proposalは到達点、説明、例、本人の実践、証拠、基準を別項目にする。
- 会話と途中支援は、既知の端末・ツール・現在位置を再利用し、判明済み情報の聞き直しを抑える。
- Promptは代行完成、外部ログイン、投稿、公開、送信の実行・虚偽主張を禁止し、本人の次の一歩を必須にする。
- 評価は提出文に現れる証拠だけを扱い、本人申告を実物確認・独力再現・合格へ変換しない。
- Personaは本人確認済みとAI推測を分離し、削除・拒否済み情報を参照しない。

### 未検証

- 初心者、ホームページ作成、Excel業務改善で、質問数・提案難易度・説明の分かりやすさが適切か。
- 実AI応答が3テーマ以外の幅広い希望でも固定パターン化しないか。
- `extendedScope` OFF/ONで、最新ツール画面への案内精度と過剰断定が適切に変わるか。
- 評価結果が人間レビューと一致するか、次課題が実際の詰まりを解消するか。
- 実Token、実原価、待ち時間、失敗率、人手介入時間。

したがって「AI個別指導の構造は実装済み」だが、「指導品質が本番水準」は未証明である。

## 5. 利用者体験の監査

### 良い点

- サービスホームは「今日の学習」を最上部に置き、学習プログラムへ直接戻せる。
- 学習画面のコピーは「答えを代わりに作るのではなく、自分でAIを使えるようになる」を明示する。
- 希望、会話、候補、実践、相談、提出、次候補を同じ学習画面へ統合している。
- 内部用語の多くは管理画面側に留まり、受講者画面は短い日本語を優先する。

### 本番で確認した問題

1. **停止中Programのデッドループ（C: 不具合）**
   - 参加中一覧に停止中のPersonal Learningが「今日やることを見る」と表示される。
   - 遷移すると同意画面が「研修を開始できます」「研修を続ける」と表示する。
   - 「研修を続ける」は同じEnrollmentへ戻るが、停止中Programのため再び同意画面へ戻る。
   - 原因は参加一覧と同意状態がEnrollmentと同意だけでREADYを組み立て、ServiceProgramの `ACTIVE` を利用可能表示へ反映していないこと。実行側は正しく `ACTIVE` を要求する。

2. **現在の実状態とホームの期待が一致しない（B: 接続不足）**
   - ホームは「希望・現在の実践・前回の続きから進められる」と案内するが、動的入口は環境Gateで404となる。
   - Pilot開始前は「準備中」と明示し、無限遷移を避ける必要がある。

3. **実AI失敗時の利用者向け復旧はコードのみ（実利用未検証）**
   - 入力保持、再読込案内、同一操作の重複防止はある。
   - スマートフォンでの待ち時間、評価PENDING、Provider障害後の再開は実端末未検証。

## 6. LINE連携の完成度

| 項目               | コード                                            | 設定                                           | 有効化                   | 実送受信証拠 |
| ------------------ | ------------------------------------------------- | ---------------------------------------------- | ------------------------ | ------------ |
| LINE登録・本人接続 | あり。Personal LearningはBunshin作成不要          | 専用LINE v1接続確認済み                        | 監査本人は未接続・未同意 | 今回なし     |
| 学習開始への案内   | Web/LINE復帰URLあり                               | Program停止中                                  | 不可                     | なし         |
| 今日の学習通知     | N-1固定文面、N-2 AI文面、cron/outboxあり          | `learningNudges` OFF                           | OFF                      | なし         |
| 中断者への声かけ   | 休止・停止・頻度・冪等制御あり                    | Feature OFF                                    | OFF                      | なし         |
| 現在の学習への復帰 | テーマ・Enrollment付きURL、リッチメニュー実装あり | 標準リッチメニューは「公開内容を確認する」段階 | 学習用公開は未確認       | なし         |
| LINE上のAI対話     | inbound本文/画像、Job、Reply/Push経路あり         | `lineLearning` と `conversation` がOFF         | OFF                      | なし         |

専用LINE接続確認済みであることと、LINE上の対話学習完成は同一ではない。今回、送信操作は行っていない。

## 7. 不足の分類

### A: 設定だけで解決できる

- 専用Programを `DYNAMIC_V1` へ変更する。
- 最初は `conversation=true`、必要なら `multiTopic=true`。`lineLearning`、`learningNudges`、`extendedScope`、`toolUpdates` はWeb基本経路の成功後に段階化する。
- `PERSONAL_LEARNING_REQUEST_INTAKE` を承認済みProduction releaseへ追加する。
- `PERSONAL_LEARNING_LESSON_ADMISSION` を対象Workspace/Service/Program、model、回数、並行数、request/output上限、USD上限とともに追加する。
- 既存 `PERSONAL_LEARNING_CALL_ADMISSION` と `PERSONAL_LEARNING_AI_PRICING` の値・model・Program scope・発効価格を人間レビューする。
- 既存Pilot操作で対象1名をallowlist/Seatへ対応させ、STARTする。
- LINE段階では本人接続、通知同意、友だち状態、リッチメニュー、Featureを別々に確認する。

これらは今回変更していない。実値を推測してはならない。

### B: 既存機能の接続不足

- 停止中Programを参加一覧・同意画面へ「利用可能」と投影している。既存Program statusを表示判断へ接続すればよく、新しい管理基盤は不要。
- Pilot開始前の利用者ホームから、利用可能な学習へ到達できるかを統一して判定する必要がある。

### C: 既存機能の不具合

- 「今日やることを見る」→「研修を続ける」→同じ同意画面、という停止中Programの循環。再現済み。

### D: 本当に必要な未実装機能

現時点で、1〜3名のWeb動的学習を開始するための大規模な未実装機能は確認していない。明示的な業種分類器や固定教材追加も不要。実AI・実利用で価値不足が証明された場合だけ、限定した改善を別提案する。

## 8. 自動検証結果

Node.js `v24.21.0`、pnpm `10.10.0` を使用した。

| 対象                                                                                       | 結果                        |
| ------------------------------------------------------------------------------------------ | --------------------------- |
| Web動的UI・Request・Candidate・Conversation・Practice・Support・LINE・Pilot・Feature tests | 14 files / 124 tests passed |
| Application Request・Practice・Support・Plan・Pilot operations                             | 5 files / 98 tests passed   |
| Capability Training Pilot                                                                  | 1 file / 12 tests passed    |
| Database Personal Learning・分離・Profile・登録・Export/Delete/Retention                   | 9 files / 54 tests passed   |
| 合計                                                                                       | 29 files / 288 tests passed |

Database対象は初回にPrisma Client未生成で5 suiteがテスト収集前に失敗した。`pnpm db:generate`後、同じ9ファイルを再実行して全成功した。これはコード失敗ではなく新規worktreeの生成前提不足として記録する。

未実施:

- 本番DB直接SELECT、Migration適用、設定値の復号。
- 実AI、実LINE、実課金。
- スマートフォン/LINE内ブラウザの通しE2E。
- 実受講者の学習効果評価。

## 9. Go / No-Go

| 対象                          | 判定       | 条件                                                                 |
| ----------------------------- | ---------- | -------------------------------------------------------------------- |
| コードレビュー・合成テスト    | Go         | main CIと対象288 tests成功                                           |
| 本番設定の読取監査            | Go         | 値を開かず、画面・entry名・公開SHAを確認済み                         |
| 現在の本番で内部1名の実AI開始 | **No-Go**  | Program固定/停止、入口・Lesson Admission不足、デッドループあり       |
| 設定変更後のWeb限定1名テスト  | 条件付きGo | P0、承認済み設定、停止担当、実費上限、本人同意、START/STOP rehearsal |
| LINE対話テスト                | No-Go      | Web基本経路成功後、本人接続とFeatureを別承認                         |
| 外部モニター募集              | No-Go      | 1〜3名の通し成功・品質評価・原価・停止・再開証拠がない               |

## 10. 100名募集までの残作業

1. P0の設定整合と停止中Program表示修正。
2. 内部1名でシナリオAをWebのみで完走し、実費、待ち時間、停止、再開を記録。
3. 内部最大3名でA/B/Cを実施し、固定3テーマへのハードコードがないことを確認。
4. LINE本人接続→復帰リンク→通知→対話を段階別に実機確認。
5. 失敗率、原価、学習継続、本人による成果再現、人手介入を評価し、上限・サポート手順を実測で決める。
6. 10名程度の限定Waveを経てから、100名の募集可否を別判断する。自動拡大しない。

## 11. 次に実施する作業（最大3件）

1. 停止中Programの参加一覧・同意画面デッドループを小さなPRで修正し、状態別テストを追加する。
2. [最小改善・検証計画](MANABERU_DYNAMIC_FINALIZATION_PLAN_20261108.md) のP0設定表を人間レビューし、値・担当・停止方法を承認する。
3. 承認後、Web限定・内部1名・シナリオAから実AI通し試験を別作業として実施する。
