# B2 成長ロードマップの二重集計解消

日付: 2026-11-02  
基点: origin/main `14764c61`（#1428マージ後）

## 調査と変更

旧画面はmember-roadmapとmember-usageを順に呼び、
前者も利用実績を集計していたため、1回の閲覧で2回の集計と2枠のRate Limit消費が発生していた。
既存Port・認可・Service Policy・実績集計・ロードマップ評価を再利用して解消した。

- `packages/application/src/member-roadmap.ts`: executeWithUsageを追加。認可済み利用実績を1回取得し、評価に使った実績とロードマップを返す。既存executeの結果は維持。
- `apps/web/src/http/service-member-growth.ts` と新GET route: `member-growth-api-v1`として既存v1 DTOを明示的に合成する。
- `service-member-roadmap.ts` / `service-member-usage.ts`: 既存DTOのallowlistを再利用。旧APIのレスポンス形式は変更しない。
- `apps/web/app/ui/member-growth-roadmap/data.ts`: 新APIへ1回だけGET。版・基準日時・タイムゾーンの不整合は表示を中止する。
- Application / HTTP / モバイルの既存テストを拡張。共有fixtureの取得先と基準日時を新契約に合わせた。

## 設計判断

[ADR](adr/MEMBER_GROWTH_SINGLE_READ_ADR.md)を参照。
Hassyの5段階・語彙は既存Web Policy、共通評価はApplication、
SNS正本取得は既存Database Adapterに残す。未設定サービスへHassyを適用しない。
SNSの実操作日と既存の習慣進捗のMission日は意味が異なるため、集計関数を無理に統合しない。

両結果は同じscope / asOf / timezoneで評価する。Context取得は別の読取専用transactionであり、
全証拠を単一DB snapshotから取得する保証は追加していない。
認可・同意・所有権の再検証、未知値・取得不完全時の拒否、現在の停止・権限・予算判定を維持する。
共有のプロセス内Rate Limitは維持し、分散Rate Limitへ変更したものではない。

## 検証

- Application全体: 149ファイル、1,133件成功。
- 関連Web: 4ファイル、171件成功。新APIの読取回数、旧DTOとの完全一致、権限・他scope・失効・障害・Rate Limit・旧生成・深夜/DSTを含む。
- モバイル: 取得回数1回、二重操作抑制、失敗時の旧表示破棄、Bunshin切替、版・日時・timezone不整合を検証。
- 初回のモバイル全体実行はブラウザTarget crashedで中断。型検査など重い処理との同時実行を避けて再検証する。最終の標準チェック・モバイル・SQL・buildの結果はPRの最新HEAD CIを正本とする。

## 共有ファイルの変更

`scripts/test/learning-ui/growth-fixture.ts` と `member-growth.e2e.ts`のみ、
成長画面の合成データ・期待するHTTP回数を更新。公開index、環境変数、cron、schema、migrationは変更なし。

## 未解決と次の条件

DBの新規保存・特典付与・AI呼出し・外部接続・本番設定・デプロイは行っていない。
本番反映済みとは扱わない。最終HEADのverify / database成功とレビュー・マージ後にB3へ進む。
B3は紹介の共通判定とSNS証拠bindingの分離・保存先監査を先に行い、既存紹介・Creditを再利用する。
