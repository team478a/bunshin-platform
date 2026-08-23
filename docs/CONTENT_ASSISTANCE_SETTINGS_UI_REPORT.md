# 投稿支援レベル 初期設定API/UI 実装報告

## 1. 目的

利用者がSNSごとに、BUNSHINへ「企画だけ」「作り方まで」「そのまま使えるもの」のどこまでをお願いするか、やさしい日本語で設定できるようにする。

## 2. 実装内容

- SocialProfile APIの作成・更新・取得へ`defaultAssistanceLevel`を接続
- 厳格な3値validation
- SNS設定フォームへ具体例付きの3択を追加
- `READY_TO_USE`を「おすすめ」の初期値として表示
- 保存済み設定をSNSカードへ表示
- 文章、ページをめくる投稿、自分で撮る動画、AIで作る動画という表示へ統一
- API、認可境界、表示用データのテスト

## 3. 境界

- verified sessionと既存Workspace / User / Bunshin認可を再利用する
- URLやrequest bodyからUser権限を受け取らない
- SNSごとのSocialProfileへ保存し、別SNS・別Bunshinの値を変更しない
- Missionの当日切替、段階表示、Activity、LINE通知は変更しない

## 4. 次の作業

本PRの承認後、今日のMission画面へ企画・作り方・完成版の段階表示と当日切替を接続する。
