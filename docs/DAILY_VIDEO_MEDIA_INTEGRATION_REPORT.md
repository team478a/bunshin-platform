# 毎日の画像・字幕動画と動画生成枠の接続

## 調査と対象

画像はOpenAI、文字合成、非公開Storage、LINE画像通知まで接続済み。個別AI動画もfal/Kling、場面生成Job、Creatomate合成、完成通知まで既に実装されている。古い計画書の「Provider未接続」は現行コードの状態を示していない。

今回、毎日の配信設定から字幕動画の自動準備へ接続し、画像と組み合わせて指定できるようにした。サービス契約の動画生成上限は個別AI動画と字幕動画で共通に適用する。

## 変更

- Service設定に`VIDEO`と`IMAGE_AND_VIDEO`を追加。既存設定は変更しない。
- Productionの`READY_TO_USE`参加者が対象。本文またはcaptionから30秒の字幕動画を自動作成する。投稿文のないプロンプト、予備アイデア、長すぎる本文は動画化しない。
- 本文とハッシュタグを保持し、字幕に収まらない場合も途中切断しない。音声、人物の動き、商品写真の挿入は今回の字幕動画に含めない。
- Workspace、Bunshin、Daily Missionから安定した動画IDを作り、DB主キーで同日の重複プロジェクトを防止する。既存APIへ任意ID入力を公開しない。
- Serviceの明示的な自動準備設定を根拠に、字幕構成の準備、制作承認、Render Job登録を進める。SNS投稿の承認・投稿完了は自動化しない。
- 完成通知は既存のLINE完成通知を利用する。動画ファイル添付ではなく本人の確認画面へのリンクを送る。投稿案画面にも該当動画へのリンクを表示する。
- 動画枠はService契約行をロックして予約。AI場面と最終合成は同じプロジェクト版の1枠を共有し、完成MP4保存と同じTransactionで一度だけ消費する。
- 長時間の場面生成で予約が失効しないようにする。失敗した場面群の処理終了、最終合成失敗で予約を解放し、管理者再試行時は枠を再確認する。完了通知の失敗は消費済み枠を変更しない。
- キュー作成と外部送信前に契約状態を確認する。既に外部送信した動画は停止後も状態確認と保存を継続する。

## 主要ファイル

- `apps/web/src/services/automatic-daily-video.ts`: 字幕構成、所有範囲確認、冪等な自動準備
- `apps/web/src/jobs/daily-mission-job-handler.ts`: 毎日の起動
- `apps/web/src/services/automatic-daily-image.ts`: 画像と動画の併用設定
- `apps/web/app/s/[serviceSlug]/manage/settings/service-settings-editor.tsx`: 管理設定
- `apps/web/app/s/[serviceSlug]/bunshins/[bunshinId]/`: 投稿案と動画の導線
- `packages/database/src/video-media-quota.ts`: 動画枠の予約と確定
- `packages/database/src/index.ts`: キュー・成功・失敗・再試行への接続
- `packages/application/src/video-core.ts`: 内部の安定したIDを受け取る作成契約

既存テーブルと予約台帳を利用し、Schema変更はないためmigration追加は不要。

## 検証

字幕の全文保持、長文・制作指示の除外、30秒の合計時間、所有範囲、安定したID、重複Jobキー、非対象環境、契約上限、再試行、失敗時解放のテストを追加した。PostgreSQL統合テストには同時予約で1枠を超えないこととTransaction rollbackを追加した。

## 本番確認と残作業

- 本番の契約枠、動画機能の割当、Creatomate接続、AI利用表示ルール、Storage、LINEを有効にした限定サービスで端末確認する。
- 自動準備前の設定不足・Provider設定エラーはログへ残し、文章通知を継続する。設定修正後の再準備は運用で再実行する。
- AIキャラクターを選んで動かす毎日の自動動画、LINE動画ファイル添付、商品・本人写真を画像生成へ渡す接続は別作業。既存の個別AI動画作成は継続利用できる。
- 本番での自動準備とLINE到達、重複課金がないことを確認後、次の素材連携へ進む。
