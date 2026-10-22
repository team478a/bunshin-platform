# Vercelのmigration履歴確認：失敗理由だけを記録する

状態: Draft PRでレビューする。実装・自動検証と本番での原因確定を区別する。本修正の作業中に本番接続・設定変更・migration・デプロイを行わない。CI結果はPR本文に記録する。

## 調査結果と未確定点

- 本番で正常稼働中の`435d56e9625ac66fa88a934d42ce240819513219`は、10月19日のビルドで履歴の最新状態・schema readiness・ビルドの成功を記録している。この履歴確認処理は現在のmainにも存在する。
- [GitHubのread-only確認39777275519](https://github.com/team478a/bunshin-platform/actions/runs/39777275519)は成功した。ただしGitHubのDATABASE_URLと公式CAで構成した接続であり、VercelのDIRECT_URLによるPrisma CLIの履歴確認を証明しない。
- [Vercel最新失敗8zWoxqRhYwrJfsyv9Rpjk5UPCLhM](https://vercel.com/team478as-projects/bunshin-platform-web/8zWoxqRhYwrJfsyv9Rpjk5UPCLhM)はmain `93c24136c8a748c6f365610147196122ea7c5710`を対象とし、2026-10-22 22:36:29〜22:37:29 JSTの約60秒で履歴確認に失敗した。60秒のwatchdogと一致するが、ログが終了理由を区別しないためtimeout・認証・TLS・履歴不整合のどれかは断定しない。
- Vercelの保存済み接続情報はsensitiveで、APIから値を読み戻せなかった。値、長さ、hashを記録していない。URLを推測して追加変更するのではなく、すでに実行している失敗処理の情報だけを安全に記録する。

## 変更範囲

既存の`MIGRATION_HISTORY_CHECK_FAILED`の3箇所だけに、次の固定値を加える。

| 項目         | 表すこと                                                                              |
| ------------ | ------------------------------------------------------------------------------------- |
| `process`    | `EXITED`／`DEADLINE_EXCEEDED`／`START_FAILED`／`SIGNALLED`／捕捉した`EXCEPTION`       |
| `exit`       | 子が通常終了した場合の`ZERO`／`NONZERO`。それ以外は`NONE`                             |
| `history`    | 既存parserの`UP_TO_DATE`／`PENDING`／`NEEDS_REVIEW`／`UNKNOWN`。未判定は`NOT_CHECKED` |
| `diagnostic` | 既存分類器の固定ラベル。出力なしは`no-diagnostic-output`、例外は`not-available`       |

子出力はメモリ内で分類するだけで、そのまま表示しない。任意の`result.diagnostic`文字列は信用せず、既存の固定分類器を使う。例外本文・URL・password・SQL・credential比較値は出さない。新しい接続・診断SQL・自動再試行は追加しない。

接続先、資格情報、TLS、URL変換、timeout、実行コマンド、成功／失敗の条件、pending時の既存の処理は変えない。履歴失敗時は従来どおり終了1で停止し、後続のprobe・migrate deployを実行しない。

## 次の判断

- `DEADLINE_EXCEEDED`は確認プロセス全体の制限時間到達。DB自身のstatement timeoutや認証エラーと混同しない。自動でtimeoutを延長したり、再試行したりしない。
- `database-authentication-failed`／`database-unreachable`／`database-tls-failure`等は、それぞれの接続設定・経路・証明書を確認する。ラベルだけでパスワードreset・TLS検証無効化を行わない。
- `NEEDS_REVIEW`は接続失敗ではなく履歴レビューが必要。適用済みSQLやApplyを再実行しない。
- `EXITED`＋`ZERO`＋`UNKNOWN`は、確認コマンドは終了0でも出力を認識できていない。DB障害と決めつけずparser／CLIの出力を確認する。
- レビュー・マージ後、田中が承認した次のVercelビルドで固定ラベルを確認する。本PRをマージしても本番反映済み／問題解消済みとは扱わない。

## 検証・変更しないもの

認証・到達不可・TLS・接続／処理timeout・接続終了・権限・URL異常・未知出力・履歴不整合・例外を分け、秘密非表示、失敗時1コマンドのみ、60秒上限、正常時の既存分岐維持をテストする。実際の使い捨て子プロセスを停止させるテストも含む。DBには接続しない。

変更ファイルはrunner、既存テスト、この報告、`docs/DECISION_LOG.md`の末尾追記だけ。共有ファイルの変更はDecision Log追記のみ。migration、schema、LATEST_DATABASE_MIGRATION、依存、workflow、Vercel／GitHubの設定・秘密値、Program flag、利用者向け機能は変更しない。
