# Muse Connector 既存基盤監査・差分設計

更新日: 2026-11-13
状態: 調査・設計のみ。Muse接続、OAuthクライアント登録、設定変更、migration、本番反映は未実施。

## 1. 結論

既存基盤には、外部サービスが投稿パートナー本人の限定された利用実績を読むための、本人同意・期限付きGrant・OAuth資格検証・読取APIがある。ただし現在の接続先カタログは空で、外部読取機能は停止状態である。Museの認証方式、Connector仕様、callback URI、必要データ、削除・失効仕様はリポジトリ内に根拠がなく、Muse対応済みとは判断できない。

現時点では実装しない。まずMuseが「本PlatformのOAuthクライアントとして限定APIを読む」のか、「本PlatformからMuse APIへ接続する」のか、「コピー／共有で受け取るだけ」なのかを公式仕様と独立検証環境で確定する必要がある。この3方式は認証主体とデータ移動方向が異なり、同じConnectorとして扱えない。

投稿案から制作指示を本人がコピー／共有するPhase 4の手動連携は、Muse Connectorなしで成立する。Connectorを先行条件にしない。

## 2. 監査した既存機能

### 本人によるGrant管理

- `/s/{serviceSlug}/bunshins/{bunshinId}/connections` は、ログイン中のUserが同じWorkspace・Serviceに参加し、対象投稿パートナーのownerであることを確認する。
- `ExternalReadGrant` は `workspaceId / serviceId(groupId) / groupMembershipId / userId / bunshinId` を同時に保持し、別企業・別Service・別参加者・別投稿パートナーへの横断を防ぐ。
- 本人は接続先、許可時間（5分から24時間）、同意versionを明示して発行し、後から解除できる。発行・資格結合・解除は既存の監査ログへ記録される。
- Grant発行時と各読取時に、投稿パートナーのACTIVE状態、SOCIAL Capability、`EXTERNAL.READ` と `SOCIAL` のFeature利用可否、本人・参加状態を再確認する。
- 現在のoperationは `member-usage:read` だけである。投稿、設定変更、Memory、投稿本文、企業情報、AI原価の読取権限はない。

### OAuthと資格の境界

- OAuth同意画面はSupabase OAuth Serverのauthorization detailsを利用し、登録済みclient ID、完全一致のcallback URI、許可済みscopeだけを受け付ける。
- 外部APIはCookieや通常のUser sessionを使わず、Bearer資格の署名、issuer、audience、role、subject、session、client ID、有効期限を検証する。
- 外部clientはBearer資格とGrantのconnection IDを一度bindする。以後も同じ資格binding、client、environment、本人Grantの有効性を再確認する。
- `/api/external/connections/{connectionId}/usage` はpath以外の対象指定やfilterを受け付けない。対象scopeは結合済みGrantからだけ解決する。
- 応答は直近7日・30日の生成、採用、不採用、本人申告の投稿完了、活動日数に限定される。投稿完了は `SELF_REPORTED_NOT_VERIFIED` と明示され、未計測値を外部公開実績へ読み替えない。

### 現在停止している箇所

- `externalReadClientCatalog()` は空配列であり、コメントでもMuse互換性未確認とされている。
- カタログが空のとき、Grantの新規発行、OAuth同意、Bearer資格サービス、bind、usage APIは利用できない。
- `staging` は既存実装上、未対応環境として明示的に停止する。名称だけを流用して検証環境とみなせない。
- 接続画面のGrant発行は「読取許可」の保存であり、外部サービスとの接続完了ではない。connection IDを安全に外部clientへ渡してbindする一連のUXは、特定client向けには未実装である。

## 3. Muse仕様が確定するまで決められない事項

次をMuseの公式資料または提供元の回答で確認する。推測値でclient登録やコードを作らない。

1. MuseがOAuth 2.x / OIDCの外部clientになれるか。Authorization Code + PKCE、issuer discovery、必須scope、token audienceとclient claimの要件。
2. 正確なclient ID、環境別callback URI、HTTPS要件、state/PKCE処理、token保存・更新・失効方法。
3. Museが外部APIをpullするのか、PlatformからMuseへpushするのか、共有シート／deep link／手動pasteだけか。
4. 必要な情報が既存の匿名化された利用実績だけか。投稿案、制作指示、公式商品情報、許可素材URL等を必要とするか。
5. connection IDを受け渡してbindする公式手順があるか。任意URLやpromptへ秘密値を埋め込む必要がないか。
6. 取得データの保存場所、保持期間、再利用、学習利用、第三者提供、削除依頼、解除後の扱い。
7. スマートフォンとLINE内ブラウザでのOAuth開始・復帰がサポートされるか。
8. rate limit、最大応答、timeout、再試行、障害時の契約。実Provider呼出しに費用が発生するか。

MuseがPlatformへOAuth資格を発行し、PlatformがMuse APIを呼ぶ方式なら、既存 `ExternalReadGrant` は方向が逆であり、そのまま再利用できない。Provider Adapter、秘密情報保管、scope、失効、本人同意を別途設計する必要があるため、仕様確認と承認までNo-Goとする。

## 4. 条件付き差分設計

以下は、Museが標準OAuth clientとして既存 `member-usage:read` APIだけを読むと公式に確認できた場合に限る。

1. 独立した非本番Auth環境にMuse clientを登録し、発行されたclient IDと完全一致callback URIをserver-side catalogへ追加する。client secretをリポジトリへ置かない。
2. 対象Serviceだけで `EXTERNAL.READ` を有効化し、1企業・5人・1Campaignの検証参加者に限定する。別Serviceや個人Workspaceへ暗黙展開しない。
3. 既存の二段階同意を維持する。
   - OAuth同意: Museがログイン中本人を識別するためのscope。
   - ExternalReadGrant: 特定投稿パートナーの利用実績を、特定期限・特定operationで読む本人同意。
4. connection IDの受渡しとbind完了を示すclient固有の導線を設計する。URL query、ログ、画面にBearer tokenを露出しない。Grant保存を接続完了と表示しない。
5. 既存usage APIとDTOを変更せず疎通確認する。まず1人、次に同一Serviceの5人、最後に別Service拒否を確認する。
6. 解除、期限切れ、Capability停止、Feature停止、退会、投稿パートナー停止の各時点で、新規読取が即時拒否されることを確認する。

この条件なら、新規DBテーブルやmigrationは現時点の差分には含めない。Muse固有の投稿案・制作指示・素材データをAPI公開する要求が判明した場合は、既存operationと同意文面の範囲外である。新しいoperation、DTO、認可、同意version、データ最小化を別PRで設計し、DB変更の要否を報告して承認を待つ。既存Grantへ意味を追加して流用しない。

## 5. セキュリティ・プライバシーの受入条件

- User Aの資格またはGrantでUser B、別Workspace、別Service、別投稿パートナーを読めない。
- Muse clientの資格で別client向けGrantをbind／readできない。
- connection IDだけ、Cookieだけ、期限切れtoken、別session tokenでは読めない。
- Grant解除、期限切れ、参加停止、Capability停止、Feature停止後は読めない。
- 応答に投稿本文、Memory、企業情報、素材、個人メール、AI原価、内部IDの不要な値が混ざらない。
- 本人申告の投稿完了を外部公開確認済みと表示しない。取得不能値を0として返さない。
- token、authorization code、client secret、Grant scope、応答本文を通常ログへ記録しない。
- 同意画面に取得項目、利用目的、期限、解除方法、取得済みデータの削除先を表示する。

## 6. 独立検証環境での手順

1. Muse公式仕様、検証用client、callback URI、検証用アカウント、専用LINE検証チャネルについて承認を得る。
2. 本番と分離したAuth・DB・Serviceに、企業1、投稿パートナー5人、Campaign 1件を用意する。
3. catalogとFeatureを対象環境・対象Serviceだけで有効化する。
4. スマホ幅とLINE内ブラウザ相当で、OAuth同意、Grant発行、bind、usage読取、解除まで通す。
5. 別企業・別Service・別参加者・別投稿パートナー・別clientのnegative testを自動化する。
6. Muse側に残るデータの確認と削除を実施し、証跡には秘密情報や本文を残さない。
7. 障害、再試行、期限切れ、解除直後を確認する。合格前に本番client登録や本番Feature有効化をしない。

## 7. Go / No-Go

### 現在の判断

- **Go**: PR-Cのコピー／スマホ共有による手動制作、既存コードを使ったローカル自動テスト、公式仕様の入手、独立検証環境の準備。
- **No-Go**: Muse clientの登録、catalog有効化、実機接続、実Provider呼出し、本番DB・本番設定変更、投稿案や個人情報を含むAPI追加。

### 接続検証へ進む条件

- Museの公式な認証・Connector・データ保持仕様が揃う。
- 非本番環境、検証用Muse client、専用LINE検証チャネル、対象Serviceと5人の検証参加者が指定される。
- 読取データが既存 `member-usage:read` の範囲内か判定され、範囲外なら別設計の承認を得る。
- 実機接続と費用発生の承認を得る。

## 8. 今回変更していないもの

本監査は文書だけであり、機能完成ではない。コード、DB schema、migration、OAuth client、Feature設定、LINE、本番データ、外部サービス、本番公開を変更していない。
