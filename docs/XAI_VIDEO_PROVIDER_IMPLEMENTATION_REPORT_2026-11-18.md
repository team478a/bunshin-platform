# PR-04 xAI動画生成Provider 実装報告

日付: 2026-11-18  
対象ブランチ: `codex/pr-04-xai-video-provider`  
基準: `main` (`a0efc812`)

## 1. 実装した機能

- xAI公式の非同期動画生成APIを既存 `VideoSceneGenerationProviderPort` へ接続した。
- Text-to-Videoと、既存の非公開参照画像を使うImage-to-Videoに対応した。
- `POST /v1/videos/generations` の `request_id` を既存の外部Job IDとして保存し、`GET /v1/videos/{request_id}` で状態を追跡する。
- 完了動画を許可ホスト、Content-Type、100MB上限、MP4シグネチャで検証してから既存の非公開Supabase Storageへ保存する。
- xAIの実請求ticksをUSD microsへ換算し、既存の実原価列へ保存する。
- 全動画Providerで、有料POST前に `SUBMISSION_UNKNOWN` をclaimし、応答やrequest ID保存が不明な場合の自動再送を防止する。
- 管理画面と利用画面で `XAI` を選択できるようにした。

## 2. 再利用した既存機能

- 動画シーン生成Port、非同期Job、外部Job ID、状態遷移、再試行・失敗管理
- 用途別AI Provider設定、モデル設定、接続資格情報、停止状態
- 会員・Workspace・Service・Groupの権限確認と動画利用権限
- 費用予約、日次・月次予算、見込原価・実原価記録
- Supabase非公開Storage、署名URL、字幕・編集・レンダリング経路
- FAL、Runway、Creatomateの既存Provider実装（削除・置換なし）

## 3. 追加・変更したファイル

- 新規: `apps/web/src/providers/xai-video.ts`
- 新規: xAI Adapter、Storage、原価ポリシーのテスト3ファイル
- 変更: 動画生成Application、DB repository、Job composition、runtime Provider設定、管理画面・利用画面
- 変更: 既存FAL用StorageをProvider共通名へ一般化し、互換aliasを維持
- 新規: `docs/adr/XAI_VIDEO_PROVIDER_ADR.md`
- 共有ファイルの変更: `docs/DECISION_LOG.md` へ決定を追記

## 4. DB・API・管理画面への影響

- DB schemaとmigrationの追加はない。既存 `VideoSceneGeneration` と `AiProviderConfiguration` を再利用する。
- 既存の動画シーン生成HTTP APIがProvider値 `XAI` を受け付ける。
- 既存AI Provider管理画面で、用途 `VIDEO_SCENE_GENERATION`、Provider `XAI`、モデル、1秒あたり見込原価、上限、停止状態を設定できる。
- 既存動画制作画面でxAIを選択できる。FAL、Runwayの選択肢は維持する。
- 本番Supabase、環境変数、本番DBへの変更は行っていない。

## 5. テスト実施結果

- xAI Adapterモック: 4件成功
- xAI出力Storage: 2件成功
- xAI動画原価ポリシー: 1件成功
- Application対象テスト: 11件成功
- Web対象テスト: 50件成功
- Database対象テスト: 16件成功
- `pnpm typecheck`: 成功
- `pnpm lint`: 成功（既存warning 4件、error 0件）
- `pnpm build`: 成功
- 変更20ファイルのPrettier検査と `git diff --check`: 成功
- ルート `pnpm format:check`: `.pnpm-store` 内の依存キャッシュを走査して構文誤判定するため完走せず。変更ファイルは個別検査済み。既存workflowファイル1件にもwarningがある。
- `pnpm test`: 同時実行負荷により既存DBテスト5件がtimeoutし終了コード1。5ファイルを単独再実行し、合計69件すべて成功。今回追加・変更したテストは全件成功した。
- Database Integration Test: ローカル環境に `TEST_DATABASE_URL` / `DATABASE_URL` がないため未実施。PR CIのDatabase checkで確認する。
- 実xAI APIは呼び出していない。モック成功を実API成功として扱わない。

## 6. 本番で利用できる範囲

コード実装済みだが、本番反映済みではない。マージ後も本番で使うには、xAI API資格情報、`VIDEO_SCENE_GENERATION` 用Provider設定、予算・有効状態の設定と、承認済みデプロイが必要である。

## 7. 未実装・未検証項目

- 実xAI APIによるText-to-Video、Image-to-Video、状態照会、実請求額の検証
- 実動画の品質、処理時間、成功率、単価、期限付き出力URLの有効時間
- Reference-to-Video、音声参照、keyframe、動画編集・延長、1080p
- 本番Supabaseへの保存、本番Job実行、本番字幕・編集・レンダリングの一連確認

## 8. 残るリスク

- xAI公式仕様のモデル、価格、status、レスポンス形式、配信ホストが変更された場合はAdapterと許可リストの更新が必要となる。
- Provider POSTの結果が不明な場合は重複課金防止を優先して `SUBMISSION_UNKNOWN` に留めるため、管理者による外部状態確認と復旧判断が必要となる。
- 実API未検証のため、コード上の契約適合は確認済みでも実サービス互換性は未確認である。

## 9. 次のPRで実装する内容

PR-05として、既存 `ExternalReadGrant`、外部読取認証、Member Usage、Daily Mission、Campaignの読取処理を再利用し、Provider非依存・読取専用のRemote MCP基盤を実装する。Grok Bot固有の接続PoCはPR-06に分離する。

## 10. PR URL

https://github.com/team478a/bunshin-platform/pull/1531
