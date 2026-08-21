# アカウント退会・削除方針

## 決定

退会ボタンで即時に物理削除しない。本人確認済みsessionから退会要求を記録し、14日間の猶予を設ける。猶予中は本人が取消できる。同時に有効な要求はUserごとに1件とし、取消済み履歴は監査のため保持する。

## 今回実装する範囲

- 本人による退会要求と取消
- 要求・予定・取消日時の監査記録
- Platform Adminによる要求一覧の確認
- User間Isolation

## 今回実装しない範囲

- 自動Jobによる処理
- User statusのDELETED化
- Auth Providerからの削除
- Workspace、Bunshin、Knowledge、Memory、Mission等の物理削除・匿名化

これらは所有関係、法定保持、バックアップ、復旧不能性をレビューした後、別PRで実装する。
