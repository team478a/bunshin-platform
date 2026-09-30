# AI研修 無料・手動登録受講の期限終了Preflight

## 1. 調査した内容

最新main `3d29565600c2e402f27ba35b63c3acf611ed4614`を基準に、無料・手動登録受講の期限終了バッチ、Cron認証、AI研修Program・Service・参加者・購入境界、100件上限、本番停止条件を確認した。実行処理はdevelopment/staging限定で、本番には対象件数だけを安全に確認する専用経路がなかった。

## 2. 変更したファイル

- `packages/database/src/training-enrollment-expiry.ts`: 実行処理と対象条件を共通化し、読み取り専用の正確な対象件数、100件上限、必要バッチ数、判定時刻を返すPreflightを追加。
- `packages/database/src/index.ts`: Preflight関数と結果型を公開。
- `apps/web/src/http/ai-training-enrollment-expiry-preview.ts`と内部POST Route: Cron Secret認証、明示Scope、入力制限、安全な件数ログを追加。
- Database/Web Unit testと実DB統合テスト、Decision Log、ロードマップを更新。

DB schema、Migration、依存関係、期限終了のproduction停止条件、Cron設定は変更しない。

## 3. 主要な設計判断

Preflightは実行処理と同じ次の条件だけを対象にする。

- 明示したWorkspace/Serviceに属するAI_TRAINING_V1 Program。
- Service ParticipantのACTIVE受講。
- 開始日時と終了日時が存在し、開始日時が終了日時以前。
- サーバー判定時刻に終了日時へ到達済み。
- 有料購入に紐づかない受講。

`POST /api/internal/ai-training/enrollment-expiry-preview?workspaceId=<UUID>&groupId=<UUID>`だけを許可する。Cron SecretのBearer認証を必須とし、Scopeや判定時刻を本文から受け付けない。productionでも読み取りだけを許可するが、既存の期限終了実行口は引き続き503 DISABLEDである。

応答は対象件数、1回100件の上限、必要バッチ数、100件超過の有無、サーバー判定時刻だけとする。受講ID、User ID、回答・評価・仕事情報、Provider情報を取得・応答・ログへ含めない。PreflightはTransaction、状態更新、評価Job停止、監査Event作成、LINE送信を行わない。

## 4. 実行した検証

- Unit: 実行処理と同じService/Module/Participant/期間/購入除外条件、正確な件数、0件、100件超過、無効時刻、書込Transaction不使用を確認する。
- HTTP: production/staging/developmentで認証済みPreviewを許可し、認証不備、秘密値未設定、GET、不正・重複・未知Scope、本文、過大Query、内部エラーを拒否する。
- 実DB統合: 有料、別Service/Workspace/Module、未来、期限なし、開始日なし、非ACTIVEを除外し、期限終了直前に2件を確認する。
- 標準のformat/typecheck/lint/test/build、DB migration統合、`git diff --check`はPRの最新headで確認する。

## 5. 未解決事項

- 本番の実件数、対象Service Scope、Migration適用状況は、本番資格情報を使う別の運用確認まで未確認。
- Preflightは対象行が直後に変化しないことを保証しない。実行時は既存ロック・CAS・所有境界再確認を使用する。
- 本番期限終了の有効化、Cron登録、保持期限データ消去、終了通知、100件超過時の連続実行は含めない。

## 6. 次作業へ進める条件

PRのCI・レビュー・マージ後、対象AI研修Serviceごとにproduction Preflightを実行し、対象件数、必要バッチ数、Migration、停止/復旧手順を記録する。その結果と運営承認を受けて、期限終了実行口のproduction有効化とScheduler登録を別PRで判断する。
