# 深層鑑定の本番反映手順

現行の本番 `28026d86` を基点に、#1549〜#1559 の占い変更を取り込んだ候補は [本番向けドラフトPR #1560](https://github.com/team478a/bunshin-platform/pull/1560)。移行元は候補の `b3c7d9676c425116f4c324fc0972b835a8b21000` に固定する。候補の移行SQLや基点を変更した場合は、再照合して固定先を更新する。

## 本番DBの差分

2026-11-21に本番の `_prisma_migrations` をSELECTで確認した。個別占いv1の4件は適用済み。次の6件は未適用だった。

1. `20261121010000_fortune_reading_follow_ups`
2. `20261121020000_fortune_experience_quality`
3. `20261121030000_fortune_dynamic_intake`
4. `20261121040000_fortune_structured_understanding`
5. `20261121050000_fortune_deep_reading`
6. `20261121060000_fortune_intake_quality`

占い以外の未適用3件（xAI画像、外部AI MCP、外部読取ステージング）は候補の移行元に含めない。本番運用中の公開範囲は非公開・招待制、登録者0人、登録上限100人。運用画面で確認した本番の共通OpenAIモデルは `gpt-5.6-terra`。隔離評価のモデルは `gpt-5.2`。

## 反映順

1. ドラフトPRのCI結果と対象SHAを照合する。対象DBのバックアップと本番環境の接続を運用担当が確認する。
2. 本番作業を承認した段階で、`main` の **Apply Fortune deep reading migrations (2026-11-21)** を `preview` で実行する。入力は `APPLY_FORTUNE_DEEP_READING_SCHEMA_TO_vtkzinaudznwbsjoyszk`。既存のリリーススクリプトが読取専用で対象・適用履歴・チェックサム・未適用集合を検証する。
3. Previewの成功を確認し、適用を承認後に同じワークフローを `apply` で実行する。完了サインと `db:assert-ready` の成功を確認する。
4. 候補のDB履歴・固定SHA・CIが一致した状態で本番ブランチへマージし、Vercel Readyと公式ホストの `/api/health/live`、`/api/health/ready` を確認する。異常時はDB履歴を再確認し、未確認の再実行を避ける。
5. 公開準備のロゴ・問い合わせ先、利用規約、プライバシーポリシーを確定する。承認後に招待制のテスト参加者で、登録、鑑定、翌日の参照、同意撤回を確認する。AI試験とLINE通知は承認された範囲で実行する。

現在はリリース準備。ワークフローの追加による本番DB更新・公開設定変更はない。
