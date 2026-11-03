# ワタシワークス / bunshin SNS公式API共通基盤 — Phase 1-A

作成: 2026-11-03  
基準main: `422e012c257dc81d1899e2c8c9763e8784a3cced`  
状態: **承認境界とInstagram公式APIの内部通信Adapterの追加。外部接続・投稿は未実装。**

## 1. 目的と判断

ハッシー100社の無料実証、将来のOEM展開、他サービスへのSNS機能再利用のため、投稿用のSNS公式開発者アプリを運営側で管理する。利用者には各SNSの公式ログインと必要な投稿権限の許可だけを求め、利用者ごとに開発者アプリ/APIキーを取得させない。

投稿先は当面Instagramを優先し、次にThreads、Facebook、TikTok、YouTube、Xを個別の権限・費用・審査条件に基づいて判断する。第三者SNS投稿APIの契約・全面導入は行わない。Meta MuseはBUNSHINを操作する外部AI入口とし、SNSへ投稿するためのMeta Instagram公式OAuthとは分離する。

過去の`docs/IMPLEMENTATION_ROADMAP.md`にあるPhase 10のSNS OAuth/Publishing Adapterは当初MVPの対象外だった。今回の運営方針はInstagram直接接続を新たな限定作業単位として先行するが、**従来のFREE MVP全体を完成・変更したと見なさない**。本PRだけでPhase 10、Meta App Review、Production Gateを完了としない。

## 2. 既存資産と責務

| 既存コード                                              | 維持する役割                   | 変更してはいけないもの                     |
| ------------------------------------------------------- | ------------------------------ | ------------------------------------------ |
| `packages/capability-social/src/social-profile.ts`      | SNS発信設定・媒体の選択        | 投稿認証済みアカウントであると誤表示しない |
| `mission-generation.ts`、Daily Mission、Content Variant | 投稿内容の企画・生成・品質判定 | Muse/InstagramのProvider固有型を混ぜない   |
| `mission-outcomes.ts`、PostRecord                       | 本人の手動投稿・Feedback       | `source=MANUAL`をAPI公開成功に変更しない   |
| `apps/web/src/providers/creatomate-video-render.ts`等   | 画像・動画の生成               | 新SNS機能のため全面作り直さない            |
| `packages/application/src/job-runtime.ts`、既存Job      | 非同期処理・再試行の共通基盤   | Provider公開の重複を生む新Queueを作らない  |
| `external-read-*.ts`、Muse PoC                          | 外部AIから本人情報を読む認可   | SNSへ投稿するOAuthや接続Tokenを流用しない  |

## 3. 今回追加したコード（Phase 1-A）

1. `packages/capability-social/src/social-publishing.ts`: Publisher非依存の投稿Intent、承認Snapshot、結果、Provider Port。承認者/対象Workspace・Service・User・Bunshin・SNSアカウント・本文・媒体・revision・予定時刻が変わった場合は拒否する。通常操作へ確認画面を追加しない。
2. `apps/web/src/providers/instagram-direct-publishing.ts`: Instagram API with Instagram Login向け内部HTTP Adapter。Metaの固定ホスト、画像コンテナ作成、コンテナ状態確認、FINISHED後の公開処理のみ。TokenをURL・本文に挿入せずBearerで送る。接続資格情報を保存しない。公開結果が不明な場合は`UNKNOWN_RESULT`として自動再実行しない。
3. 各独立テスト: 明示承認変更・失効・媒体差し替えの拒否、HTTP先固定、Token漏出防止、公開前の状態確認、結果不明の重複再送抑制。
4. `packages/capability-social/src/index.ts`に新契約の公開exportを追記。

**実際のInstagram API呼出しは行わない**。内部AdapterをNext.js API Route / Cron / Job / UIから一切呼ばず、アカウント接続や投稿権限なしに公開可能な入口を作らない。Provider単体のHTTP契約確認が今回の完了条件。

## 4. Meta公式APIの前提

- 対象: Instagramプロアカウント（ビジネス/クリエイター）。一般個人アカウントは公式投稿APIの対象外。
- 認証: Instagram Login方式（Facebook Login方式とは別のToken/権限モデル）。必要権限例: `instagram_business_basic`、`instagram_business_content_publish`。社外ユーザーへの展開では必要なアクセス権限とMeta App Reviewを確認。
- 画像の初期フロー: `POST /{IG_ID}/media` → `GET /{CONTAINER_ID}?fields=status_code` → `POST /{IG_ID}/media_publish`。作成したContainer IDは公開済みPost IDではない。
- メディア: 公開時にMetaが取得できるHTTPS URLが必要。JPEG等の画像形式、アスペクト比、ファイル容量、Containerの有効期限を公式仕様と実素材で検証する。BUNSHINのPrivate Storageの元URLをそのまま外へ渡さず、権利・MIME・使用目的を検証した短期メディア公開経路を後続で設計する。
- Graph APIのバージョンは実行構成で明示し、認可されたバージョンに固定する。URLパラメータで任意ホストやバージョンを指定させない。単体テストのv26.0は公式APIの本番接続検証結果ではない。
- Reels、カルーセル、ストーリーズは後続の独立作業とする。

参照:

- Meta Instagram API公式Postmanコレクション: https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api
- Instagram content publishing: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing
- Instagram API with Instagram Login: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login

## 5. 目標アーキテクチャ

```text
HASSY / ほかのSOCIAL利用サービス / 将来のMuse依頼
      ↓ 既存認証・Service/Member/Bunshin scope
既存Daily Mission / Content Variant / 生成画像・動画
      ↓ ユーザーが公開先・本文・素材・時刻を確認
Social Publishing Use Case（後続）
      ↓ 正本revision + approval + idempotency
SocialPublishingProviderPort
      ├─ Instagram Direct Adapter（本PRはHTTP下位層のみ）
      └─ Threads/Facebook等（別PR）
      ↓
公式API → 外部Post ID / 状態照合 → 既存PostRecord・分析（後続）
```

認証済みSNS Accountの所有scopeはService/Workspace/Userに紐づけ、投稿用Bunshinとの割当を認可する。OAuth TokenはWeb/DBの暗号化保存Adapterにだけ保持し、Core/Muse/HTMLへ渡さない。OEM分離は一つのMetaアプリと接続済みアカウントの所有移管を同一視せず、譲渡時の再認可を設計する。

## 6. 次のPR（段階的実装）

### P1-B: Instagram公式OAuth 接続

- Meta Developersの本部所有アプリ/Instagram Loginの設定情報を確認。App ID、redirect URI、必要scope、審査状態を実測する。
- OAuth state/PKCE等の公式要件を確認し、利用者本人の認可により接続する。接続Tokenの取得・暗号化・更新・失効、Service/OEM別管理、本人解除を既存秘密情報管理と認可へ接続する。
- ユーザーごとのMeta開発者アプリ/APIキー登録を要求しない。
- 接続の認可と投稿そのものの承認を別にする。初期OFF、ステージングの少数テストのみ。

### P1-C: 投稿Intentの保存・本人承認・公開Job

- 既存DailyMission/MissionContentVariant/Media/Job/PostRecordを再監査して重複モデルを避ける。
- 予約・公開・外部投稿ID・結果不明/失敗の最小正本と必要なmigrationを独立PRで設計。
- 現時点の所有/Feature/接続/コンテンツrevision/素材権利を実行直前に再照合。
- 画像1件、本人が明示承認した1投稿、テストアカウントでの公開のみ検証。公開が`UNKNOWN_RESULT`の場合は外部状態の照会を優先し、再送で二重投稿しない。

### P1-D: カルーセル/リール/実績同期

- 実メディアのMeta対応条件、Container非同期処理、API quotaを確認して段階追加。
- 既存の手動投稿/スクショ分析とAPI実績を区別し、外部投稿IDで同じ成果を重複計上しない。
- 動画/画像生成原価とSNS公式APIの費用/許可上限を各Providerごとに計測し、OEM原価へ反映。

## 7. テスト・Go/No-Go

**本PRの基準**: 型検査、Lint、単体テスト、依存境界、format、BuildのCI成功。ソース・ドキュメント・合成HTTPテストのみでAPI接続成功や本番有効化と表記しない。

後続PRでは、User A/B・Service A/B・Bunshin A/B・別OEM、権限失効、OAuth状態/Token漏出、投稿revision差替え、同時送信、Metaでの公開結果不明、公開前後の状態照合、運用停止・再開・解除を検証する。

判定: Phase 1-Aの非接続コードのレビューはGO。実API接続、本番ユーザーへの投稿許可、Museからの無人公開はNO-GO。Production migration/Secrets/Meta App Review/公開設定は本PRに含めない。
