# グループ独自バッジ 承認Core実装報告

## 実装範囲

- Group管理者による未公開Versionの申請
- SUPER_ADMINだけが行える承認・却下
- 承認時だけVersionを公開しDefinitionをACTIVE化
- ACTIVEなGroup参加者だけを付与候補に登録
- 候補登録者・対象者とは異なるGroup管理者による承認
- 承認時の冪等なAward／Progress作成
- Definition、Version、候補、Awardを参照する監査記録

## 安全境界

- Group管理者による既存`PublishBadgeVersion`の直接公開を禁止した
- Group Badgeは`MANUAL_APPROVAL`または`IMPORT`、特典なしだけを申請可能とした
- WorkspaceとGroupは複合外部キーで固定した
- DB CheckとRepositoryの両方で自己付与・候補登録者による承認を拒否する
- 通常投稿本文、Personality、Knowledge、Memoryを承認処理で取得しない

## 後続

B-4BでGroup管理画面、SUPER_ADMIN審査画面、CSV候補取込と行別エラー表示を接続する。
