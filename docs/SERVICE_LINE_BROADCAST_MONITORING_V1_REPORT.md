# Service LINE Broadcast Monitoring V1 Report

## 1. 調査した内容

- サービス管理画面には予約中件数、失敗宛先数、直近配信履歴があったが、予定時刻を過ぎた停滞配信と通常の予約配信を区別できなかった。
- Recovery Jobは既存Job履歴から追跡できるが、管理画面とCSVへ表示されていなかった。
- 送信成功と送信失敗の比率がなく、運営者が配信品質を判断するには各履歴を個別に確認する必要があった。

## 2. 変更したファイル

- `packages/application/src/service-line-broadcast-operations.ts`
  - 配信ごとの運用状態、失敗率、対象宛先数と、直近配信の運用集計を追加。
- `packages/database/src/service-line-broadcast-operations-repository.ts`
  - Workspace、Environment、Broadcast IDで限定したRecovery Job回数を既存Job履歴から取得。
- `apps/web/src/http/service-line-broadcasts.ts`
  - 運用状態と集計を管理APIへ追加。
- `apps/web/app/s/[serviceSlug]/manage/line/service-line-broadcast-history.tsx`
  - スマートフォンで確認できる運用サマリー、停滞警告、状態ラベル、再送・取消操作を分離。
- `apps/web/app/s/[serviceSlug]/manage/line/service-line-broadcast-types.ts`
  - 管理画面用の表示型を分離。
- `apps/web/app/s/[serviceSlug]/manage/line/service-line-broadcast-editor.tsx`
  - 配信作成に集中させ、履歴・運用監視を専用コンポーネントへ委譲。
- `apps/web/app/styles.css`
  - 停滞警告と運用状態ラベルのスマートフォン向け表示を追加。
- Application、Database、Webの境界テストを更新。

## 3. 主要な設計判断

- 新しい監視テーブルは作らず、配信、宛先、Jobの既存正本から状態を算出する。
- `SCHEDULED`かつ未送信宛先が残り、予定時刻から15分以上経過した配信を`STALLED`とする。
- 失敗率は`FAILED / (SENT + FAILED)`とし、通知対象外と取消は配信品質の分母から除外する。
- Recovery回数は同一Workspace、Environment、BroadcastへのRecovery Jobだけを数え、他サービスや他環境を混在させない。
- 配信履歴と操作を専用コンポーネントへ分割し、配信作成画面の肥大化を抑える。

## 4. 実行した検証

- 15分を超えた予約配信が`STALLED`になること。
- 送信成功、失敗、未送信から配信単位と全体の失敗率を算出できること。
- Recovery JobをWorkspace、Environment、対象Broadcastに限定して集計すること。
- APIが運用状態と運用集計を返すこと。
- CSVへ運用状態、失敗率、自動回復回数を出力すること。
- Application: 117 test files / 526 tests 成功。
- Database: 145 test files / 460 tests 成功。
- Web: 335 test files / 1,427 tests 成功。
- リポジトリ全体のformat、architecture check、lint、typecheck、test、buildが成功。

## 5. 未解決事項

- 15分の停滞判定時間は固定値であり、実運用の配信量に応じた調整が必要になる可能性がある。
- 現在のサマリーは直近30件を対象とする。長期推移や日次グラフは今回の範囲外。
- 外部監視への通知や運営者への自動アラート送信は今回実装していない。

## 6. 次Phaseへ進める条件

- CIのdatabase・verifyが成功すること。
- ステージングで正常、停滞、部分失敗、自動回復の各表示を確認すること。
- 次は運用者が画面を開かなくても重大な停滞を把握できる通知条件と通知先を検討する。
