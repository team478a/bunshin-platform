# マナベル自由希望研修: 既存環境の再利用確認

2026-10-12 Asia/Tokyo。自由希望研修の実装に向けた環境準備の記録。機能全体の完成、本番反映、実受講者の学習効果の確認ではない。

## 既存設定と再利用方針

- 元のプロジェクトのgit ignore対象 `.env.local` に `OPENAI_API_KEY` が存在する。作業用checkoutには同キーがない。作業用checkoutだけの確認を、既存キーがない証拠にしない。
- ユーザーから既存接続の再利用承認を受けている。キーを表示、コミット、Docker環境変数へ投入、別envファイルへ転記しない。診断では元ファイルからメモリー内でのみ読み取った。
- 既存の `scripts/test/feedback-real-auth-environment.ps1` を再利用する。PostgreSQL16、Supabase GoTrue v2.192.0、loopback gatewayを新規runで作成する。過去の検証環境は終了後に破棄されており、稼働し続けている環境ではない。
- Vercel projectへのリンクは、独立した検証DB・認証・AI設定が準備済みである証拠にはしない。本番DB、顧客データ、productionの暗号化Provider設定は流用しない。

## 今回の検証用runtime

run: `f12a671bb9024c18`。task label: `bunshin-feedback-auth-f12a671bb9024c18`。

| 対象    | 完全ID                                                             | 用途                       |
| ------- | ------------------------------------------------------------------ | -------------------------- |
| DB      | `1904c90d8d8b794a92afefa85c35d0bc549f0a263ebe0c6421d671f037af26ee` | 新しい空の合成DB           |
| Auth    | `8b7749364b19e33b98543d5f54fc9733ebcc41158735f9d7319e35877d0c2d69` | ローカル検証用認証         |
| gateway | `8509b59baab9ce25f9eec1a8fdc257abdfeb6ec98c60e0d696916c9a96568ea7` | 127.0.0.1の18998/18999のみ |

DB `bunshin_disposable_f12a671bb9024c18` の `current_database()` とcomment `bunshin-disposable-test:f12a671bb9024c18` を照合済み。Auth healthからGoTrue v2.192.0を確認した。通常登録はまだ検証しておらず、この既存helperは合成アカウント用にsignupを無効化する。これを製品の招待制方針に変更したと解釈しない。

## AI接続診断と未確認事項

既存実装の管理画面接続確認と同じ、モデル情報取得 `GET /v1/models/gpt-5.2` を実行した。HTTP 403で拒否され、生成APIは呼んでいない。追加診断でも403。応答本文・秘密情報は表示していない。対照として資格情報を送らず同じendpointを取得すると、OpenAI request IDを持つ401が返った。

ネットワーク経路が存在することは確認したが、403の原因は特定していない。キー失効、残高不足、モデル非対応とは断定しない。モデル情報取得の拒否だけを、生成APIにも権限がない証拠にしない。接続成功・実生成成功・予算十分はいずれも未確認。

元ファイルにはキー設定だけがあり、正の固定リクエスト原価設定はない。既存Runtimeは原価不明を0円扱いせず送信前に拒否する。今回、推測した価格やproductionの秘密設定でこの条件を埋めていない。

自由希望の解釈、生成、途中支援、画像読取、評価、次課題提案の実AI通し確認と利用量・実測原価は未実施。環境準備や従来の合成テストを、新機能の受入条件のPASSにしない。

## 継続と終了

このrunだけを後続のローカル検証に再利用する。既存241 Migrationの適用はexit 0。`_prisma_migrations`の読取で241件・未完了0件を照合し、Auth Userは0件を確認した。新しい教材経路や通常登録フローのHTTP/画面検証は未実施。

この記録を追加する前のPR #1261 head `66a8b00e8d600eb215da753963430f0956b0429b` はGitHub CIのverify/databaseともSUCCESS。文書追加後のheadのCI成功と混同しない。今回の追加はこの記録と前報告の参照修正のみで、アプリケーションコード、schema、Migrationファイルは変更していない。文書Prettierと `git diff --check` を確認した。

終了時は上記完全IDとtask labelを再照合し、当該Auth/gateway/DBのみ停止する。auto-removeを確認し、専用networkもIDとlabelを照合して除去する。共有prune、別プロジェクトのcontainer停止、元checkoutの変更・上書きは行わない。本番Migration、設定変更、課金、LINE送信、Pilot開始は行っていない。
