# マナベル個別LINEメニュー実装報告

2026-10-13。基準main: `cc9d86dd`（PR #1272）。PR #1272/#1273はmainへマージ済み。本番候補はproduction基点`0acb1944`からこの機能だけを限定適用する。

## 実装内容

- 既存の全員向け標準メニューは維持する。受講者が初期設定し、現在の課題があるとき、学習画面の「個別メニューをLINEに設定」から本人だけに個別メニューをリンクする。
- メニュー先頭は、本人に提示済みの現在課題タイトルを使って描画する。専用AI呼び出し・追加原価を避け、既存の課題情報を再利用する。残り3項目は「つまずきを相談」「実践を記録」「学習を再開」の共通ラベル。
- 4つの操作は同じEnrollmentの学習ページ内の対応箇所へ遷移する。AIが自由なURL・LINEアクションを生成することはない。
- 同じ利用者の既存メニューIDは再利用し、課題タイトルが変わったときだけ画像を更新する。タイトルのSHA-256とリンク時刻を記録して再送を抑制する。
- 操作時に本人のsession、Service / Workspace / Membership / User / Enrollment、Pilot実行条件、Profile/承認状態、現在課題、専用LINE設定、友だち状態をサーバーで再確認する。設定停止・資格失効・友だち未追加などの場合は拒否し、標準メニューを全体上書きしない。
- 個人メニューのID・リンク時刻・内容ハッシュ用の列を`group_line_connections`へ追加するmigrationを作成した。production用候補では5秒lock timeout・60秒statement/idle timeoutをtransaction-localに設定し、bounded migration一覧へ追加する。productionへは未適用。

## 設計判断

- PR #1272で導入した per-user link/unlink API境界を再利用する。
- LINE menu objectは1接続につき最大1個を維持し、更新時に新規作成しない。Messaging APIのRich Menu上限は公式アカウントあたり1,000件であり、新規作成はLINE APIを伴うため実機確認前に本番実行しない。
- 画像はサーバー側の固定レイアウトで生成し、課題タイトルはXML escapeと文字数制限を適用する。
- Prompt/AI runtimeへ再送しないため、AI APIキーは読まず、新規発行もしていない。メニュー作成・更新はAI課題生成とは別のLINE操作である。

## 未完了・未検証

- メニュー専用のAI生成は行わない。既存の課題タイトルを使う個別化であり、AIが利用者ごとの4項目全体を新規提案する機能ではない。したがって「AI生成の個別メニュー」の完成条件は満たしていない。
- 本番DB Migration、実LINE公式アカウントでの作成/表示/遷移/解除、実利用者の初回設定、実端末の表示は未確認。実AI呼出しも未実行。
- Enrollment期限切れ、LINE切断、アカウント停止後に残るLINE側menu objectのunlink/delete/削除処理は未実装。リンク先アプリは通常のEnrollment認可で保護されるが、古いメニュー画像がLINEに残り得るため、production運用前に削除・復旧Jobを追加する。
- LINE API成功後のDB更新に失敗したケース、LINE側でmenu objectが外部削除されたケース、同時実行の競合を本番同等のLINE APIでは確認していない。
- LINEアカウントが上限1,000件へ達した時のproviderエラー案内・管理画面上の資源監視は残課題。

## 次のGate

1. production基点release PRのCIとレビューを完了し、対象差分が本機能だけであることを確認する。
2. production merge前に、最新backup/restore手順、`_prisma_migrations`のpending/failed履歴、migration connection probe、DB role/RLSを実証する。未確認項目はPASS扱いしない。
3. LINE送信なしの本番Readiness Gateは`GO_LINE_PRODUCTION`の明示入力で実施する。実LINEのmenu作成は、対象テスト利用者・Enrollment・LINE接続を特定し、標準メニュー復帰を確認できる状態で別途実施する。
4. 少数の実利用者へ提供後、初期設定→LINEメニュー→課題→途中支援→結果→再訪の利用ログと手動介入を確認する。自動テストは学習効果の証拠にしない。

## 検証

- `prisma validate`（テスト用のダミー接続文字列のみ）とPrisma Client生成。
- Web unit tests: group rich-menu provider、default menu renderer、personal-learning pilot HTTP composition。
- Database readiness test。
- 変更対象のESLint、Web typecheck。
- production `/api/health/ready` の読み取り確認: `ready`、`databaseSchema: current`。この確認はbackup、migration履歴、DB role/RLS、LINE運用準備を証明しない。
- 実AI/実LINE、本番Migration、Deployは実行していない。
