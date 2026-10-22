# 適用後のschema確認：GitHubのpooler接続（2026-10-22）

状態: Draft PR。田中が確認用接続の修正を承認した。CIの結果はPR本文に記録する。今回の修正作業では本番DB・秘密値・設定・flag・Vercelデプロイは変更しない。マージ順は#1387の後（mainへマージ済み）。

## 1. 確認した事実

- [Preview 39752054448](https://github.com/team478a/bunshin-platform/actions/runs/39752054448)は成功した。
- [Apply 39752566851](https://github.com/team478a/bunshin-platform/actions/runs/39752566851)は2026-10-22 18:05 JSTに`RELEASE_MIGRATIONS_APPLIED_AND_VERIFIED`を出力し、承認済み3件のSQL適用とPrisma履歴の照合に成功した。
- その後の`db:assert-ready`だけが`db.vtkzinaudznwbsjoyszk.supabase.co:5432`へ到達できず停止した。workflow全体のfailureをmigration失敗と解釈しない。**Apply・失敗run全体・migration SQLを再実行しない。**
- 適用runnerはpooler接続を構成していたが、後続の確認stepはGitHubの未変換`DATABASE_URL`を渡していた。通常の`db:assert-ready`はそのURLを使うためdirect hostへ接続した。秘密値の内容やDBのパスワードが間違っていると断定したものではない。

## 2. 修正

`verify-release-readiness-20261020.mjs`はGitHubの既存`DATABASE_URL`と`SUPABASE_SESSION_POOLER_HOST`を受け取り、確認用の子プロセス内だけでURLを構成する。

- 固定project `vtkzinaudznwbsjoyszk`、postgres role、postgres DB、入力port（directは5432、poolerは5432/6543）、明示確認語・production contextを検査する。別project・role・DB・不正port・資格情報不足は接続前に停止する。
- direct hostは既存の変換関数で同じprojectのpoolerへ接続する。通常runtimeと同じ`runtimeDatabaseUrl`で6543・`pgbouncer=true`・`connection_limit=1`を設定する。
- 入力のhost/schema/CA/options等のquery overrideは落としてpublic schemaに固定する。弱いTLS指定は拒否する。#1387の公開CA検査を小さな共通関数へ移し、migration側と確認側で同じ指紋・CA属性・有効期間の検査を使う。require + sslaccept=strict + 検証済みCAを設定する。
- 実行するのは既存`pnpm --filter @bunshin/database db:assert-ready`だけ（Prisma Client生成とlatest migration履歴のSELECT）。DDL、migrate deploy/resolve、履歴更新、アプリ機能やAI呼出は行わない。
- 接続10秒・socket 60秒、子プロセス全体3分、workflow 10分で制限する。子出力は最大64KiB相当をメモリ内で捕捉し、固定ラベルだけを出す。終了0でも成功markerがなければ成功扱いしない。自動再試行はない。

GitHub/Vercelのsecret自体、通常アプリのURL変換、通常`db:assert-ready`のロジックは変更しない。このGitHub確認の成功はVercelの実際の接続設定・実稼働SHA・画面の正常動作を代替しない。

## 3. マージ後に田中が行う確認

1. Draft PRをレビューし、verify / database CI成功後にマージする。
2. Actionsの **Verify production release schema (read-only, 2026-10-20)** をmainから手動実行する。
3. `project_ref`に`vtkzinaudznwbsjoyszk`、`confirmation`に`VERIFY_RELEASE_20261020_SCHEMA_TO_vtkzinaudznwbsjoyszk`を指定する。passwordやURLは入力しない。
4. 田中がProductionのreviewを承認する。main限定、contents read、既存applyと同じconcurrency groupで直列化される。
5. `RELEASE_SCHEMA_READINESS_VERIFIED`とworkflow成功を確認する。確認専用workflowにはmigration起動stepがない。
6. 成功後、[本番反映手順](PRODUCTION_RELEASE_PREFLIGHT_2026-10-20.md)に沿ってVercelのProduction環境・対象SHA・デプロイを確認する。Vercel側の通常`db:assert-ready`も引き続き必要。旗・cron送信・外部公開は別承認のまま。

失敗時は固定ラベルと対象runを確認する。readiness失敗を理由にApplyを再実行しない。今回のschema確認が成功しても、過去のApply runは後続step失敗の証跡として残す。

## 4. 検証・共有ファイル

- 単体: direct/session/transaction入力から正しいpoolerへ変換、対象・資格情報・TLS・CA期限の拒否、URL overrideの除去、SELECT gateだけの起動、時間切れ/marker不足/未適用時の停止、生エラーの非表示、確認専用workflowの権限と起動経路を確認する。
- 既存TLSテストを拡張し、使い捨てDBに対する実Prisma Clientの`assert-schema-ready.mjs`も実行する。正しいCA/hostnameで成功し、CAなし・誤CA・誤hostnameは拒否する。これはpooler自体の再現ではなく、接続先変換は単体で、TLSとschema SELECTは実Clientで別々に確認する。
- 既存DB統合・native release・TLS・標準verifyをCIで確認する。本番の確認専用workflowはこのPRのマージ後まで実行しない。
- 共有ファイルの変更: `docs/DECISION_LOG.md`末尾へ追記。`.github/workflows/apply-production-release-20261020.yml`の適用後確認stepを置換し、`.github/workflows/verify-production-release-20261020.yml`を追加する。Production承認・権限・既存applyの起動条件・SQL適用処理は維持する。
- schema、migration、LATEST_DATABASE_MIGRATION、依存、アプリ画面、flag、cron設定は変更しない。
