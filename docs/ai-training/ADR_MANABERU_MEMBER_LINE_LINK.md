# マナベルスタイル: 参加者本人の専用LINE接続

2026-10-08。基準main: `5350de139e0af99b1b47265fe37297f06c17be66`。

ユーザーはWeb限定方針を変更し、専用公式LINEによるテストを優先した。既存P1-FのLINE隔離を削除するのではなく、第一PRはサービス参加者本人への接続だけを追加する。

- 接続正本は既存GroupLineConnection（Service / Workspace / Membership / User / Configuration / environment）。Enrollment参加権ではない。接続だけでSeat・Enrollment・Goal・Planを作らず、Pilot gateを通過したとも扱わない。
- 同ServiceにPersonal Learning予約Programがある場合だけ、投稿パートナー不要の入口を表示。Program停止中でも接続準備は可能だが、学習・Provider実行は既存Execution Gateのまま。
- 現在のサービス参加同意・本人session・有効Membership・接続確認済み専用LINEを開始/Callbackで再検証。設定変更・停止・失効を拒否する。
- 既存短期single-use ServiceLineLinkAttemptのbunshinIdをnullableにする。nullは明示的なLEARNING_MEMBER接続のみ。架空Bunshin、Enrollment IDの流用、stateless OAuthへの退行は行わない。旧試行を維持し、Migrationを本番適用しない。
- 学習接続では他UserのLINE接続を移管しない。既存投稿用の移管挙動は変更しない。
- PKCE、nonce、試行別Cookie、10分期限、CAS、同origin、固定復帰先を再利用。投稿用Preferenceを作らず、旧Scheduler・LINE除外・Provider Gateを維持する。
- 通知/回答Bridge、学習用リッチメニュー、LIFF、実端末OAuth、実送信、Production deploy/Migrationは次の承認事項。接続を通知稼働完了とは表示しない。
