# LINE配信の取消・失敗分再送を一つの確認欄へ集約する

日付：2026-11-03。基準main：`8e72fb08`（PR #1457マージ後）。管理運用簡素化PR-2C-B。

## 判断

配信履歴のブラウザprompt/confirmを、サービス名・件名・現在の状態・履歴取得時点の件数・理由を表示する同じページの確認欄へ置き換える。理由は重要操作の監査に使用するため維持し、最終実行は1回にする。再送はCOMPLETEDかつFAILEDが存在するときだけ表示する。取消はSCHEDULEDだけで、送信済みや実行中の外部送信を取り消せるとは説明しない。

連打は同期lockで防ぎ、通信失敗・5xx・不正な成功応答を結果不明として扱う。自動POST再試行は追加しない。結果不明時は履歴のGETだけを再取得し、結果を成功と推測しない。履歴取得に失敗した場合は確認欄を残す。履歴を取得できた場合は現在の状態を確認してから次の操作を選べる。新規予約のoperationId形式を、別の状態遷移である再送へそのまま流用しない。

再送Repositoryは既存のCOMPLETED→SCHEDULEDのCAS、FAILEDだけの更新、監査を維持する。そのtransactionに既存PrismaJobRepositoryによるJob作成を含め、HTTPの別enqueueを削除する。現在のJob keyの形式・認可・優先度・最大試行数は維持し、Job保存または権限確認に失敗したときは宛先・配信・監査もrollbackする。取消の既存transactionは変更しない。

新table/migration、汎用承認レイヤー、Provider呼出は追加しない。現在のAPIのreason形式と返却形式を維持する。認証・同一Origin・Service境界・監査・workerの同意と宛先別制御を緩めない。

## 限界と検証

件数は履歴時点の参考値であり、最終実行時点の固定名簿や人数承認ではない。再送APIの同一要求の永続的な結果回復は本PRの保証外。状態遷移のCASに加え、UIから結果不明のPOSTを自動再送しない。既送信宛先は再送対象に戻さない。Provider側のexactly-onceは主張しない。

PC/スマートフォン、理由編集、戻る、連打、4xx、5xx/ネットワーク、成功後GET失敗、取消済み/配信中の再送非表示を確認する。HTTPのserver scopeと無効入力、DBの同時再送・監査/Job障害rollback・失効・別Serviceを検証する。本番設定・migration・deployment・実LINE配信は行わない。
