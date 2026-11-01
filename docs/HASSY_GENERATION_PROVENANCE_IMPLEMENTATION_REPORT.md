# ハッシー生成起動元 Phase 1-A3 実装報告

作成日: 2026-11-02

基点: origin/main `951e9d2edbf5fcf850eb6829b336c7b7dc45295a`（PR #1416マージ後）

ブランチ: `codex/hassy-generation-provenance`

## 1. 調査した内容

既存仕様、Architecture Principles、Roadmap、Decision Log、利用実績のADRと実装報告、Daily生成の3 HTTP経路と定期Job、通常別案のポイント経路、写真起点経路、claimの再送・失敗再試行を確認した。生成処理はJobも所有者のactorUserIdを用いるため、actorだけではユーザー活動と区別できなかった。

## 2. 変更したファイル

- Platform Domainのindex: 共通GenerationTrigger型・許容値
- DatabaseのPrisma schema、migration、schema-readiness: 既存2テーブルへgeneration_triggerとCHECK制約を追加
- Daily / Variant生成Repository: claim時の保存と入力検証。Daily失敗再試行を比較更新
- Socialのdaily-mission-runtime: 別案claimの型と検証
- Webの生成Services、4 HTTPモジュール、Job Handler: 信頼できる起動元を明示して渡す
- MemberUsageRepository: 保存済み起動元の読み取り
- Database / Social / Webの関連テスト: 再送、再試行、集計、旧データ、DB制約、呼び出し元
- 本報告書とADR

## 3. 主要な設計判断

[ADR](adr/HASSY_GENERATION_PROVENANCE_ADR.md)を参照。既存行はUNKNOWNを維持し、過去データの推測補完・新イベント・新テーブルを追加しない。同一生成の再送は元の起動元を保持し、失敗後に実際に取得された次の試行だけを更新する。既存所有権・費用・冪等性の境界を維持する。

## 4. 実行した検証

Node 24.22.1、pnpm 10.10.0、PostgreSQL 16で実施。

- Prisma Client生成: 成功
- Database unit: 3ファイル43件成功（起動元17件、集計23件、readiness 3件）
- Social別案テスト: 12件成功
- Web関連テスト: 5ファイル39件成功
- PostgreSQL利用実績統合テスト: 21件成功（今回追加7件を含む）
- Web / Database単体TypeScriptチェック: 成功
- 変更TS / MarkdownのPrettier検査、依存境界検査: 成功

使い捨てDB `bunshin_disposable_51cf70e699c226b3` を127.0.0.1:18998へ限定して作成し、267 migrationを適用した。既存のDB名・comment marker preflight内で合成データのみ使用した。Container IDとtask/run labelを照合して終了し、専用container・一時volumeは削除済み。既存DBや本番には接続していない。

初回のSQLテスト4件はfixtureのサービスID指定不足で既存認可に拒否されたため、fixtureにgroupIdを明示して21件成功を確認した。認可コードは緩和していない。型チェックでポイント経路の起動元引渡し不足も検出・修正した。

WindowsではPrisma生成とテストの並行実行によるDLL競合、および複数パッケージを一度にlintした際のNode heap上限が発生した。生成・テストを順に実行し、lintはパッケージごとに分ける。リポジトリのタイムアウト・メモリ設定は変更していない。

Databaseのlintでテストモックの不要なasyncを検出し、Promiseを直接返す形へ修正した。該当17件を再実行して成功した。パッケージ別lintの最終結果はPRに記録する。

リポジトリ全体のformat / typecheck / lint / test / buildとDB全統合・release・TLS検証は、PRのCI verify / databaseを最終品質ゲートとする。最終結果はPRのチェック画面へ記録する。

## 5. 未解決事項

- 本人向け利用実績API / ロードマップUIは次の独立PR。
- 過去の生成起動元はUNKNOWNのまま。失敗試行ごとの詳細履歴の新設は今回対象外。
- 外部AI接続PoC、AI追加課金、本番migration適用・デプロイは行わない。

## 6. 次へ進める条件

- 本PRのレビュー、CI verify / database成功とマージ。
- 本人向けAPI / UIでは既存認証・rate limitを再利用し、timezone / asOfをサーバーで解決する。
- 本番提供前にmigrationの適用と対象バージョンのデプロイを別途確認する。
