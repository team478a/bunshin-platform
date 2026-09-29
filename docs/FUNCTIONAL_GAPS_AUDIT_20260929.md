# 機能不足の再監査（2026-09-29）

対象は千ノ国メディア、ハッシーSNSサポート、占い、AI研修、OEM。設定・接続・運用確認を未実装機能に数えない。初回基準はmain `bf3ba611`（PR #1002まで）。現在はmain `89a3c8c6`（PR #1004/#1008まで）と今回の過去終了日時個別確定の差分へ更新。PRマージやコード存在を本番稼働の証拠にはしない。

## 確認できた機能不足と推奨順

### 追加監査: 非公開サービスの参加者操作API

main `3e57e72b`で画面とAPIの公開判定の差を確認した。下記は初回監査4件の実装後に発見した機能不具合であり、本番で不正参照が起きた証拠ではない。

1. **投稿パートナーの一覧・作成・取得・編集・停止と初回回答からの候補提案: PR #1012で実装済み**。認証後の本人Member Service解決を使用し、非公開Serviceの既存参加者も操作できる。Service所属の編集/停止にも本人所有を必須とし、個人用管理権限は維持する。詳細は`PRIVATE_SERVICE_BUNSHIN_OPERATIONS_IMPLEMENTATION_REPORT.md`。
2. **SNS設定・発信方針・投稿テーマ・週間計画の操作API: PR #1013で実装済み**。4種類19操作を認証後のMember Service解決へ合わせ、本人所有・SOCIAL能力・入力/Origin検証と生成時の自Service公式知識/用語/Quota等を維持する。詳細は`PRIVATE_SERVICE_SOCIAL_PLANNING_IMPLEMENTATION_REPORT.md`。
3. **投稿の採否・完了・実行結果の保存/振り返りAPI: 今回修正**。共通Mission Scope、業務成果、SNS数字保存/読取と日々のメモ/写真を認証後のMember Service解決へ合わせ、Service固有の機能設定・本人所有・同意・SOCIAL能力を維持する。詳細は`PRIVATE_SERVICE_POSTING_OUTCOMES_IMPLEMENTATION_REPORT.md`。本番反映は別途必要。

商品紹介・紹介リンク・初回設定・動画通知等の別機能APIにも公開Resolverが残る。匿名公開入口を維持すべき箇所と既存参加者操作を個別監査する。上記3件の修正だけで全非公開Service対応完了とは扱わない。

千ノ国・ハッシー・OEM等で該当する共通機能の修正。公開登録やService固有の業種/質問フローを共通化しない。本作業では設定・Provider実呼出・本番データを変更しない。

### 初回監査の4件

1. **OEM決済CSVの受付期間指定と上限超過検出: PR #1003で実装済み**。日本時間の期間指定・10,001件目の検出・部分CSV拒否・画面案内を追加。同期10,000件上限自体は残る。詳細は`OEM_PAYMENT_EXPORT_PERIOD_IMPLEMENTATION_REPORT.md`。
2. **AI研修の無料・手動登録受講の自動期限終了: 今回バッチを実装**。購入に紐づかないACTIVE受講を明示Service限定でEXPIREDへ冪等に確定し、評価待ちを停止する。ロック・所有/Module再確認・CAS・最小システム監査・既存終了日Triggerを使用。development/stagingの内部実行口だけを追加し、本番停止・定期実行未登録を維持する。詳細は`ai-training/AI_TRAINING_AUTOMATIC_EXPIRY_IMPLEMENTATION_REPORT.md`。有料期限処理は変更しない。
3. **占いAI生成の非同期化と再試行: PR #1007で実装済み**。D-145に従うQueue/Worker、最大3回の一時障害再試行、lease/本人/Service/Bunshin境界、試行別Quota/使用量記録、標準結果の即時表示をコード実装した。既定無効の`FORTUNE_ASYNC_GENERATION_ENABLED`で既存同期方式を維持する。CI検証は対象PR、本番有効化・実AI検証は別作業。詳細は`FORTUNE_ASYNC_GENERATION_IMPLEMENTATION_REPORT.md`。
4. **AI研修の過去終了日不明データの管理者確定手段: 今回個別操作を実装**。管理者が証跡を確認して日時・理由を指定し、Preview・確認Revision・受講排他・未確定CAS・監査で保存する。既存確定日を上書きせず、アーカイブ/退会後の記録にも対応する。事実不明なら保留のままにし、自動推定・一括補完・実削除・本番期限処理の停止解除は行わない。詳細は`ai-training/AI_TRAINING_END_DATE_CONFIRMATION_IMPLEMENTATION_REPORT.md`。検証は対象PRのCI、本番確認は別作業。

## 実装済みと確認した項目

- 千ノ国メディア: LINE参加案内、通知接続導線、登録通知回復、写真/ナレーション/音声設定は既存コード・機能報告に存在。今回確認した範囲で新たな必須の欠落は確定していない。
- ハッシーSNSサポート: 障壁の検知・確認・解消・管理集計、追加質問の延期、OEM支援候補の投影/管理を既存実装として扱う。古い報告書の「未実装」をそのまま再掲しない。
- 占い: 履歴・フィードバックに基づく個別化、生成停滞の標準結果回復は実装済み。`packages/database/src/fortune-generation-repository.ts`と`docs/FORTUNE_GENERATION_RECOVERY_IMPLEMENTATION_REPORT.md`を確認。
- AI研修: 管理者の明示終了/取消/再開、本人Export/削除、期間ガード、管理者の期間表示、保持期限Preflight/開発環境実行は実装済み。本番期限削除は停止中。
- OEM: 決済・返金・異議申立て/チャージバック、決済通知回復、請求書、独自登録/ドメイン、CSVの既存金額列は実装済み。

## 未実装とは分けて扱う確認事項

- 千ノ国: 参加→LINE連携→翌日配信を実端末・本番記録で確認。
- ハッシー: 支援後の行動変化を運用しながら確認。
- OEM: 実決済、返金、請求書のProvider接続と本番確認。
- AI研修: 本番の保持期限処理と定期実行の承認・有効化。現在の停止を今回解除しない。
- 自動SNS投稿、高度分析、自前動画生成、AI電話などは承認済みMVPの不足として先回り実装しない。

この監査はコードで根拠を確認できた範囲であり、各サービスの全シナリオに不足がないことの保証ではない。今後の作業ごとに最新コード・仕様・検証結果で更新する。
