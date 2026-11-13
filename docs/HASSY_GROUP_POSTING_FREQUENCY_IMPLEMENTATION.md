# ハッシー企業・グループ型SNS発信支援：本人の投稿頻度設定 実装報告

更新日: 2026-11-13

## 1. 調査した内容

- 投稿頻度の正本は、既存 `SocialProfile.postingFrequency` である。
- 値は `DAILY / WEEKDAYS / THREE_PER_WEEK / WEEKLY / FLEXIBLE` の既存 enum に限定される。
- Service 配下には、本人の会員スコープを解決して既存 Social Profile を更新する PATCH API がある。
- 初回設定では既に投稿頻度を選べるが、設定完了後は「投稿パートナーの設定を確認・変更する」の詳細画面まで開かないと変更できなかった。
- Service の `dailyIdeaDelivery.lockCadence` が有効な場合、頻度は Service 方針で固定され、本人の Social Profile 設定より優先される。

## 2. 実装した機能

- 初回設定完了後の案内に「投稿するペースを確認・変更する」を追加した。
- 使用中の SNS ごとに既存の投稿頻度を表示し、本人が変更して保存できる。
- 保存時は既存 Service Social Profile PATCH API に `postingFrequency` だけを送る。
- Service が頻度を固定している場合は変更欄を出さず、固定されている頻度を表示する。

## 3. 既存コードの再利用

- 保存先: `SocialProfile.postingFrequency`
- 入力値: `SOCIAL_POSTING_FREQUENCIES`
- 更新 API: `/api/services/{serviceSlug}/bunshins/{bunshinId}/social-profiles/{platform}`
- 境界確認: `resolveMemberServiceContext` と既存 `SOCIAL` Capability 判定
- 投稿予定生成: 既存 Weekly Plan / Daily Mission の頻度参照

新規テーブル、migration、台帳、設定 API は追加していない。

## 4. 影響範囲

- Service の投稿パートナー詳細画面だけに、設定完了後の頻度変更導線を追加する。
- 個人 Workspace は既存の `SocialProfileSection` で同じ保存先を引き続き利用するため、画面変更はない。
- 業務日報型 Service など `lockCadence` が有効な Service は、本人変更を許可しない既存方針を維持する。
- 千ノ国メディアを含む OEM Service には固有名称や固有ルールを追加せず、各 Service の既存方針に従う。

## 5. 状態と未完成事項

- 実装済み: 既存保存先を使った本人の投稿頻度変更。
- 検証済み: 自動テスト、型検査、lint、build の結果は PR 本文に記録する。
- 本番反映済みではない。Draft PR の作成と main へのマージは本番反映を意味しない。
- 非本番環境の認証済みスマートフォン幅・LINE内ブラウザでの操作確認は、検証環境情報の提供後に行う。
