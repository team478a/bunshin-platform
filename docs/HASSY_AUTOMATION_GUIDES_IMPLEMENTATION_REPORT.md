# ハッシーの投稿準備・自動化ガイド

2026-11-02 / 基点 main bf540625（#1435）

## 1. 調査

既存HASSY profile selector、本人向けService Bunshin画面の「その他のメニュー」、成長ロードマップのガイド項目、紹介特典catalogを確認した。ガイド項目名はあるが、利用者が読めるZapier利用説明と指示文コピーはなかった。人数に応じた体験権限は期間・本部上限の契約が不足しており、この作業では付与しない。

MUSEは同名サービスを取り違えないため公式URLをユーザーへ確認した。確認前の登録URL・機能・接続手順は実装しない。これを理由に既存SNS機能や独立したガイドの提供を止めない。

## 2. 変更ファイル

- apps/web/app/ui/hassy-automation-guide/card.tsx / guide.css: 静的な手動投稿準備、Zapierの利用検討、相談用の固定指示文のコピー。
- service-bunshin-detail-view.tsx: 既存HASSY Policy Gateと本人・ACTIVE SOCIAL条件でメニューへ接続。
- apps/web/test/hassy-automation-guide.test.tsx: 明示profile選択、他サービス/別scope、外部リンクと静的内容。
- scripts/test/learning-ui/automation-guide.e2e.ts: 実コンポーネントでモバイル表示・コピー成功/拒否・API呼出しなしを確認。

共有ファイル: 既存ブラウザharnessのmain.tsxとe2e.config.tsへ追加登録。DB/schema、公開package exports、Cron、環境変数は変更しない。

## 3. 設計判断

[ADR](adr/HASSY_AUTOMATION_GUIDES_ADR.md)を実装前に記録した。Hassy固有の文言と外部サービス案内はWebのService側に置き、共通Domain/ApplicationやSOCIAL共通catalogへ混ぜない。既存の認可済み本人画面とHASSY profile selectorを再利用する。

ガイドの開閉は任意。通常のSNS利用に外部登録・紹介を要求しない。閲覧・コピーをロードマップ達成や接続完了とみなさず、既存のガイド項目の達成・権限・推薦状態も変更しない。このガイドは読み物の入口であり、推薦の採用や外部実行の代わりではない。

固定指示文にユーザー情報・投稿本文・Memory・Tokenを挿入しない。コピー後の貼り付け先と入力情報は本人が決める。clipboard拒否では成功表示せず、手動選択できるreadOnly textareaを残す。

## 4. 公式仕様の根拠

2026-11-02に公式文書を確認。文面は日本語で要約し、登録フローや無料枠の数値は固定しない。

- [Zapの仕組み](https://help.zapier.com/hc/en-us/articles/8496309697421-What-is-a-Zap): トリガー・アクションと公開前の確認。
- [テスト時の動作](https://help.zapier.com/hc/en-us/articles/18811411817741-Test-Zap-steps): アクションテストでも接続先へ実操作が行われる。
- [タスクと上限](https://help.zapier.com/hc/en-us/articles/8496181445261-Zap-limits)、[現在の料金](https://zapier.com/pricing): プラン・タスク・追加料金を利用時に確認する。

ハッシー専用Zapierアプリ・API・OAuth・MCPや、SNS予約投稿対応の存在は主張しない。

## 5. 検証と本番状況

対象Web11件（新規5件を含む）、スマホ2件がローカル成功。コピー成功・拒否、APIアクセスなし、横幅、scope不一致と他profileの非表示を確認。標準format/typecheck/lint/test/buildと既存DB/全画面の最終結果はPR本文とCIへ記録する。ガイドはAI/API呼出し・外部接続・投稿・設定変更を行わず、新しい原価を発生させる処理もない。

実装・検証と本番反映は別。本番設定・Feature Flag・migration・デプロイ・外部アカウント操作は未実施。

## 6. 未解決と次の条件

MUSEの公式URL・仕様確認、本人認証付きPoC、商用利用・OEM可否、連携状態管理は未実装。実接続のない状態を「未接続」「接続済み」という実在の連携状態として保存しない。紹介3/5/10人の体験権限は、サービスcatalog・期間・本部上限の契約を確定してから既存Entitlementへ接続する。本PRのレビューとCI後、確定した仕様の範囲で次へ進む。
