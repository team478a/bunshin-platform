# ADR: ハッシー定義の明示選択と証拠取得の分離

作成日: 2026-11-02
Status: Accepted for B1 implementation.
基点: main 9860e0ba（#1427後）。

- ハッシーの5段階・項目・閾値・固定版の検証をWebのサービスPolicyへ移す。Applicationは明示注入されたPolicyと認可済み証拠を評価し、ハッシーの既定値を持たない。
- 既存のservice-createとHassy seedが保存するonboardingConfig.templateKey=HASSYを適用根拠とする。認可済みServiceContextのWorkspace / Group / Configurationの一致を確認し、未知・未設定・他テンプレートはロードマップ未提供とする。slug・表示名・businessProfileEnabledだけでは選ばない。新しい設定や自動バックフィルは追加しない。
- OEMのHASSYテンプレートも同じ定義を使うが、定義を取得する関数を選択したWorkspace / Serviceへ束縛する。現在の所属・同意・Bunshin所有権・停止・Entitlementの再確認を維持する。
- DatabaseのContextはSNS証拠と現在の利用可否のみを返し、定義factoryを呼ばない。Web composition rootがPolicyと証拠Adapterを組み立てる。Applicationからcapability-socialへ逆importを追加しない。
- 固定Hassy版の意味、5段階、必須項目、紹介で基本機能をgateしない検証を維持する。共通評価器はPolicy定義の構造・scope・条件・証拠キーを検証する。原価・実操作のSNS投影と二重集計の解消はB2で扱い、今回全サービス向けの新機能を追加しない。
- Hassy v1の公開DTOと次候補の意味を維持する。他テンプレートのロードマップAPIは404、ホームのロードマップメニューは非表示とする。利用実績APIや基本SNS APIの利用可否は変更しない。
- 既存のHassy専用50件の判定テストはPolicyのあるWeb側へ移し、共通評価器にはSNS項目や5段階に依存しないテストを置く。DB証拠のunit / SQL回帰、HTTP / UI / scope拒否を検証する。
- DB/schema/migration、テンプレート設定、特典・Credit・Flag・本番は変更しない。旧サービスに明示的HASSYテンプレートが保存されていなければ推測で救済しない。実データでの適用状況は別途確認する。
