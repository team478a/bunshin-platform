# Phase 6-F2b2b LINE認証後Mission復帰 実装報告

## 目的

LINEの通知から今日のMissionを開いた利用者が未ログインだった場合でも、LINE認証後に元のMissionへ戻れるようにする。

## 実装内容

- `/today?state=...`で未ログインを検出した場合、戻り先を付けてログイン画面へ移動する。
- LINE認証開始時に、検証済みの戻り先を10分間のHttpOnly Cookieへ保存する。
- LINE認証後、規約同意が不要なら元のMissionへ戻り、Cookieを削除する。
- 規約同意が必要ならCookieを維持し、同意完了後に元のMissionへ戻ってCookieを削除する。
- 戻り先がない通常ログインは、従来どおり分身一覧へ移動する。

## セキュリティ境界

- 許可する戻り先は`/today?state=...`だけとする。
- 外部URL、`//`から始まるURL、別path、追加query、fragment、重複stateを拒否する。
- Cookieは`HttpOnly`、`SameSite=Lax`、Productionでは`Secure`、有効期限10分、path `/`とする。
- Cookieを認可情報として信用しない。復帰後に既存処理で署名、期限、single-use、環境、利用者とMissionの所有権を再検証する。
- Mission本文、個人情報、Provider SecretはCookieへ保存しない。

## テスト

- 正しいMission戻り先の正規化
- Open Redirect候補と不正な戻り先の拒否
- LINE認証開始時の安全なCookie設定
- LINE認証後のMission復帰とCookie削除
- 未ログイン時にstateを失わずログイン画面へ移動すること
- 認証済み利用者に対する既存のMission所有権検証を維持すること
