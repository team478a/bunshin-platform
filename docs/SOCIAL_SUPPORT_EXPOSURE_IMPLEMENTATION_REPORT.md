# SNS支援の表示・詳細閲覧の到達記録

2026-11-02 / 基点 main 01b4e321（#1436）

## 1. 調査

既存Case / Confirmation / Interventionは質問回答、支援提供、採用、完了、見送りと理由、抑制を保存している。表示と詳細の閲覧は再構築できない。既存Support Improvement Adapter・管理者専用Overview、本人APIの認可/同意/Feature Entitlement/Rate Limit、既存Bunshinロックを再利用した。外部Agentや新しい提案台帳は作らない。

## 2. 変更ファイル

| 責務           | ファイル                                                                                           |
| -------------- | -------------------------------------------------------------------------------------------------- |
| SNS計測契約    | capability-social/activity-barrier-support.ts、improvement-support-outcomes.ts                     |
| 原本保存       | database/social-activity-barrier-confirmation-repository.ts                                        |
| 最小DB追加     | schema.prisma、20261102200000_social_support_exposure/migration.sql、schema-readiness.ts           |
| 本人API        | Web/service-social-activity-barrier.ts、既存activity-barrier配下のexposure/route.ts                |
| 表示/詳細操作  | activity-barrier-card.tsx、activity-support.css                                                    |
| 安全な管理表示 | hassy-improvement-support-adapter.ts、service-improvement-overview.ts、Webの既存Overview射影とcard |
| 検証           | 既存DB/API/画面/SQL fixtureとactivity-support.e2e.tsの拡張                                         |

共有ファイル: capability-social/src/index.tsへ定義exportを追記。schema-readiness.tsの最新migrationを更新。SQL試験の既存登録を再利用し、新しいrunnerは作らない。

## 3. 設計判断

[ADR](adr/SOCIAL_SUPPORT_EXPOSURE_ADR.md)を実装前に記録。既存InterventionへfirstDisplayedAt / firstDetailsViewedAtのnullable列のみ追加する。既存RLSを継承し、新規table・Cron・AI呼出しなし。既存の採用/完了/見送り状態は変更しない。

表示はカードが可視領域へ入ったときに送信する。閉じたメニュー内で単にマウントしただけでは送信しない。詳細は本人が詳細欄を開いたときに送信する。同一画面では各種別を1回だけ試み、再送もサーバーの初回値を保持する。詳細要求が先着した場合は表示時刻も同じ値で保存する。時刻はサーバー受信時刻で、読了や注意を向けたことの証明ではない。

POSTだけが記録し、GETは読み取り専用。payloadはsupportIdとDISPLAY / DETAILSだけ。本人・所属・同意・Service/User/Bunshin・ACTIVE SOCIAL・現在の支援機能権限を再確認する。終了状態への遷移と並行して到着しても支援状態を変えない。記録失敗は内容やIDを含めずconsoleへ残し、支援の開始・完了・見送りを止めない。再読み込みで再試行できる。端末の紛失・通信不良・旧クライアント等で届かない閲覧は復元しない。

新規支援の既存definitionSnapshotへ計測版social-support-exposure-v1を付ける。旧支援は計測済みと推測せず、表示時刻がnullであることを未閲覧の0と断定しない。過去値のバックフィルはない。

既存Support Adapterの認可・原本取得を共用し、管理Overviewの1回の読取要求内でのみ、採用/完了と表示/詳細の2つの観測へ同じsnapshotを投影する。DBへ同じ支援を2回取りに行かない。要求を越えたキャッシュは置かず、次の要求では管理者権限を再検証する。共通ApplicationにSNS指標を固定しない。

表示観測の母集団は選択週に用意した支援、締切はその週の末（排他的）。締切前に届いた初回表示/詳細記録の件数だけを表示する。締切以後の記録を遡って含めない。既存5人抑止、前後項目の組合せの少数セル抑止、欠測・読取打切りの保留、件数範囲を再利用する。旧支援の混在は表示観測だけを保留し、既存の採用/完了集計は元の定義で維持する。届いた記録であり、全閲覧の捕捉率・実利用率・因果効果と呼ばない。

## 4. 検証

合成データのみ使用。ローカルでAPI/管理画面65件、DB側39件、スマホ支援5件、全348件のPostgreSQL結合テストを確認。追加の共有snapshot読取・管理画面結合確認と最終format/typecheck/lint/test/buildの結果はPR本文とCIへ記録する。

主なケース: 同時DISPLAY/DETAILS、初回時刻固定、詳細先着、他OEM/Bunshin拒否、機能停止、旧支援のUNKNOWN、締切境界、原本1回読取・次要求での認可、閉じたdrawerの除外、閲覧記録API障害中の支援操作。

## 5. 未解決・本番状況

コード実装と合成データ検証の段階。本番migration、設定変更、Feature Flag変更、デプロイは未実施。本番反映時はmigration適用・readinessを先に確認する。

質問そのものの表示、外部設定開始・設定完了・実利用・失敗・利用停止の記録は本作業外。存在しない外部接続状態を作らない。ブラウザから届いた記録は信頼されたSNS公開証明ではない。費用・全閲覧率・負担軽減・因果効果は未判定。旧支援の計測履歴は補完しない。

## 6. 次へ進む条件

本PRのCI・レビュー通過後、未確定のサービス別特典catalog・期間・本部上限を明示してから人数体験権限へ接続する。MUSEは公式サービス確認後にガイド/PoCを進める。提案採用だけで外部操作や課金を自動実行しない。
