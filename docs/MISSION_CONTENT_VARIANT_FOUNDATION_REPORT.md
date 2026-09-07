# Daily Mission別案 基盤実装レポート

## 調査した内容

通常のDaily Missionは同一日・同一Bunshinにつき1件に制限され、生成本文もMissionと1対1で保存されている。この制約を緩めると自動配信の重複につながるため、別案を独立した追記データとして保存する必要がある。

## 変更したファイル

- `packages/capability-social/src/index.ts`: 別案、生成試行、選択履歴のRepository契約とApplication Service
- `packages/database/prisma/schema.prisma`: 3つの永続化モデルと生成状態enum
- `packages/database/prisma/migrations/20260907210000_add_mission_content_variants/migration.sql`: DB migration
- `packages/database/src/index.ts`: Prisma Repositoryと所有・サービス境界の再検証
- `packages/capability-social/test/mission-content-variant.test.ts`: 入力正規化とfail-closedのテスト
- `packages/database/test/mission-content-variant-schema.test.ts`: 制約と分離境界のテスト

## 主要な設計判断

- Daily Mission本体と`MissionContent`は変更せず、派生案だけを`MissionContentVariant`へ保存する。
- 初期上限は1 Missionにつき1案とし、DBの連番一意制約、Mission単位のTransaction lock、Repositoryの検査で同時生成を防ぐ。
- 生成試行は冪等キーでclaimし、成功・失敗の双方にAI観測値を残せる構造にする。
- 選択操作は上書きせず履歴として保存する。
- Repositoryは操作ごとにWorkspace、Service、User、Bunshin、Missionの境界を確認する。

## 実行した検証

- Prisma schema validateとClient生成
- Capability SocialとDatabaseのtypecheck
- 別案Application Serviceの単体テスト
- Schema、migration、Repository境界の静的テスト

## 未解決事項

- 元Missionの生成Contextを再解決して別案をAI生成する処理
- 原案と別案の重複検査、安全確認、日次上限
- 30 WPの予約、成功確定、失敗解放
- APIと「別の案を見る」「この案を使う」「内容を直す」UI
- 本番DBへのmigration適用と実機確認

## 次Phaseへ進める条件

本PRのmigrationとCore境界をレビュー後、R2-2からR2-5を同じ保存形式へ接続する。
