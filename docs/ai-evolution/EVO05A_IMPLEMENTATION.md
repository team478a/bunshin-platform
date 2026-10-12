# EVO-05-A マナベルスタイル本人再現Evidence契約

## 基準 / 作業単位

- 基準main: `3ecd3c6bf1063bfb1cc5ab338cec14437d480f40`（#1192 merge）。
- branch: `codex/ai-evolution-evo05-learning-evidence`。commit / PR / 最終CIはPRの検証追記を正本とする。
- #1188監査head `41daf16848308051baa548384855b8594eb2b8b2`のEVO-05/M2を参照。監査PRは未マージであり、現在のコードを優先した。
- 設計判断: [EVO05A_DESIGN_DECISION.md](EVO05A_DESIGN_DECISION.md)。EVO-05全体の完了ではなく、Manaberu最小契約の独立PR。

## 現行機能と再利用

| 正本 / 機能                                          | 今回の扱い                                                                                                  |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `application/learning-profile-goal.ts` Learner Scope | 同Workspace / Group / Enrollment / Membership / Userを比較。共通契約へAI固有項目を追加しない                |
| `capability-training/guided-practice.ts`             | 本人完了確認、SELF_PROMPTED / SELF_EVALUATED / 任意SELF_REVISED、支援量、Rule版、品質/Level UNKNOWNを再利用 |
| `database/guided-practice.ts`                        | 現在はAnswer READY、評価監査一致、対象Skill、PASS、hint/helpを再検証して保存。今回は変更・接続しない        |
| `learning-definition-fixtures.ts`                    | 既存3Definitionと版固定参照のみ。fixtureを承認済み扱いしない                                                |
| `learning-router.ts` / `skill-evaluation.ts`         | Definition identityと既存Skill Rule版を使用。Routerや評価基準自体は変更しない                               |

現行完了Evidenceは外部AI操作の直接観測ではなく本人申告。Assessmentは提出Promptに対する評価。成果物品質、本人習得、自力再現、転移を自動認定できる根拠ではない。今回この制約を解消済みとは表示しない。

## 契約

追加公開関数: `compareLearningReproduction`（既存`@bunshin/capability-training`公開入口）。Ruleは`AI_TRAINING_REPRODUCTION_EVIDENCE_V1`。

入力はbaseline / followUpの2件のみ。各件はScope、Goal / Plan revision / Definition / Assignment参照、固定題材カテゴリ、完了時刻、既存完了Evidence、評価参照。評価には独立したScope / Assignment / Answer / 評価時刻 / Rule版 / verified / resultを持つ。`verified`は認可済みRepositoryが保存Answerと評価監査・対象Skillを照合した投影を想定し、クライアントの自己申告を信用するAPIではない。

固定題材は`EMAIL_PRACTICE` / `REPORT_PRACTICE` / `INFORMATION_SUMMARY_PRACTICE`。これは合成練習カテゴリで、新しいDefinition、Mission、教材、業務対応機能ではない。現在のEventにこの題材キーは未記録であり、既存回答本文から推測補完しない。

結果:

- `EVIDENCE_AVAILABLE`: 同Scope / Goal / Plan revision / Definition版、異なるAssignment / Answer / 題材カテゴリ、後時点の完了、両方の既存版PASS評価・確認済み完了が揃う。
- `UNKNOWN`: 完了/評価欠損、未検証評価、REVIEW / WAIT / RECOVERY、版/参照変更、同課題/同Answer再送、同題材、時刻順序不整合等。理由コードを残す。
- 不正契約、別Scope/評価所有者、別Assignmentの評価、自由本文/未知fieldは例外で拒否。

支援量は`LESS_SUPPORT_RECORDED` / `SAME_SUPPORT_RECORDED` / `MORE_SUPPORT_RECORDED` / `UNKNOWN`。少ない支援でも習得済みとはしない。外部操作確認、成果物品質、Capability Level、転移確認は常にUNKNOWN。First Successの新規作成、Goal達成、Enrollment終了、Router遷移は行わない。

結果は再現性のあるimmutableな非永続projection。履歴上書き、集計、課金利用、Provider実行、副作用なし。題材カテゴリの違いは意味的な転移の独立検証ではない。

## Privacy / 認可 / 互換

相談、回答、成果物、System Prompt、Provider Response本文を新契約へ受け付けない。内部IDと列挙値だけを扱う。出力は公開Analyticsや管理画面へ自動送信しない。

Scope一致検査はアクセス認可そのものではない。今回DB/API/UI/Jobに接続しないため、既存認証、Pilot Flag、Allowlist、Hard Cap、Wave、Definition承認、Provider直前認可、Call Admission、V1 / LINE隔離の経路は不変。本番の挙動・データ・モデル・設定・OEM請求・Migrationに変更なし。

## 検証

- 新規contract: 37 tests成功。3Definition、自己申告の限界、支援比較、欠測、REVIEW/WAIT/RECOVERY、全5Scope境界、参照/版/時刻、再送、不正入力、deep freeze / deterministicを確認。
- capability-training全体: 26 files / 325 tests成功（P1-A/B/C/D/E、Policy、Mission、Skill、Guided Practice回帰を含む）。
- application全体: 136 files / 895 tests成功（Goal / Plan / Persistence / Operations / Admission等）。
- Web関連: 5 files / 43 tests成功（Pilot HTTP / access、LINE isolation、Provider前認可、Call Admission）。最初の`@bunshin/web` filterは対象なしだったため、正しい`web` filterで実行し直した。
- capability-training typecheck / lint / build成功。
- architecture:check成功、architecture否定/肯定10 tests成功。
- 最終変更のformat / 全体CI結果はPRへ追記。DB integration、全体typecheck / lint / test / buildはPR CIで確認する。

すべて合成/既存fake回帰。実Provider、実ユーザーの能力向上、スマートフォン操作、本番品質/再現性は未測定。本番DBへ接続しない。

## 未実装 / 引継ぎ / 停止

1. 次のManaberu接続PRでは、題材キーを本文なし・人間確認済みの固定課題から記録する方法、別時点課題の提示、現行Approval / Gate再確認、評価監査・Support投影、削除/保持・再送規則を設計する。現Eventにないキーを捏造しない。
2. 人間観察Rubric、独立再現/転移確認、Level判定、効果率や母数、UI、支援量自動調整は未実装。これを習得認定として利用しない。
3. ハッシーの履歴反映と採用/再開の同期間・同母数比較はEVO-05後続の別PR。EVO-06へは進まない。

本PR提出後停止し、人間レビューを待つ。rollbackは本PRのrevertのみ。DB rollbackやEvidence削除、Pilot停止操作は不要（本番未接続）。
