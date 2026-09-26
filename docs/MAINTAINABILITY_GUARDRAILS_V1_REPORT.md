# Maintainability Guardrails V1 実装報告

## 1. 基準と目的

- 基準main: `b6e31943339db0f9f53dd4cbefdac1ae9a1cac6b`
- 基準production: `dc7bcdd2248ef51700f88f8d3e7e478fbed73032`
- 基準日時: 2026-09-26（Asia/Tokyo）
- 未マージPR: 0件
- main CI: CI、Production Health Smokeとも成功

本変更は、2026-09-26のユーザー指示に基づき、古いPhase停止指示を現在の状態へ合わせ、既存の設計境界を文書と自動検査で守る。アプリ動作、UI、権限、料金、DB Schema、生成Prompt、LINE、本番設定は変更しない。

## 2. 調査対象

- `AGENTS.md`、`README.md`
- `docs/BUNSHIN_PLATFORM_CODEX_SPEC_V1.md`
- `docs/ARCHITECTURE_PRINCIPLES.md`
- `docs/IMPLEMENTATION_ROADMAP.md`
- `docs/DECISION_LOG.md`
- Phase 1〜7の実装・完了・本番Gate文書
- 直近の機能別実装報告と保守性改善差分
- rootおよび各packageの`package.json`、`exports`、TypeScript設定
- `pnpm-workspace.yaml`、`turbo.json`、`eslint.config.mjs`
- `.github/workflows/ci.yml`
- 既存のmodule boundaryテスト

READMEには初期MVP時点の未実装説明が一部残るが、今回の目的は開発ルールと境界検査であるため、製品説明の全面改訂は別作業とする。

## 3. 現在のpackage責務と依存

| Package               | 主な責務                                     | 公開入口                       | 許可する主な依存                                      | 禁止する依存                                            |
| --------------------- | -------------------------------------------- | ------------------------------ | ----------------------------------------------------- | ------------------------------------------------------- |
| `platform-domain`     | User、Workspace、Bunshin等のドメイン型・規則 | `@bunshin/platform-domain`     | Node標準・自己完結した型                              | database、apps/web、Provider/UI実装                     |
| `shared`              | 共通Error等の小さな共有要素                  | `@bunshin/shared`              | 自己完結した共通要素                                  | database、apps/web、Provider/UI実装                     |
| `capability-contract` | Capability定義の契約                         | `@bunshin/capability-contract` | 自己完結した契約                                      | database、apps/web、Provider/UI実装                     |
| `application`         | Use case、Port、Policy、Job契約              | `@bunshin/application`         | contract、domain、shared                              | database、Prisma、Next.js/React、個別Provider、apps/web |
| `database`            | Prisma永続化とPort実装                       | `@bunshin/database`            | application、auth、capability、domain、shared、Prisma | 公開入口の迂回                                          |
| `capability-social`   | SOCIALの規則・Mission・結果                  | `@bunshin/capability-social`   | application、domain、shared                           | package内部入口の迂回                                   |
| `capability-fortune`  | 占い定義・Knowledge・Reading                 | `@bunshin/capability-fortune`  | capability-contract                                   | package内部入口の迂回                                   |
| `capability-resale`   | AI物販Policy・Runtime                        | `@bunshin/capability-resale`   | application                                           | package内部入口の迂回                                   |
| `capability-training` | AI研修Policy・Runtime                        | `@bunshin/capability-training` | application                                           | package内部入口の迂回                                   |
| `auth`                | 認証Portと現在利用者契約                     | `@bunshin/auth`                | application、domain                                   | package内部入口の迂回                                   |
| `config`              | 環境設定の検証                               | `@bunshin/config`              | shared、Zod                                           | package内部入口の迂回                                   |
| `observability`       | 観測用の共通契約                             | `@bunshin/observability`       | 自己完結                                              | package内部入口の迂回                                   |
| `apps/web`            | Next.js UI、HTTP、composition root           | アプリ内部                     | 公開package入口、必要なAdapter                        | package内部入口の迂回                                   |

`database → application/capability`はPort実装のため正当であり禁止しない。`apps/web`が公開入口からdatabaseとapplicationを組み立てることもcomposition rootの責務として許可する。Capability間の依存は今回一律に禁止しない。

## 4. 既存チェックとの差分

既存の多数の`*-module-boundary.test.ts`は、特定機能のファイル分割、認可条件、export形状を守る目的で有効である。一方、package全体の依存方向を共通に解析する検査はなく、`no-restricted-imports`も設定されていなかった。

今回追加する検査はTypeScript Compiler APIで次を読む。

- 静的`import`
- `export ... from`によるre-export
- 文字列Literalの`import()`
- `import type()`と`import type ... from`
- `import = require()`形式の外部module参照

## 5. 自動検査する境界

1. `platform-domain`、`shared`、`capability-contract`からdatabase/apps/web実装への逆流を禁止する。
2. `application`からdatabase、apps/web、Next.js/React、OpenAI、Gemini、LINE SDK、Stripe、Resendへの直接依存を禁止する。
3. 全workspace packageとapps/webで、packageの未公開subpath（例: `@bunshin/x/src/...`）を禁止する。
4. package間を相対パスで越える参照を禁止する。
5. packageの正規`exports`、databaseのPort実装、Web composition rootは許可する。

検査は`pnpm architecture:check`として実行でき、`pnpm lint`の先頭へ接続する。設定ファイルを置くだけではなく、既存CIの`pnpm lint`から必ず実行される。

## 6. 否定テスト

`pnpm test:architecture`は外部API・DBを使わず、fixture相当の仮想ソースで次を検証する。

- 許可されたapplication → sharedは成功
- application → databaseの静的importは失敗
- core → databaseのre-exportは失敗
- package間の相対越境は失敗
- application → databaseの動的importは失敗
- 未公開`src` subpathは失敗
- 公開入口からの型importは成功
- Web composition root → databaseは成功
- database → application Portは成功

禁止fixtureはアプリのTypeScript build対象へ入れず、Nodeのテスト内だけで解析する。

## 7. 既存例外

広いglob除外や自動更新するallowlistは設けない。正当な方向として次をルール自体へ明示した。

- `packages/database`から`application`、`auth`、Capabilityへの依存
- `apps/web`での公開packageの組み立て
- `capability-social`等からapplicationの公開Port/型への依存

これらは違反の黙認ではなく、現在のAdapter/Port構造で必要な依存である。新しい個別例外は0件。

## 8. 検査の限界

- 変数や文字列連結でmodule名を作る非Literalの動的importは検出しない。
- JavaScript/CommonJSの`require()`は今回のTypeScript source境界では使用されておらず、対象外。
- runtimeのデータ越境やRepositoryのwhere条件は既存の認可・isolationテストで検証し、この静的検査だけで安全性を保証しない。
- package.jsonの不要dependency宣言だけでは失敗させず、実際のsource参照を検査する。
- Capability間の依存方向は、共通化の確定判断がないため一律禁止しない。
- test/fixture内の参照は否定fixtureと実装テストを妨げないよう実コード検査の対象外。公開コードの`src`、Webの`app`/`src`を対象にする。

## 9. AGENTS.mdの整理

初期Phase 2前のレビュー条件を全体停止条件から外し、履歴文書として扱う。代わりに、変更前の最小読込資料、状態語の定義、標準検証コマンド、現在の依存境界を記載した。不変のMulti-Bunshin、Workspace/User/Bunshin isolation、Capability/Provider分離は維持した。

## 10. CI接続

既存workflow名と`verify`/`database` job名、検証順序は変更しない。

- `pnpm lint`: 実Repositoryのarchitecture check後に既存Turbo lint
- `pnpm test`: architecture checkerの否定テスト後に既存Turbo test

DB統合テストの対象や削除処理は変更していない。共有DB・本番DBでintegration testを実行しない。

## 11. 次PRの対象

このPRでは停止し、次を混在させない。

- 業務認可・Repository isolationテストの不足監査
- Daily Action取得処理の移設
- READMEの現行製品状態への全面更新
- 非Literal dynamic importやCommonJSを含む対象拡大
- Capability間依存の設計確定

## 12. 本番影響

本番デプロイは行わない。runtime code、DB、UI、Prompt、LINE、料金、権限には変更がない。

## 13. 検証結果

| 検証                          | 結果                                        |
| ----------------------------- | ------------------------------------------- |
| `pnpm test:architecture`      | 成功、9件                                   |
| `pnpm architecture:check`     | 成功、既存source違反0件                     |
| 変更7ファイルのPrettier check | 成功                                        |
| `pnpm typecheck`              | 成功、25 Turbo task                         |
| `pnpm lint`                   | 成功、architecture checkを含む25 Turbo task |
| `pnpm test`                   | 成功。境界fixture 9件、Web 1,419件を含む    |
| `pnpm build`                  | 成功、13 Turbo task                         |
| `git diff --check`            | 成功                                        |

Windows worktreeでの全体`pnpm format:check`は、今回未変更の2,117ファイルがCRLFとして展開され、Prettier 3.9.6のLF判定で失敗した。同じ基準main SHAのGitHub Actionsでは全体`format:check`が成功している。今回の変更ファイルは個別Prettier checkに成功しており、PRのLinux CIでも全体結果を再確認する。既存ファイル2,117件の一括改行変更は無関係な差分になるため実施しない。
