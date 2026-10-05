# AI研修プログラムの作成・接続導線

## 調査と変更

マナベルスタイルのServiceは本番管理画面で非公開・招待限定として作成済み。一方、公式プログラムは0件で、作成画面はSNS90日 / SIMPLEのみだった。既存採用処理にも研修Moduleの設定がなかったため、汎用定義を研修名で公開しても既存研修Runtimeへ接続できない。

- 公式プログラム画面へAI研修V1を追加する。
- 既存Packageの30日、25課題、FOUNDATION / PRACTICE / APPLICATION、GUIDED / READY_TO_USE定義をそのまま利用する。新しい課題や評価基準は作らない。
- 作成APIで期間と支援modeを固定する。採用APIは同一Workspace・公開済みVersion・利用可能Templateを照合し、完全一致する研修定義だけModuleへ接続する。
- SNS / SIMPLEの作成・採用は維持する。研修名を付けただけの汎用定義からModuleを推測しない。
- 採用・無料受講登録の`request.json()`をawaitせずPromiseを検証していた既存不具合を修正する。strict schemaエラーを400に変換する。
- DB / schema / migration、Provider、Skill提示設定、受講期間、課金・LINE・Jobには変更しない。

## 本番で行う手順（人間レビュー・マージ・デプロイ後）

1. `/admin/programs`で提供先を「運営団体ワタシワークス」、型を「AI研修（30日・個別化実務実践）」として確認する。
2. 名前・対象者・説明を人間が確認し、第1版を公開する。TemplateのPUBLISHEDはService公開や参加者配信の開始とは別である。
3. `/s/manaberu-style/manage/programs`で対象Templateを確認し「このサービスで使う」を操作する。
4. マナベルスタイルは非公開・招待限定を維持し、Skill Exposure設定を有効化しない。LINE配信・参加者招待・受講登録は別承認・準備後に行う。

## 検証と残事項

HTTPテストで正規研修の作成・採用、既存Preset互換、支援mode・期間・偽装Module拒否、認証・権限・Workspace/Service境界、未公開/利用不可Version、重複採用、改変研修定義拒否、無料受講登録のJSON解決を確認する。Module接続はSkill Exposure設定を作成しない。

本番登録・採用・受講開始は未実施。参加者、受講期間、運用担当・問い合わせ先、利用規約・Privacy、AI評価の実運用検証は別途確認する。Skill Pilot条件の承認や有効化をこのPRで代替しない。将来の研修定義改訂を現行完全一致判定へ暗黙採用しない。
