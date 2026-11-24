# マナベルスタイルのブラウザ実行基盤

2026-11-24。Phase 0 / PR-1。基点は main の `08310d4ddcf312113d93c50ebd3f4c16b031b707`。

## 決定

- 共通 Capability には構造化された実行契約を置く。Playwright、ブラウザ起動、証拠保存は独立した worker に置く。Next.js は Chromium を起動しない。
- 初回はリポジトリで管理する合成画面を Chromium に供給する。許可済みページ以外の取得、実アカウント、外部書込みを行う経路は提供しない。Docker の単体検証ではネットワークを無効にする。外部サイト対応には別途、ブラウザネットワークの分離と対象・操作の権限検証が必要。
- 共通の PostgreSQL ジョブの冪等キー、リース、再試行を再利用する。専用ジョブ種別を Web ワーカーの claim 対象から外す。PR-1 の起点は検証用 CLI とし、学習者からの依頼受付は後続の統合作業とする。
- 合成画面の操作証拠は、ステップ ID ごとの前後 PNG と限定されたアクセシビリティ情報を非公開の作業ディレクトリへ記録する。Trace・録画・セッション状態・通信ログの保存は導入しない。成功条件を満たしてから証拠を確定する。
- 既存の訓練データへの接続時は Enrollment の Workspace、Service、Program、User を再確認し、個人向け教材と共有レシピを分離する。原価は既存の AI 利用記録を使う。

## 再利用する経路

| 機能                                   | main の既存入口                                                                                          |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 自由希望・ヒアリング・個別カリキュラム | Program Enrollment に紐づく Personal Learning Request と動的提案                                         |
| 教材候補・AI Provider                  | `prepareLearningLesson`、`LearningCandidateRepository`、`openai-learning-lesson.ts` の構造化応答と費用枠 |
| 学習文脈・公式機能情報                 | `personal-learning-tool-feature-context.ts` のサーバー側の根拠解決                                       |
| 実践・対話・評価                       | `capability-training` の guided practice、相談、提出・評価と再開                                         |
| LINE・Web                              | Enrollment に紐づく `personal-learning-line-job-handler.ts` と Program 教材画面                          |
| 画像                                   | 既存の保護された相談画像保管。共通教材用には閲覧権限・保持期間を別に定義する                             |
| ジョブ                                 | `JobRepository` と `ClaimJob`、`CompleteJob`、`FailJob`                                                  |
| 原価・設定・分離                       | Program のサーバー側設定、利用枠と共通 AI 原価記録、候補保存時の Enrollment・版の再検証                  |

既存の動的提案は受講者本人の実践を目的とする。ブラウザ証拠は手順の裏付けとし、受講者の実践結果や理解度として扱わない。
