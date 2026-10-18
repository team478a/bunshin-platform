# PR-F LINEでの学習 実装報告

## 1. 調査した内容

- 専用LINE Webhookの署名検証、受信イベントの処理、LINE Push APIの再試行・重複防止を確認しました。
- D-2のテーマ判定、PR-Cの同一スレッド会話、実践相談画像の正規化、AI利用Admission、Decision 6の研修データ保持・書き出し・本人削除の経路を確認しました。
- LINE Messaging APIの月間利用量は、保存済みアクセストークンをサーバー内で復号し、既存アダプターのQuota APIから取得する設計としました。キーやトークンの値をソース、ログ、報告へ出していません。

## 2. 変更したファイル

- `apps/web/src/line/webhook.ts` — テキスト／画像受信の検証、Webhookイベントの永続化境界。
- `apps/web/src/jobs/personal-learning-line-job-handler.ts` — 受信後の資格再確認、研修会話・画像相談、月間Quota、Push Outboxと再試行。
- `apps/web/src/http/job-worker.ts` — LINE学習Jobの実行・再試行・終了時Web案内。
- `apps/web/test/line-webhook.test.ts` — 一括永続化、参加者IDなしの記録、永続化失敗時に200を返さないこと。
- `packages/database/prisma/schema.prisma` と `packages/database/prisma/migrations/20261018120000_personal_learning_line_inbox/migration.sql` — Inbox、Push Outbox、Quota通知記録。複合スコープ外参照を防ぐ外部キーとRLSを追加。
- `packages/database/src/training-retention-snapshot.ts`、`training-retention-execution.ts` — LINE受信本文・画像を保持期限判定に含め、自動削除。
- `packages/database/src/training-personal-data-export.ts`、`training-personal-data-deletion.ts` — LINE受信本文・画像・返信を本人の書き出しと一括削除に含める。
- `packages/database/src/admin-alerts.ts`、`line-admin-observability.ts`、`packages/application/src/admin-alert-center.ts` — 研修LINEジョブの失敗件数、月間Quota警告を運用画面へ表示。
- 関連テスト、`packages/database/src/schema-readiness.ts`、本報告。

## 3. 主要な設計判断

- Webhookは本文・LINE画像メッセージID・重複排除用イベント・Jobを、1リクエスト内で同一DBトランザクションに保存してから200を返します。保存に失敗した場合は500を返します。Webhook内ではAI呼び出し、画像ダウンロード、LINE Pushを行いません。
- LINEのWebhook再送や処理再試行では、イベントIDでInbox/Jobを重複作成せず、Pushは保存済みの `X-Line-Retry-Key` を再利用します。外部送信成功が確認できないまま通常Jobの再試行を使い切った場合は、別の冪等キーで一般的なWeb案内を1回だけ試します。本文や画像の内容はログに出しません。
- Workerは実行直前に友だち状態、通知同意、参加者・受講状態、Program、pilot seat、`lineLearning` と会話機能を再確認します。条件を満たさない場合はAIを呼ばず、利用不可時は受信内容を処理しません。
- テーマが1件ならそのテーマに固定します。テーマが0件または複数なら推測で割り当てずWebへ案内します。複数テーマ時は、明示選択を受けるRich Menuのpostbackを導入し、選択された有効テーマだけを記憶する方式を提案します。選択UIは別途確認後の改善候補です。
- 文章は最後の学習利用から1年、または受講終了から90日のうち早い期限で削除します。最後の利用日がない場合は受講開始日を使います。画像は学習利用の有無にかかわらず作成から90日で削除します。LINE本文・画像・返信は機能フラグがOFFになった後も、書き出し・本人の一括削除・期限削除の対象です。
- 月間送信量は専用LINE設定の警告率・低優先停止率（既定80%／90%）で記録し、運用アラートセンターに件数を表示します。90%到達後はAI学習返信を止め、送信可能な場合だけWeb案内へ切り替えます。Quota APIを確認できない場合はAIもPushも行いません。
- `lineLearning` は既存設定の初期値OFFを維持しました。Productionの設定・DB・フラグは変更していません。AI呼び出しは既存Conversation経路のサーバー内設定とAdmissionを再利用し、ローカル検証で実AIを呼び出していません。
- 本番適用時はこのmigrationを先に適用し、その後プログラムを反映します。フラグはOFFのまま反映し、運営者の確認後に段階的な有効化を判断してください。

## 4. 実行した検証

- `pnpm --filter @bunshin/database db:validate` — 成功（ダミーのローカル接続文字列のみ使用）。
- `pnpm --filter @bunshin/database typecheck` — 成功。
- `pnpm --filter web typecheck` — 成功。
- `pnpm --filter @bunshin/database test` — 208ファイル、1,026テスト成功。
- `pnpm --filter web exec vitest run test/line-webhook.test.ts` — 16テスト成功。
- `pnpm --filter @bunshin/application exec vitest run test/admin-alert-center.test.ts` — 10テスト成功。
- `pnpm --filter @bunshin/database lint`、`pnpm --filter web lint`、変更したTypeScriptのPrettier検査 — 成功。
- DB統合テストにはQuota/イベント重複、テナント境界、書き出し、本人削除、期限削除のケースを追加しました。ローカルでは本番DBへ接続しないため実行せず、Draft PRのCIにある隔離DBで実行します。

## 5. 未解決事項

- LINE Developers Console側でWebhook redeliveryが有効かの確認はPR-G／運用手順で行います。無効な場合、LINE側の一時的な送達失敗からの再送保証はありません。
- 複数テーマ選択のRich Menu／postback UIは本PRでは実装せず、複数テーマ時はWeb案内に留めます。
- iOSのLINE内ブラウザで受信・画像相談・Webへの継続を実端末確認していません。
- DB統合テストとGitHub CIはDraft PR作成後に確認します。失敗があればマージ前に修正します。

## 6. 次へ進む条件

- Draft PRの `verify` と `database` を含む必須CIが成功すること。
- 受信後の同一イベント再送、Quota閾値、複数テーマ時のWeb案内、画像・本文の90日／Decision 6保持期限をレビューで確認すること。
- 田中さんの確認を受けるまでマージ・本番migration・Production反映・`lineLearning` の有効化は行いません。
