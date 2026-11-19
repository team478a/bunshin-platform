# Grok OAuth拒否理由の最小ログ追加報告

## 1. 調査した内容

PR #1535を隔離`grok-mcp-poc`環境へ反映し、新しいGrok接続からDCR clientを作成した。Supabase上の登録情報は、名前、public/dynamic区分、secretなし、callback、grant type、response typeの全項目でreviewed templateと一致したが、認可画面はfail closedとなった。

ブラウザから確認できる情報だけでは、server-sideのclient取得、認可詳細、User照合、scope照合のどこで拒否されたか判別できない。許可条件を推測で緩めず、固定理由コードだけを既存observability loggerへ残す。

## 2. 変更したファイル

- `apps/web/src/services/external-read-oauth-client.ts`
- `apps/web/src/services/oauth-consent.ts`
- `apps/web/test/external-read-oauth-client.test.ts`
- `apps/web/test/oauth-consent.test.ts`
- 本報告

## 3. 主要な設計判断

- メール、User ID、client ID、authorization ID、callback、Provider error本文はログへ保存しない。
- Productionの固定client ID不一致はログ増加を避け、従来どおり無記録で拒否する。
- stagingのDCR検証と認可詳細だけ、固定の`errorCode`で拒否段階を記録する。
- 認可条件、Grant、DB、MCP tool input、画面表示は変更しない。

## 4. 実行した検証

- web OAuth targeted test: 46件成功
- web typecheck: 成功
- lint、format、diff checkはPR作成前に記録する。

## 5. 未解決事項

- 隔離PoCへ反映し、新しい接続試行のVercelログから拒否段階を特定する必要がある。
- 原因が確定するまで、Grok実接続、本人同意、3 MCP tool、解除、他者拒否は未検証。
- 本番設定、本番DB、有料API、SNS投稿は変更していない。

## 6. 次Phaseへ進める条件

1. PR CIが成功する。
2. 隔離PoC環境だけへ反映する。
3. 固定理由コードに基づき、対象を絞った修正を別PRで行う。
