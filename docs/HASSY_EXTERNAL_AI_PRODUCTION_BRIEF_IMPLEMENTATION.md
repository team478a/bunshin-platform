# ハッシー企業・グループ型SNS発信支援：外部AI向け制作指示 実装報告

更新日: 2026-11-13

## 1. 実装した機能

- 採用した投稿案から、Muse、ChatGPT等へ共通して渡せる中立な制作指示テキストを生成する。
- 制作指示には投稿目的、対象SNS、本人の発信スタイル、公式情報、許可素材、広告表示、禁止・条件付き表現、推奨形式、元の投稿案を含める。
- 本人が内容を確認したうえで「制作指示をコピー」または「スマホで共有」を押した場合だけ端末へ渡す。
- 企業確認待ち、修正依頼中、Campaign終了、専用URL変更時は、既存コピー可否判定に従ってコピーと共有を止める。

## 2. 既存コードの再利用

- Campaign参加・商品版割当・Service/Workspace境界: `PrismaCampaignRepository.resolvePlanningContext` と既存 `planningWhere`
- 本人の発信スタイル: 承認済み `SocialAccountStrategy` と既存 `SocialProfile.purpose`
- 公式情報・素材・表示ルール: 既存 `CampaignPlanningContext.productPack`
- 広告表示: 既存 `ADVERTISEMENT => #PR` 方針と Product Pack の `REQUIRED_DISCLOSURE`
- コピー可否・企業確認: `AuthorizeDailyMissionCopy` の結果
- LINE内ブラウザ対策: 既存Clipboard fallbackと端末の `navigator.share`

新規DBテーブル、migration、外部AI Provider、汎用AIエージェント、自動投稿処理は追加していない。

## 3. データ分離と安全側の扱い

- Campaign情報は、本人が参加し、対象投稿パートナーへ商品版が割り当てられ、同じService/Workspaceに属する場合だけ取得する。
- 公式情報や許可素材がない場合は、推測で補わず「指定なし。新しく作らない」と出力する。
- 画面から外部AIへ自動送信せず、個人情報を本人の許可なく送信しない。
- コピー・共有を新しい活動台帳へ記録しない。既存の投稿文コピー実績と混同しない。

## 4. 影響範囲

- Service配下の通常SNS投稿案だけに表示する。業務日報型Serviceには表示しない。
- 個人Workspaceの投稿画面、千ノ国メディア固有ルール、他OEM Serviceの名称・ブランドは変更しない。
- 新しいページやRouteは追加しないため、LINE戻り先許可リストの変更はない。

## 5. 状態と未完成事項

- 実装済み: 中立な制作指示の生成、確認、コピー、スマホ共有。
- 検証済み: format、型検査、lint、全体テスト、build、差分検査。結果はPR本文にも記録する。
- 本番反映済みではない。Draft PRとmainへのマージは本番反映を意味しない。
- 外部AI上での実制作、Muse Connector、外部AIへの自動送信、自動投稿は未実装であり本PRの対象外。
- 認証済みスマートフォン幅・LINE内ブラウザでの手動確認は、非本番環境情報の提供後に行う。
