# サービス別専用URL管理

## 完了した範囲

- サービスホームから参加者専用URL管理を開ける
- 外部成果計測サービスと許可ドメインを登録できる
- サービス共通URLを登録し、開始・停止できる
- CSVで参加者・商品・企画別URLを部分取込できる
- URL一覧と使用履歴をCSV出力できる
- 設定漏れ、使用履歴、変更履歴を確認できる

クリック、申込み、成約、報酬は保持・計算しない。登録した外部URLへ直接遷移する既存方針を維持する。

## データ分離

1. Service SlugからWorkspace IDと内部Service IDをサーバー側で解決する。
2. Group Managerであることを確認する。
3. 画面から送られたGroup IDがService IDと一致することをHTTP境界で確認する。
4. RepositoryへService IDを固定し、System、Domain、Identity、Linkの取得・変更条件で再確認する。

本部管理者向けの既存URL管理画面は維持する。
