# Codex 並行作業ルール

この文書は `AGENTS.md` 10章から参照される。AGENTS.md と矛盾する場合は AGENTS.md を優先する。

複数のエージェント（Codex タスクなど）が同時に作業するときの衝突を防ぐためのルール。

## 1. 共通ルール

1. 作業開始時に最新の `main` から専用ブランチを作る。1タスク＝1ブランチ＝1PR。
2. 指示書の「触ってよい範囲」以外のファイルは変更しない。必要になったら変更せずに報告して止まる。
3. 2章の共有ファイルを変更した場合は、日本語の報告に「共有ファイルの変更」という見出しを作り、ファイル名と変更内容を1行ずつ書く。
4. PR作成後に別のPRが `main` にマージされたら、最新の `main` に rebase し、標準検証（`pnpm format:check` / `pnpm typecheck` / `pnpm lint` / `pnpm test` / `pnpm build` / `git diff --check`）をやり直してから報告を更新する。
5. 実装済み／検証済み／本番反映済みを区別して報告する（AGENTS.md 4章）。

## 2. 共有ファイル

複数タスクが同時に変更しやすいファイル。

| ファイル                                                                                                    | ルール                                                                       |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `docs/DECISION_LOG.md`                                                                                      | 末尾に追記のみ。既存の記載の編集・並べ替えをしない。衝突時は両方の追記を残す |
| `docs/IMPLEMENTATION_ROADMAP.md`                                                                            | 自分の作業の行だけを編集する。他タスクの行は触らない                         |
| `packages/database/prisma/schema.prisma`                                                                    | migration を作ってよいタスクだけが変更する（3章）                            |
| `packages/database/src/schema-readiness.ts`（`LATEST_DATABASE_MIGRATION`）                                  | migration を作ってよいタスクだけが変更する（3章）                            |
| `packages/database/src/index.ts`、`packages/application/src/index.ts`、`packages/capability-*/src/index.ts` | export の追加のみ。既存行の並べ替え・整形をしない                            |
| `packages/database/test/database.integration.test.ts`                                                       | integration case の登録の追加のみ                                            |
| `apps/web/vercel.json`（`crons`）                                                                           | cron の追加のみ。既存の schedule を変えない                                  |
| `packages/config/src/index.ts`（環境変数の定義）、`.env.example`                                            | 追加のみ。既存の環境変数の意味・必須条件を変えない                           |
| `package.json`、`pnpm-lock.yaml`                                                                            | 依存の追加は指示書で許可された場合だけ                                       |
| `.github/workflows/*`                                                                                       | 指示書で許可された場合だけ                                                   |

## 3. migration

- `LATEST_DATABASE_MIGRATION` は1つの定数なので、migration を作るタスクは同時に1本だけにする。
- 指示書で migration の作成を許可されていないタスクで migration が必要になったら、作らずに報告して止まる。
- migration を作るタスクで、先に別の migration が `main` にマージされた場合は、次を行う。
  - 自分の migration のタイムスタンプを、`main` の最新 migration より後に付け直す
  - `LATEST_DATABASE_MIGRATION` を自分の migration 名に合わせる
  - 報告に「migration の付け直し」として旧名・新名を書く
- 既に `main` にマージされた migration ファイルは編集しない。
- 特定の機能で migration が続けて追加されている時期は、田中が指示書で他タスクの migration を止める。

## 4. マージの順番

- 同時に進める PR は2〜3本までにする。
- マージ順は田中が決め、指示書に「このPRは ○○ の後にマージする」と書く。
- 後からマージする PR は、前の PR のマージ後に 1章4 の rebase と再検証を行う。
