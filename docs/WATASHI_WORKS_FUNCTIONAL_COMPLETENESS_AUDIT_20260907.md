# ワタシワークス機能完成度監査（2026-09-07）

## 対象と確認方法

- 対象: ローカル HEAD `64c3c359`。取得済み `origin/main`（PR #485 マージ、`53e091dd`）とのファイル差分なし。
- 仕様書、既存実装報告、画面、HTTP ハンドラー、Application、Prisma、Provider の接続を照合したコード監査。
- 今回は機能修正を行っていない。認証済みスマートフォン操作、実際の生成、LINE受信・再生、本番の環境変数・データ全件は検証していない。
- 古い報告書の「未接続」は、その後の実装と照合して判断した。全ルートの動作保証や全不具合の網羅を意味しない。

## 優先修正: 表示と実装の不一致・処理の抜け

### 1. 標準動画の写真・素材が映像出力に接続されていない

画面は「写真を順番に見せる」「標準動画（画像・文字・音声で作る）」を選択できる。しかし現在の Creatomate 合成は、AI動画ソースがあれば動画、なければ単色背景に字幕を重ねる。静止画像や本人素材を描画する分岐がない。

- 根拠: `apps/web/app/ui/video-project-creator.tsx:116,133`
- 根拠: `apps/web/src/providers/creatomate-video-render.ts:39-116`
- 対応: シーンと素材の対応付け、所有権・利用許諾確認、画像ソースの取得、合成まで接続する。提供までの間は、未対応の選択肢・説明を現状に合わせる。
- 完了条件: アップロードした写真が指定順で実際の MP4 に映り、他ユーザーの素材は利用できない。

### 2. ナレーションが音声出力に接続されていない

企画には narration と VOICE_SYNTHESIS の情報を持てるが、合成処理は narration を利用せず、音声トラックも作らない。AI動画ソースも volume が 0% になる。「音声で作る」という期待を満たさない。

- 根拠: `packages/application/src/video-core.ts`、`apps/web/src/providers/openai-video-plan-generator.ts`
- 根拠: `apps/web/src/providers/creatomate-video-render.ts:67` と同関数全体
- 対応: 音声合成、保存、字幕との時間調整、原価・失敗・再試行を接続する。未提供なら音声対応の表記を取り下げる。
- 完了条件: 実際の MP4 でナレーションが再生され、音声生成失敗を成功扱いしない。

### 3. 退会処理の削除対象が追加機能に追いついていない

現在の退会完了処理は認証・LINE情報の削除、個人ワークスペース内の従来データの匿名化などを実装済み。一方、ServiceMemberBusinessProfile、動画素材・企画・生成画像などの追加データや、その Storage ファイルを同処理から削除・匿名化する接続がない。

User は物理削除せず DELETED へ更新するため、外部キーの onDelete: Cascade では企業プロフィールは消えない。素材の保存期限による別バッチはあるが、退会に連動する削除ではない。組織保有素材の扱いは権利・保持要件を分けて定義する必要がある。

- 根拠: `packages/database/src/index.ts:6243` の PrismaAccountDeletionPurgeRepository 全体
- 根拠: `packages/database/prisma/schema.prisma:2382` の ServiceMemberBusinessProfile
- 根拠: `apps/web/src/http/account-deletion-operations.ts:26`、`apps/web/src/http/asset-lifecycle-operations.ts:23`
- 対応: 追加テーブルと Storage の保持・削除一覧を作り、退会バッチへ接続する。ファイル削除失敗時の再試行と完了判定も含める。
- 完了条件: テストユーザーの退会後、定義した削除対象が DB・Storage とも残らず、共有組織データは適切に保護される。
- 本番の削除モードが有効かは今回未確認。

## 設定は存在するが機能全体は未完成

### 4. 独自ドメイン

ドメイン名・状態を登録する画面と保存処理はある。アプリ内で登録ホスト名からサービスを解決するルーティング、DNS の自動検証は確認できない。VERIFIED は管理操作で設定される。画面にも、設定だけでは公開されない旨が書かれている。

- 根拠: `apps/web/app/(app)/admin/services/service-custom-domain-editor.tsx:62`
- 根拠: `apps/web/src/http/services.ts:447`、`apps/web/src/services/public-service.ts`
- 対応: DNS・ホスティング設定とホスト解決を接続するか、管理者による設定代行機能として状態・手順を明確にする。
- 既存の www.watashi-works.com が使えないという意味ではない。

### 5. Runway 接続

管理画面に Runway の名称・設定項目があるが、接続テストは VIDEO_PROVIDER_CONNECTION_NOT_IMPLEMENTED を返す。設定可能な Provider としての完成には至っていない。

- 根拠: `apps/web/app/(app)/admin/ai/provider-configuration-editor.tsx:27,304`
- 根拠: `apps/web/src/ai/secure-provider-configuration.ts:95`
- 対応: 接続するか、未提供と明示して利用開始操作を出さない。既存の FAL 経由の動画生成とは区別する。

## サービス拡張時に必要な接続

以下は直ちに障害という意味ではない。

| 項目             | 現在の範囲                                                    | 残る接続                                                                                                     |
| ---------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 有料契約         | プラン、制限、FREE / MANUAL_INVOICE / EXTERNAL_BILLING の管理 | アプリ内決済から契約開始・更新・停止までの自動処理は確認できない。手動請求で運営するなら別途の運用で対応可能 |
| 写真の再利用     | 個別画像生成への参照写真入力                                  | 保存済み写真を日々の自動生成へ選択・適用する流れ                                                             |
| 自動動画         | 日次字幕動画の作成と通知                                      | キャラクター・写真素材を利用した日次動画への接続                                                             |
| 運営者の動画配信 | リンクによる配信                                              | 本人向け動画完成通知で追加した LINE 動画添付の、運営者配信への展開                                           |
| 初回利用         | 業種等の登録、Bunshin 設定、配信開始設定が存在                | 新規登録から初回受信までを一連の実機操作で確認。登録だけで配信開始済みとは扱わない                           |

プランの根拠: `apps/web/src/http/services.ts:60`。配信開始の前提チェックと週間準備ジョブの根拠: `apps/web/src/http/service-automatic-delivery.ts:64-106`。

## すでに接続されているため未実装扱いしないもの

- 業種別の企業プロフィールと日次アイデアの基盤。
- 日次画像・字幕動画の生成、プランに応じた利用上限。
- 個別画像生成への参照写真入力。
- 本人向け動画完成通知への LINE 動画添付と再試行時の送信内容固定。
- 退会申請・Auth 削除・従来データ匿名化の基盤。ただし上記の追加データ対応は残る。

関連資料: `WATASHI_WORKS_DAILY_IDEA_IMPLEMENTATION_REPORT.md`、`DAILY_VIDEO_MEDIA_INTEGRATION_REPORT.md`、`SOCIAL_IMAGE_REFERENCE_REPORT.md`、`LINE_VIDEO_ATTACHMENT_REPORT.md`。

SNS完全自動投稿、Canva完全連携など、仕様上のMVP対象外は不具合に数えない。

## 次の実装順と検証条件

1. 標準動画の実態と選択肢・説明を一致させる。同時に退会対象の棚卸しを行う。
2. 退会時の追加データ削除と再試行を完成させる。
3. 写真合成・音声出力を接続し、素材から完成動画まで確認する。
4. 未提供 Provider・独自ドメインの管理画面を整理する。
5. スマートフォンと LINE で「新規登録 → 初回受信 → 翌日の自動受信 → 画像/動画閲覧 → 停止/再開」を通して検証する。

コード変更がないため lint / typecheck / test / build は今回再実行していない。上記の実装時には、所有権、重複生成・二重通知、Provider失敗、退会後のファイル残存を中心に回帰テストを追加する。CI成功だけを実運用確認の代わりにしない。
