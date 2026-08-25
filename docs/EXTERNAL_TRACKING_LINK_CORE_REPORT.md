# 外部成果計測URL連携 Core 実装報告

## 完了範囲

Phase 7-L1として、特定サービスへ依存しない外部成果計測URL連携の永続化基盤を実装した。

- 外部システム
- 許可ドメイン
- グループ参加者と外部IDの対応
- グループ／参加者／商品／キャンペーンの6種類のURL適用範囲
- 下書き、有効、停止、期限切れ、削除済みの状態
- 開始日時と終了日時
- 有効URLの重複を防ぐDB制約
- HTTPS、許可ドメイン、認証情報、フラグメント、個人情報queryの検証
- 指示書どおりの6段階優先選択
- Workspace、Group、Member、Bunshin、Product Pack、Campaignの所有権確認

## URL選択順

1. キャンペーン＋参加者
2. 商品＋参加者
3. 参加者共通
4. キャンペーン共通
5. 商品共通
6. グループ共通

同じ優先順位に複数の有効URLが存在する場合は、推測で選ばず競合として停止する。対象がない場合は`null`を返し、後続の投稿生成連携で「専用URLが設定されていません」と表示できる境界にした。

## データ分離

- URLの帰属先は人格ではなくGroup Membershipとする。
- 利用者のBunshin所有権、Group参加同意、Product Pack割当を確認する。
- Campaign指定時は、開催期間、参加承認、Bunshin、Product Packの一致も確認する。
- 別Group、別参加者、停止・期限切れURLは候補から除外する。

## DB保護

Migrationには、適用範囲と参照IDの組合せCHECK、開始・終了日時CHECK、および同一外部システム・同一適用範囲のACTIVE部分一意Indexを含めた。

## 未実装

L2以降に分離したため、管理API、管理画面、CSV、監査ログ、Mission本文への`{{referral_url}}`差し込み、使用時URL Snapshot、LINE導線は本変更へ含めていない。クリック、成果、報酬、顧客情報、短縮URL、自動投稿も実装していない。

## 検証

- Prisma schema validate
- Application typecheck
- Database typecheck
- 外部URLPolicy unit test: 6件
- Database unit test: 25件
