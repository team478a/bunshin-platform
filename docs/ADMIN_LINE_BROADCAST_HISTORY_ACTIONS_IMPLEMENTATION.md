# LINE配信の取消・失敗分再送（PR-2C-B）

日付：2026-11-03。基準main：`8e72fb08`（PR #1457マージ後）。[設計判断](adr/LINE_BROADCAST_HISTORY_ACTIONS_ADR.md)

## 1. 調査した内容

配信履歴→取消・再送HTTP→Application→Prisma Repository→Jobと監査の経路を確認した。取消にはブラウザの理由入力と追加確認があり、再送ではサービス・件名・件数を同時に確認できなかった。配信中や取消済みでもFAILEDが残れば再送ボタンが表示されていたが、RepositoryはCOMPLETEDだけを許可していた。

再送では配信・宛先・監査の保存後、HTTPが別途Jobを作っていた。Job作成に失敗すると、再送が予約中の状態で残る。新規予約で使った既存Job Repositoryのtransaction対応を再利用する。

## 2. 変更したファイル

- `apps/web/app/s/[serviceSlug]/manage/line/service-line-broadcast-history.tsx`：取消と再送の確認、実行・結果不明・履歴再取得の表示。
- 同`broadcast-history-action-client.ts`：既存APIへの同一Originの送信、応答の対象IDと結果の検証。
- 同`service-line-broadcast-editor.tsx`：サービス名を渡し、履歴再取得の成否を返す。失敗時の前回表示には注意書きを出し、履歴からの操作を止める。
- `apps/web/src/http/service-line-broadcasts.ts`：無効な理由を400へ統一、再送の別enqueueを削除。既存APIの送受信形式を維持する。
- `packages/database/src/service-line-broadcast-operations-repository.ts`：再送の宛先・状態・監査・Jobを同時に保存する。取消の処理は変更しない。
- 既存のWeb HTTP、DB単体、DB統合、LINE画面テストを拡張した。共有CSS、環境定義、公開exports、schema、migrationは変更していない。共有テストの登録変更も不要だった。

## 3. 主要な設計判断

取消は「操作選択→理由入力ダイアログで確定→追加確認」から「操作選択→同じページで理由を入力して確定」へ変更した。再送も同じ形式とし、件名・サービス・日時・状態・件数・理由を一緒に確認する。どちらも理由を自動監査へ保存し、技術IDの手入力は不要。戻る操作は書き込まない。

再送は完了済みでFAILEDがある配信だけ、取消は予約中だけに表示する。理由は既存の最大1000文字を維持する。認証、同一Origin、Service権限とDBの対象境界、COMPLETEDからの条件付き更新、FAILEDのみの再送、JobのWorkspace権限、送信実行時の制御は維持する。

二度押しで同一画面から複数POSTを発行しない。結果不明時は履歴の読み取りだけを案内し、取消・再送の自動POSTは行わない。実行が確認できた後に履歴の取得が失敗した場合も、実行結果と履歴エラーを分ける。

## 4. 検証

- Webの配信操作・新規予約HTTP、DBの配信操作単体、依存境界を確認する。
- ブラウザでは合成データで取消・再送を確認する。PC 1280px、スマートフォン390pxと320pxで、戻る、連打、対象の絞り込み、結果不明、履歴失敗後のGETだけの再取得を検証する。
- 使い捨てPostgreSQLで同時再送が1つのJobになること、送信済みの宛先を残すこと、別Serviceを拒否すること、Job書込や権限確認に失敗すると配信・宛先・監査が元のままになることを検証する。
- 標準CIの対象コミットと成否はPRのチェック欄に記録する。本番設定、migration、deployment、実LINE配信は実施しない。

## 5. 未解決事項

表示件数は履歴取得時点の値。確定時点の固定名簿を承認する仕組みや、通信断後に特定の操作結果を永続的に照会する仕組みは追加していない。送信済み・実行中の外部送信を取り消す機能ではない。JobのWorkspace権限とServiceRoleの関係はPR-3Aで検討する。

## 6. 次へ進める条件

PR差分と標準CIの結果をレビューしてマージする。次は専用リッチメニュー公開の最終確認と、外部処理の結果が不明なときの扱いを独立して整理する。
