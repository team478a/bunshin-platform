# Service向け毎日画像生成・LINE配信 実装報告

## 1. 調査した内容

- Serviceの毎日配信設定、Daily Mission Job、SNS画像生成パイロット、Private Storage、LINE Mission通知を確認した。
- 商用設定には月間画像・動画上限があったが、画像生成時に参照されていなかった。
- 既存画像JobはPointまたはBadgeだけを支払い根拠として確認し、既存Service画像クレジットを認識していなかった。
- LINE通知は本文と確認画面へのリンクだけで、完成済み画像を添付する境界がなかった。

## 2. 変更したファイル

- Service設定へ`mediaMode`を追加し、既存データの初期値を`TEXT_ONLY`とした。
- `ServiceMediaGenerationReservation`とmigrationを追加し、Service・月・画像／動画・操作キー単位の予約台帳を実装した。
- Daily Mission Jobから対象Missionの画像要求を冪等作成し、画像JobをLINE Jobより高い優先度で登録する処理を追加した。
- 画像Jobの支払い確認へService商用枠と既存Service画像クレジットを接続した。
- LINE Providerへ任意の確認画像を渡せるようにし、Private Storageの短期署名URLを画像メッセージへ利用した。
- 適格性、上限、設定互換性、画像付きLINE要求、画像取得失敗時の本文フォールバックをテストした。

## 3. 主要な設計判断

- 自動画像はService管理者の明示設定、`READY_TO_USE`、`IMAGE`／`SLIDE`、Production、商用月間枠、既存画像パイロットGateをすべて満たす場合だけ作る。
- 画像は完成時も`READY_FOR_REVIEW`とし、LINE添付は確認用プレビューとして扱う。採用やSNS投稿は利用者が決める。
- 上限は生成開始前に予約し、完成保存と同じDB Transactionで消費する。Job失敗時は予約を解放する。
- 画像処理中のLINE Jobは再試行する。画像生成または署名URL取得だけが失敗した場合は本文通知を継続する。

## 4. 実行した検証

- Prisma Client生成とSchema検証
- Application、Database、WebのTypeScript型検査
- Service設定、月間枠、画像HTTP、LINE Provider、LINE Delivery、Daily Missionの関連テスト
- lint、Web build、差分検査

## 5. 未解決事項

- 実際の本番送信には、対象Serviceの商用設定、画像パイロット、Feature Entitlement、Storage、OpenAI、LINE設定が必要。
- 動画本体の自動生成・LINE添付は未実装。既存方針どおり、Provider、原価上限、画像送信同意を運営確認後に別作業とする。
- LINE Messaging APIが取得する短期署名URLの有効時間は本番監視で確認し、必要なら専用の安全な配信URLへ切り替える。

## 6. 次Phaseへ進める条件

- Draft PRレビューとCI完了。
- Staging相当のServiceで、本文のみ、画像成功、画像失敗、月間上限到達の4経路を確認する。
- 動画については利用Provider、1本あたり原価、月間上限、素材送信同意、失敗時返金方針を運営決定する。
