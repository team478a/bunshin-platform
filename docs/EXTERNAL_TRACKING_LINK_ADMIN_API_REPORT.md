# 外部成果計測URL連携 管理API・監査 実装報告

## 1. 完了範囲

Phase 7-L2として、Organization WorkspaceのOWNER／ADMINが日常運用に使うサーバーAPIと監査基盤を実装した。

- グループ別設定一覧
- 外部システム登録
- 許可ドメイン登録
- 参加者と外部IDの登録・更新
- 専用URLの登録・下書き編集・有効化・停止
- 期限切れの実効状態表示
- 直近100件の監査履歴

CSV、管理画面、投稿差し込み、利用履歴は後続Phaseに分離した。

## 2. API

- `GET /api/workspaces/:workspaceId/external-tracking?groupId=:groupId`
- `POST /api/workspaces/:workspaceId/external-tracking/systems`
- `POST /api/workspaces/:workspaceId/external-tracking/domains`
- `POST /api/workspaces/:workspaceId/external-tracking/identities`
- `POST /api/workspaces/:workspaceId/external-tracking/links`
- `PATCH /api/workspaces/:workspaceId/external-tracking/links/:linkId`
- `POST /api/workspaces/:workspaceId/external-tracking/links/:linkId/activate`
- `POST /api/workspaces/:workspaceId/external-tracking/links/:linkId/suspend`

変更系はSame-Originを必須とし、JSONをZodで検証する。全応答はprivate／no-storeとする。

## 3. 安全設計

- APIの入力したAllowlist情報を信用せず、サーバーがDBから許可ドメインを再取得する。
- URLはHTTPS、hostname Allowlist、認証情報なし、fragmentなし、既知の個人情報queryなしを再検証する。
- Workspace OWNER／ADMIN以外は管理できない。
- Group、System、Domain、Member Identity、Product Pack、Campaignの一致をRepositoryで確認する。
- ACTIVE URLは直接編集せず、一度停止してから変更する。
- 同一scopeのACTIVE重複は既存DB制約とRepositoryの両方で拒否する。

## 4. 監査

作成、更新、有効化、停止を同じDB Transaction内で監査記録する。監査にはURL全文、referral token、外部参加者IDを保存せず、状態・scope・許可ドメインID・有効期間など必要最小限のみ保存する。

## 5. 検証

- 未認証アクセス拒否
- Cross-Origin変更拒否
- Allowlist外URLの保存前拒否
- AllowlistをDBから再取得するService契約
- ACTIVE編集をRepositoryで拒否する契約
- Application／Database／Web typecheck
- Prisma validate
- lint、unit test、typecheck

## 6. 次Phase

L3ではProduct Pack VersionとSNS別URL配置テンプレートの責務を確定する。L4で`{{referral_url}}`の決定的差し込みと、生成時URL Snapshotをatomicに保存する。
