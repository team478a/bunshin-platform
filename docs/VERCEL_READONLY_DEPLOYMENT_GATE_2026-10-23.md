# VercelのDB確認を読み取り専用にする

状態: Draft PRでレビューする。実装・自動検証・本番反映は別段階。本PRでは本番DBへの接続、migration適用、secret・設定・flag変更、デプロイを行わない。検証の最終結果とCIリンクはPR本文に記録する。

## 1. 調査と設計判断

- #1391後のVercelビルドは`prisma migrate status`の子プロセスが60秒で終了せず、`DEADLINE_EXCEEDED`で停止した。migrationは開始されていない。
- 前回の読み取り調査ではDB履歴263件が完了していた。poolerログに同じapplication_nameの認証成功とtransaction表示があったが、田中はDIRECT_URLがsession用5432であることを確認した。ログだけからport誤りと断定した説明は撤回する。Prisma CLIが待機する根本原因は確定しておらず、本PRをその原因修正の証明にはしない。
- 停止するCLIをビルドで再実行し続けず、migration適用を人手承認付きの別段階へ分離する。Vercelは通常runtimeと同じDATABASE_URLでPrisma Clientによる検証だけを行う。DIRECT_URLを再編集する必要はない。

## 2. 検証内容

`pnpm db:assert-ready`は生成済みClientを用意してから、独立したNode workerを起動する。workerはPrismaのmigration CLIを呼ばない。

1. 配布された全migration SQLのSHA-256を計算する。空の一覧・欠落ファイル・不正な名前は拒否する。既存Prisma/専用release runnerと同じLF/CRLFだけの互換性を認め、SQL本文の違いは許さない。
2. 同一のREAD ONLY・REPEATABLE READ transactionで、DBの全履歴とローカル一覧を照合する。未適用・未知のmigration・checksum不一致・未完了・有効な完了履歴の重複を拒否する。rollback履歴だけでは適用済みとしない。完了した再試行が1件ある場合だけ、同じchecksumのrollback履歴を許す。
3. 生成されたPrisma DMMFから`@@map`・`@map`を反映した必要テーブル・列・enum値を取り出し、同じsnapshotのDB catalogと照合する。利用者の本文・画像・AI記録は読まない。
4. すべて成功し、workerがexit 0と固定成功markerの両方を返したときだけビルドへ進む。不一致・接続失敗・時間切れ・成功marker欠落は停止する。DDL・履歴補完・自動再試行・別資格情報やCLIへのfallbackはない。

これはDB全体のdrift検査ではない。列の型・default・制約・index・RLS policyの完全一致、データの意味、本番画面の動作を保証しない。これらはmigrationレビュー・既存DB統合テスト・反映後smokeで確認する。enumの余分な値・余分なテーブルや列は互換な追加として許すが、必要なものの欠落は許さない。

## 3. 接続・時間制限・秘密情報

- DATABASE_URLだけを参照する。保存済みsecretは変更しない。Supabaseの5432は既存`runtimeDatabaseUrl`と同じ6543・pgbouncer=trueへ変換する。これは読み取り専用transactionに限る。migrationへ転用しない。
- Supabase poolerでは既存の公開CAのfingerprint・期限を確認し、sslaccept=strictで検証する。TLS無効化・不正証明書許可は拒否する。危険なhost/options/schema上書きも拒否する。その他の接続では既存TLS設定を保持する。
- 接続10秒、pool待ち10秒、socket15秒、transaction開始待ち10秒、transaction全体30秒。transaction内ではlock1秒、statement10秒、idle-in-transaction15秒。worker全体は60秒の既存プロセス監視で停止する。DB全体の設定変更や他sessionの強制終了はしない。
- 子プロセスの出力はメモリだけで検査し、親からは固定markerと固定失敗分類だけを出す。生の例外・SQL・接続URL・password・利用者データは出力しない。PG系環境変数による上書きはworkerへ引き継がない。
- production以外のVercelビルドは本番確認をskipした旨を明示し、DB検証済みとは扱わない。通常のCI/明示`db:assert-ready`実行はskipしない。

## 4. 適用・反映の手順（田中が実行する）

1. 対象main SHAと、直前の正常なproduction deploymentを記録する。
2. 未適用migrationがある場合は、バックアップ・復元担当・対象project・SQL・checksum・適用対象の完全一致を確認し、人手承認付きmigration手順のPreview→Applyを先に実行する。既存`apply-production-release-20261020.yml`は承認済み3件限定のまま。既に適用した3件は再適用しない。将来の別migrationは、その範囲をレビューした承認付き適用手順を別途用意する。
3. migration後に`pnpm db:assert-ready`の成功を確認する。不一致時は停止し、DB履歴を書き換えたり確認を無効化したりしない。
4. 本PRを田中が確認・マージした後、承認したSHAをVercelへ反映する。新buildCommandは`cd ../.. && pnpm db:assert-ready && pnpm turbo run build --filter=web`。Vercel Dashboardに古いBuild Command overrideがある場合は、田中が確認してこのコマンドと一致させる。コードのマージだけでDashboard設定が変わったとは扱わない。
5. ビルド内のDB確認成功→ビルド成功→deployment READY→production aliasの対象SHA→`/api/health/ready`→既存サービス画面・LINE入口のsmokeを確認する。ここまで終わるまで本番反映済みと報告しない。
6. 戻す場合は直前の正常deploymentへ戻す。DBの追加型migrationは戻さない。旧版を新しく再ビルドすると、旧履歴確認経路が再び止まる可能性があるため、既存の正常deploymentへのrollbackと区別する。

運用メール・cron・Program機能flagを新しく有効化しない。外部公開の承認も本PRには含まない。

## 5. 検証と変更範囲

- 単体: 履歴各不整合、テーブル・列・enum欠落、runtime URL変換、厳格TLS、固定ラベル、worker失敗・期限・成功marker、ビルド経路からのmigration除去。
- DB統合: 使い捨てDBの全migrationとモデルの照合、合成schemaでの不整合拒否、履歴が書き換わらないこと、実PostgreSQLのREAD ONLYによる書込み拒否。
- CIの使い捨てPostgreSQL初期化だけは明示`pnpm db:migrate:deploy`へ切り替える。その後に新gate、既存統合テスト、既存native transaction/TLS検証を行う。本番の承認付きworkflowは変更しない。
- 標準検証: format:check / typecheck / lint / test / build / git diff --check。最終結果はPR本文。

### 共有ファイルの変更

- `apps/web/vercel.json`: buildCommandから自動migrationを除去する。crons・scheduleは無変更。
- `.github/workflows/ci.yml`: 使い捨てDBの初期化を明示migrationコマンドへ変更する。本番workflowは無変更。
- `packages/database/test/database.integration.test.ts`: 新しいintegration caseのimport・登録を追加するだけ。
- `docs/DECISION_LOG.md`: 本判断を末尾に追記するだけ。

schema.prisma、migration SQL、LATEST_DATABASE_MIGRATION、依存、環境変数定義、通常runtime、機能コードは変更しない。
