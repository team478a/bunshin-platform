# 専用リリースrunnerの公式CA・Prisma診断（2026-10-22）

状態: Draft PRで検証する。本番DB・設定・履歴・デプロイは変更しない。CI結果はPR本文に記録する。マージ順は#1385の後（すでにmainへマージ済み）。

## 調査

Preview [39744203995](https://github.com/team478a/bunshin-platform/actions/runs/39744203995)は`release-metadata-connection-failed`で停止した。この順序ではpsqlの接続・制限時間・履歴checksum・未適用3件・未記録DDLの検査は通過済みだが、Prismaの子出力が破棄されていたため詳細原因は断定できない。

資格情報なしのPostgreSQL STARTTLS検査で、対象session poolerの証明書はSupabase独自CAによるものであり、既定のtrust storeでは検証に失敗した。同じhostで公式CAを指定するとTLS 1.3・証明書・hostnameの検証に成功した。DBのstartup/authentication/SQLは送信していない。この検査はGitHub runnerからの実際のPrisma認証成功を証明するものではない。

## CAの取得元と固定

- 公式URL: <https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt>
- 配布先の根拠: [Supabase dashboardの公開設定](https://github.com/supabase/supabase/blob/dd09501bac34c283c85d30ab6e251ea95f231530/apps/studio/hooks/custom-content/custom-content.json)の`ssl:certificate_url`。[SSLConfiguration](https://github.com/supabase/supabase/blob/dd09501bac34c283c85d30ab6e251ea95f231530/apps/studio/components/interfaces/Settings/Database/SSLConfiguration.tsx)がこのURLを使っている。
- 保存先: `packages/database/scripts/certs/supabase-prod-ca-2021.crt`。公開CAだけであり、秘密鍵・DB passwordではない。実行時にネットワークから取得せず、レビュー済みファイルを使う。
- DER SHA-256: `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`。
- 有効期限: 2031-04-26 10:56:53 UTC。runnerは指紋・CA属性・有効期間を検査し、不正・期限切れなら接続前に停止する。将来のCA更新もPRで別途レビューする。

## 接続と失敗診断

同じCAの絶対pathをpsqlの`PGSSLROOTCERT`（verify-full）とPrismaの`sslcert`（require + sslaccept=strict）へ渡す。証明書検証・hostname検証を無効にしない。システムのtrust store、GitHub/Vercelの秘密値、本番DB設定は変更しない。対象project/role/DB/5432の制限は維持する。通常アプリの接続設定と既存`db:assert-ready`のruntime接続はこの修正では変更しない。

新しいPrisma wrapperは許可したprobe/resolveだけを実行する。probeは`BEGIN READ ONLY; SELECT 1; COMMIT;`だけ、resolveは既存どおり承認済みSQLのcommit後に履歴を登録する。Prismaの生出力はメモリ上で最大64KiBまで保持し、TLS・認証・到達不能・同時接続枠・起動失敗などの固定ラベルだけを外へ出す。probeの失敗とcommit後のresolve失敗は区別し、後者の`release-sql-committed-history-unconfirmed`を維持する。再試行・検査の省略・履歴の強制更新はしない。

wrapper/CLI/engineはpsqlのprocess groupを継承し、外側の全体期限で一緒に停止する。wrapperだけの別groupや別の常駐プロセスを作らない。SQLの制限時間・全体期限・advisory lockは維持する。

## 検証

- 単体: 両接続のCA・厳格検証、期限切れの拒否、エラー分類、生出力に含まれる架空秘密値の非表示、probe/resolveの操作制限とlock設定。
- 既存native psqlテスト: 正本260件の履歴照合、実3 SQL・Prisma履歴登録、checksum・lock・timeout・履歴失敗・再実行時の停止。
- 新規TLSテスト: 使い捨てのローカルPostgreSQLの前に、当該テスト内で生成したCA/サーバー証明書のTLSフロントを置く。psqlと実Prisma 6 CLIが、正しいCAとhostnameで成功し、CAなし・誤CA・誤hostnameで拒否されることを確認する。フロントから使い捨てPostgreSQLへの接続はローカルの平文であり、本番のpoolerそのものの再現ではない。生成した架空秘密鍵は一時ディレクトリだけに置き、終了時に削除する。本番資格情報は使わない。
- CIのverifyとdatabaseを確認する。本番Previewはマージ後に別途実施する。成功前にApplyへ進まない。

## 共有ファイルの変更

- `docs/DECISION_LOG.md`: 調査結果・未確定点・公式CAと安全な分類の方針を末尾へ追記。
- `.github/workflows/ci.yml`: 既存database jobの末尾にローカルTLSテストを追加。権限・本番workflow・scheduleは変更しない。

新規migration、SQLの再編集、schema、flag、依存追加、本番操作は含めない。
