# ワタシワークス 動画コア実装

## 目的

グループ限定の動画機能を、特定の動画生成会社へ依存せず安全に拡張できる土台として実装する。Phase V-1の利用者検証は外部チームが担当するため、本リポジトリでは実装と自動テストに集中する。

## 今回の実装範囲

- 30秒・60秒の縦型動画プロジェクト
- 台本、字幕、素材種別、表示時間を持つ場面構成
- プロジェクトと場面ごとのAI利用種別記録
- Group、Group Membership、Workspace、User、Bunshinの所有境界
- `VIDEO_GENERATION`のグループ許可と参加者割当を通過した場合だけ作成可能なRepository
- 楽観的Revisionによる場面構成の差し替え
- 過去のAI利用説明を再現するためのSnapshot

## 標準動画のルール

標準動画は静止画、利用者素材、承認済み素材、素材写真、文字の動きで構成する。AIが動画そのものを生成する場面は含めない。

- 30秒: 5〜7場面
- 60秒: 8〜12場面
- 場面時間の合計はプロジェクト時間と一致させる
- 場面番号は1から連続させる
- `AI_VIDEO`と`VIDEO_GENERATION`は標準動画で拒否する

AI動画は将来の追加機能として、グループ許可、参加者割当、原価上限、表示説明を別途満たした場合だけ利用可能にする。

## データ分離

動画作成時は、参加状態が有効であり、GroupとMembershipの両方で`VIDEO_GENERATION`が有効であることをサーバー側で確認する。Bunshinは同じWorkspaceかつ本人所有、Campaignは同じWorkspaceかつ同じGroupでなければならない。

取得時と更新時も`workspaceId + groupId + ownerUserId + projectId`を照合する。範囲外のプロジェクトは存在を明かさず取得不能にする。

## AI利用の記録

次の用途をプロジェクトまたは場面単位で記録できる。

- 台本作成
- 音声合成
- 画像生成
- 動画生成
- 素材の自動選択

利用者へ表示した説明はプロジェクトのSnapshotとして保持する。秘密鍵、APIキー、Providerの認証情報、個人Memoryは保存しない。

## V-2 動画企画・台本生成

動画企画は、先に本人所有の動画プロジェクトを確認してから生成する。AIへ渡せる情報は`VideoPlanningContextRepository`が許可した次の範囲に限定する。

- 本人所有のBunshinの目的、対象者、話し方
- 同じGroupで本人が参加を承諾した公開中Campaign
- 本人のBunshinへ割り当て済みの公開商品パック
- 商品の事実、必須表記、禁止表現
- 有効期限内の承認済み素材の識別子と説明

別Workspace、別Group、別User、別Bunshin、未承諾Campaign、未割当商品は取得しない。ProviderはApplication層のPortを通して呼び、OpenAI固有処理はWeb側Adapterへ閉じ込める。既存の管理画面で保存・有効化されたOpenAI設定を実行時に解決し、APIキーをコード、生成入力、生成結果、ログへ含めない。

生成結果は厳格な構造化出力とし、保存前に既存Video Coreで場面数、連番、合計時間、素材種別、AI利用種別を再検証する。標準動画では`AI_VIDEO`と`VIDEO_GENERATION`を許可しない。Provider失敗や不正な出力では場面を一件も保存しない。

本段階ではPort、Use Case、OpenAI Adapter、Isolationテストまでを実装する。実行API、管理画面、利用者画面、AI利用原価記録、Render処理は後続PRへ分離する。

## V-3 素材管理コア

利用者素材は公開URLではなく、Storage内の推測不能な`storageKey`で管理する。画像、動画、ロゴを対象とし、アップロード前に本人が利用権を確認した日時を保存する。

アップロードはStorage Providerへ直接依存せず、短時間の署名付きアップロードを発行するPortと、保存後の実体を検査するPortへ分ける。完了時は申告値を信用せず、MIME、マジックバイト相当の署名検査、容量、画像寸法、動画時間を検査してから`READY`へ変更する。失敗は`REJECTED`と理由コードを保存し、不正・未完了素材を動画企画へ渡さない。

利用者素材は`Workspace + Group + Group Membership + Owner User`で分離し、任意で本人所有のVideo Projectへ限定できる。GroupとMember双方の動画機能が有効で、参加同意済みの場合だけ登録できる。他利用者、他Group、停止・期限切れ素材は一覧と企画Contextから除外する。

承認済み商品素材は既存`ProductPackAsset`と`CampaignAsset`を正本として再利用し、利用者アップロードと重複保存しない。動画企画では、利用者素材、Campaign承認素材、素材写真、生成画像の順で選択する。

Schema、Migration、Application Port／Use Case、Repository、企画Contextに加え、Supabase Private Storage Adapter、署名付きアップロードAPI、本人画面まで接続した。利用者端末からアプリサーバーを経由せずStorageへ直接送信し、Service Role Keyはサーバー外へ出さない。

アップロード完了後、サーバーはファイル先頭（動画は必要に応じて末尾も）を読み、PNG／JPEG／WebPまたはMP4／QuickTimeの実シグネチャ、実容量、画像寸法、動画時間を検査する。DBと一覧APIには非公開Storage Keyや署名付き閲覧URLを公開しない。マルウェア検査とライフサイクル削除は後続PRで接続する。

## V-4 企画・台本生成APIと本人確認画面

本人が参加中のグループから動画プロジェクトを作成し、既存の動画企画Portを実行できるAPIと画面を接続した。生成前にWorkspace、Group、Membership、User、Bunshin、動画機能の許可をサーバー側で再確認する。

OpenAI設定は既存の管理画面で有効化された環境別設定を実行時に解決する。成功・失敗はPrompt Version、Model、Token、LatencyとともにAI利用履歴へ記録するが、台本本文、個人情報、APIキーは記録しない。Revisionが一致しない要求はProvider呼出し前に拒否する。

本人画面では動画名、分身、投稿先、内容、長さ、参加済み企画を選べる。生成後は場面ごとの秒数、話す言葉、画面の文字、素材種別、画像指示を日本語で確認できる。標準動画でAI動画本体を生成しないことも明示する。

外部Render、完成物、利用回数確定、課金、自動投稿は引き続き含めない。

## V-5A 台本承認とRender受付コア

本人確認画面に「この台本で進める」を追加し、`WAITING_APPROVAL`かつ画面で確認したRevisionと一致する場合だけ`APPROVED`へ進める。承認時もWorkspace、Group、User、Membership、参加同意、GroupとMember双方の動画機能許可を再検証する。

Renderは`VideoRenderProviderPort`へ分離した。承認済みRevisionだけを受付可能とし、`videoProjectId + projectRevision`のDB一意制約で二重受付を防止する。受付履歴にはProvider名、外部Job ID、状態、完成物の非公開Storage Key、安全なエラー分類を保持できる。外部URL、APIキー、動画内容は履歴へ保存しない。

本段階では実際の外部Provider呼出し、非同期Job、完成物取得、完成本数計上を行わない。Providerが未選定の状態で本人が承認しても、外部サービスへ送信されない。

## 後続PR

1. 外部Render Provider比較とAdapter
2. 非同期Render Job、成功時のみ利用回数を確定する仕組み
3. 台本修正と完成物取得
4. グループ管理画面
5. 素材のマルウェア検査とライフサイクル削除

本PRには外部レンダリング、FFmpeg Worker、課金、一般公開、SNS自動投稿、Provider APIキー管理を含めない。
