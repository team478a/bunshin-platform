# ハッシー企業・グループ型SNS発信支援 引き継ぎ書（2026-11-13）

- 対象: `origin/main` `d44e406`（PR #1522 merge後）
- 作成: Claude Code（Codexへの引き継ぎ用）
- 元の依頼: 「ワタシワークス｜ハッシー企業グループ型SNS発信支援 実装指示書」（2026-11-13）と、その前段の「企業・グループ型広告サービス」監査依頼
- 必読: `AGENTS.md`、`docs/BUNSHIN_PLATFORM_CODEX_SPEC_V1.md`、`docs/ARCHITECTURE_PRINCIPLES.md`、`docs/DECISION_LOG.md`（2026-11-12〜11-13の記録）、`docs/GROUP_AD_CAMPAIGN_SERVICE_AUDIT.md`、`docs/GROUP_PARTNER_LINE_ONBOARDING_PLAN.md`

## 1. 目的と完成条件（指示書の要約）

企業・団体が発信協力メンバー（発信パートナー）を募集・管理し、各メンバーの日常SNS活動と企業の情報発信を組み合わせられるようにする。企業が発信企画（Campaign）を管理し、参加者が自分の意思で投稿する。Museなどの外部AIは制作支援に使うが、利用は必須にしない。

最初の完成条件: **1企業・5人の発信パートナー・1Campaignを、スマートフォンと既存の専用LINEで一通り運用できること。**

- 企業が公式情報（商品情報）を登録し、Campaignを公開できる
- 5人が専用LINEから参加し、参加・辞退できる
- 各メンバーが自分の日常投稿と企業企画を選べ、企業の素材を使える
- 必要な企業確認が機能し、投稿文をコピーし、投稿結果を本人が記録できる
- 企業が参加・活動状況を確認できる
- Museを使わなくても全体が成立する

守ること（指示書・AGENTS.md）:

- 新しいSNS基盤、汎用AIエージェント、新規DBテーブル、ワークフローエンジン、課金基盤、別のグループ階層モデルは原則作らない。既存のWorkspace / Service（Group）/ Membership / Bunshin / SOCIAL / Campaign / Product Pack / External Tracking / Posting Approval / OEMを再利用する
- 千ノ国メディア固有のブランド・名称・ルールを他Serviceへコピーしない。マナベルスタイル連携は任意の将来連携
- 一般顧客向けLINEと発信パートナー向けLINEを分ける。企業担当者はWeb管理画面を使い、運営者専用のLINEは作らない
- SNS投稿の本人承認と、企業管理者の広告確認は別の権限
- 投稿完了の本人申告を、外部SNSで確認された公開と混同しない。クリック・問い合わせ・成約は信頼できる外部データがある場合だけ表示し、計測できない値を0件と表示しない
- 本番公開、本番DB変更、外部SNS投稿、LINE実配信、実Providerへの有料呼出し、PRマージは承認なしに行わない
- migrationは許可がある場合だけ作る（`docs/CODEX_PARALLEL_WORK_RULES.md`）

## 2. 完了した作業（すべてmainにマージ済み・本番反映は未確認）

「実装済み」はコードがmainにあること、「検証済み」は自動テスト（unit / 使い捨てPostgreSQLでのintegration）とCIの成功を指す。画面での手動確認と本番反映は、どのPRも行っていない。

| PR    | 内容                                                                                                                                                                                                                                                                                                                             | 主な変更箇所                                                                                                                                                                                        |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1516 | Campaign投稿案のコピー時に、Campaign OPEN・期間内、参加ACCEPTED、Group所属ACTIVE・同意済み、商品版PUBLISHED＋割当ACTIVEを再確認（満たさなければ`CAMPAIGN_UNAVAILABLE`）。承認後に別案を初めて選ぶと確認依頼をPENDINGへ戻し、本文を別案に差し替え、監査`RESUBMITTED`を残す（再承認方式）                                          | `packages/database/src/daily-mission-access-repository.ts`、`mission-content-variant-repository.ts`                                                                                                 |
| #1517 | 企業ServiceのBunshin（組織Workspace・同じGroup・本人所有・Service同意済み）がCampaignへ参加・保留・辞退・取消・再参加できる。参加時に、本人の明示同意（`productPackConsent`）でCampaignの商品版を同一Transactionで割り当てる。既存の商品割当APIでも他Serviceの商品を割り当てない。参加者画面 `/s/{slug}/bunshins/{id}/campaigns` | `packages/database/src/campaign.ts`、`product-catalog.ts`、`packages/application/src/campaign-participation.ts`、`apps/web/app/s/[serviceSlug]/bunshins/[bunshinId]/campaigns/page.tsx`             |
| #1518 | 確認ルールを「確認する」に変えた時、公開中Campaignの未完了・確認依頼なしの投稿案にも確認依頼を作る。終了・中止したCampaignの確認待ちは承認不可。確認画面の本文をJSONから投稿案と同じ表示へ。確認処理を `PrismaCampaignPostingApprovalRepository` に移した                                                                        | `packages/database/src/campaign-posting-approval.ts`、`apps/web/app/s/[serviceSlug]/manage/post-approvals/page.tsx`                                                                                 |
| #1519 | Campaign作成画面の生成制御5項目（週の関連投稿2、週の商品紹介1、間隔2日、1人60件、類似度85%）を既定値のまま「詳細設定」へ。投稿完了を`PostRecord.source`で分け「投稿完了（本人申告）」と表示し、公式API確認済みは件数がある時だけ別表示。運営メニューに「発信企画（参加募集）」を追加                                             | `apps/web/app/(app)/admin/campaigns/campaign-admin-editor.tsx`、`campaign.ts` の `listManaged`                                                                                                      |
| #1520 | 管理トップに「日常の4業務」（参加者・発信企画・公式素材・活動状況）を追加。商品情報か企画が1件以上あるSOCIAL運用Serviceだけ表示（業務日報型・占い・研修専用は除外）。件数を取得できない時は0件と表示しない                                                                                                                       | `apps/web/app/s/[serviceSlug]/manage/service-management-home-*.ts(x)`、`service-management-view-model.ts`                                                                                           |
| #1521 | 企業向けテンプレート `ENTERPRISE_PROGRAM` の初期質問を6問→3問（利用SNS、発信テーマ、使える時間）。会社での役割・商品などを聞かない。新規Service作成時だけ適用                                                                                                                                                                    | `apps/web/src/services/service-creation-templates.ts`                                                                                                                                               |
| #1522 | 商品情報か企画があるServiceの専用LINEでは、標準リッチメニュー公開時に「今日の投稿・グループの企画・公式素材・マイページ」の4ボタンを使う（監査テンプレート名`PARTNER_V1`）。`/s/{slug}/campaigns` を入口に追加。DB変更なし                                                                                                       | `apps/web/src/line/default-rich-menu.ts`、`group-rich-menu-provider.ts`、`rich-menu-layout.ts`、`apps/web/src/http/group-line-configurations.ts`、`apps/web/app/s/[serviceSlug]/campaigns/page.tsx` |

## 3. 主要な設計判断（DECISION_LOGに記録済み）

1. Campaign投稿案はコピー時点の参加条件と、企業が確認した本文で判定する（再承認方式）。別案生成を禁止する設定は要望が出た場合のP2
2. 企業ServiceのBunshinは参加時の本人同意で商品版を割り当てる。Bunshinごとに有効な商品パックは1つという既存規則を維持し、別商品を使用中なら`CONFLICT`（黙って差し替えない）。取消・辞退では割当を外さない
3. 確認ルールの有効化は既存の投稿案にも適用し、終了したCampaignは確認しない。「確認する」→「確認しない」へ戻した時の既存確認待ちは従来どおり残る
4. 企業向けCampaign画面は日常操作を先に出し、投稿完了は本人申告と明示する
5. 「日常の4業務」とパートナー向けリッチメニューは、新しい設定項目を作らず「商品情報か企画があるか」というデータで表示を判断する
6. 専用LINEのリッチメニューはボタン配置と移動先をコードで決めている。DBのenum `LineRichMenuAction` は共通LINEのメニューだけで使うため、専用LINEの変更にmigrationは不要

## 4. 未完了の作業（指示書の残り）

| 優先   | 作業                                                                                                                                                    | 状態・メモ                                                                                                                                                                                              |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 最優先 | 非本番での通し確認（1企業・5人・1Campaign、スマホ・LINE内ブラウザ・専用LINE）                                                                           | 未実施。ローカルには開発用ログイン手段がなく、非本番環境と専用LINEの検証用チャネルが必要。ユーザーへ環境情報を依頼中                                                                                    |
| 高     | 本番反映と反映後の作業                                                                                                                                  | 未実施。反映後、専用LINEは管理画面から標準メニューを公開し直すと新メニューになる。既存Service（千ノ国メディア等）に商品情報・企画が既にあると、管理トップのカードと新メニューが出る（本番データ未確認） |
| 高     | Phase 3: 投稿画面を「自分の投稿」と「グループの企画」に分ける。投稿頻度を本人が設定できる。投稿案の利用方法（そのままコピー・自分で編集・Muse等で制作） | 未着手。現状は企画への参加を投稿パートナーホームの「グループの企画」から選ぶ。Campaign投稿案はDaily Missionの計画に混ざる（`planningWhere` / Campaignの頻度制御）                                       |
| 中     | Phase 4: Muse等へ渡す制作指示の生成（投稿目的、対象SNS、発信スタイル、公式商品情報、使用許可素材、必須の広告表示、禁止表現、推奨形式）                  | 未着手。コピー・共有を優先し、新しい自動投稿エンジンは作らない                                                                                                                                          |
| 中     | Phase 4: Muse Connectorの監査と差分設計                                                                                                                 | 未着手。既存の外部読取OAuth・本人同意（`ExternalReadGrant`、`/s/{slug}/bunshins/{id}/connections`）を監査する。Muse側の認証・Connector仕様は推測で実装しない。実機接続は独立した検証環境で行う          |
| 中     | Phase 5の残り: 管理画面で参加者ごとの参加状態・LINE利用状況を見る                                                                                       | 未着手。「日常の4業務」は既存画面への入口を追加しただけ                                                                                                                                                 |
| 低     | 別商品を使用中のBunshinが別商品の企画へ切り替える手順                                                                                                   | 現状は`CONFLICT`で止まる（参加画面に案内文あり）                                                                                                                                                        |
| 低     | 公式素材だけの一覧画面                                                                                                                                  | 現状は企画画面の素材一覧（`#materials`）へ移動する                                                                                                                                                      |
| 低     | 専用LINE設定画面の、LINE Developersで準備する項目の案内文の見直し                                                                                       | 非本番の専用LINEチャネルで接続確認しながら行う                                                                                                                                                          |
| 低     | 企業A/B分離の残りの自動テスト（ブランド、利用権限、LINE配信先）                                                                                         | 承認・コピー・参加・商品割当・実績集計の分離は統合テスト済み。設計は `GROUP_AD_CAMPAIGN_SERVICE_AUDIT.md` §6                                                                                            |

先行テストの判定: **No-Go**。理由は非本番での通し確認と本番反映が未了のため。

## 5. 検証方法とテスト

標準検証（AGENTS.md）:

```bash
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
git diff --check
```

環境メモ（このセッションで必要だったもの）:

- Node 24 で実行した（`/opt/node24/bin`）。typecheck / lint / build はメモリ不足になるため `NODE_OPTIONS=--max-old-space-size=6144` が必要
- 別ブランチのbuild後に typecheck が `.next/types` の古い型で失敗することがある。`rm -rf apps/web/.next` で解消
- 統合テストは使い捨てPostgreSQLが必要。preflight（`packages/database/test/integration-database-preflight.ts`）が接続先を厳格に確認する: `NODE_ENV=test`、`APP_ENV=development`、`DATABASE_URL`と`DIRECT_URL`が同一、`127.0.0.1:18998`、DB名`bunshin_disposable_{BUNSHIN_TEST_RUN_ID}`、DBコメント`bunshin-disposable-test:{RUN_ID}`
- 手順: 新しいDBを作成 → `pnpm --filter @bunshin/database db:migrate:deploy` → `db:assert-ready` → `cd packages/database && npx vitest run test/database.integration.test.ts`
- 同じDBで統合テストを2回続けて流すと、既存の「Manaberu public training configuration migration」テストが1件失敗する（今回の変更とは無関係）。毎回新しいDBで実行する

今回追加した統合テスト（`database.integration.test.ts` から登録）:

- `campaign-posting-approval.integration-cases.ts`: 企業A/B独立Serviceでの参加・同意・取消・再参加・退出、他社Campaign・商品の拒否、確認待ち・見直し依頼・承認、別案の再承認、Campaign条件変更でのコピー拒否
- `campaign-posting-approval-rules.integration-cases.ts`: 確認ルール有効化時の既存投稿案、終了・中止Campaignの確認拒否
- `campaign-metrics.integration-cases.ts`: 投稿完了の本人申告と公式API確認の内訳

## 6. 既存テスト・規則で引っかかりやすい点

- 本番コード（コメント含む）で旧用語「分身」「BUNSHIN」を使うと `apps/web/test/posting-partner-terminology.test.ts` が失敗する。画面文言は「投稿パートナー」、コメントは「Bunshin」と書く
- `/s/{slug}/...` に新しいページを作ったら、LINEログイン後の戻り先の許可リスト `apps/web/src/auth/line-return.ts` に追加する（`service-auth-route-inventory.test.ts` が検査）
- `service-business-free-participant-scope.test.ts` は、投稿パートナー詳細画面で特定の条件式文字列を禁止している。業務日報型Serviceに企画・商品の導線を出さない意図
- 共有ファイル（`docs/DECISION_LOG.md`、`IMPLEMENTATION_ROADMAP.md`、各packageの`src/index.ts`、統合テストの登録行）は追加のみ。複数PRが同時に末尾へ追記するとコンフリクトするので、先にマージされた側に合わせてrebaseする
- mainへのマージには必須チェック `verify` と `database` の成功が必要で、ブランチがmainより遅れているとマージが拒否される

## 7. ユーザーの判断・依頼事項

- 非本番の検証環境と、専用LINEの検証用チャネルの情報（通し確認に必要）
- 本番反映の時期と手順（mainへのマージは本番反映ではない）
- Phase 3とPhase 4のどちらから進めるか（このセッションでは未回答）
- 管理トップを全Serviceで4業務へ全面再編するかは保留（他OEM Serviceへの影響があるため、今回はデータ条件付きのカード追加にとどめた）
