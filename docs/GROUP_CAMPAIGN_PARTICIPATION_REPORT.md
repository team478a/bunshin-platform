# G4 任意参加Campaign・Participation 実装報告

## 調査

G1のGroup Membership・明示同意・退出、G2の公開Product Pack Version・Bunshin Assignment、G3の広告安全境界を確認した。既存コードにCampaign resourceは存在しなかった。

## 実装

- 企業管理者は公開済み商品パック版を指定し、対象、テーマ、期間、参加上限、公式素材を持つ募集を下書き・開始・締切・中止できる。
- 公式素材は指定したProduct Pack Version配下の素材だけをCampaignへ関連付ける。
- Group参加同意済みで、指定商品パックが本人のBunshinへ割り当て済みの場合だけ募集を表示する。
- 本人だけが参加、保留、辞退、参加取消を選択できる。管理者による代理参加APIは設けない。
- 参加上限を同一CampaignのDB lock内で検査し、状態変更はActivityへ記録する。
- Workspace、User、Bunshinの不一致は存在を漏らさず拒否する。

## 実装しない範囲

一斉配信、LINE通知、SNS自動投稿、投稿比率、類似検査、自動人格学習、報酬、ランキング、課金は実装しない。CampaignをWeekly Planと生成へ接続する処理はG5で行う。
