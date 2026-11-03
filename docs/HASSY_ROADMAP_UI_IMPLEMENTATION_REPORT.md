# 成長ロードマップ Phase 1-B4 会員ホームUI実装報告

作成日: 2026-11-02

基点: origin/main `021495fa`（PR #1424マージ後）

ブランチ: `codex/hassy-roadmap-ui`

## 1. 調査した内容

AGENTS、仕様正本、Architecture Principles、Roadmap、Decision Log、利用実績 / ロードマップAPI・Core・Context Adapterの最新文書、公開入口と関連テストを確認した。既存の投稿パートナーホーム、90日計画、折りたたみメニュー、本人所有判定、スマホ用CSSと合成ブラウザharnessを調査した。

既存の `/s/[serviceSlug]/roadmap` は90日計画であり、Bunshin単位の成長ロードマップとは異なる。新規page・認証return pathを増やさず、現在の本人ホームの補助メニューから確認する方式にした。

## 2. 変更したファイル

- `apps/web/app/s/[serviceSlug]/bunshins/[bunshinId]/service-bunshin-detail-view.tsx`: 本人のSOCIAL Bunshinに折りたたみメニューを追加
- `apps/web/app/ui/member-growth-roadmap/card.tsx`: 明示読み込み、取得中・エラー・次候補・活動・進捗・紹介準備状況
- `apps/web/app/ui/member-growth-roadmap/data.ts`: 公開API応答のvalidationと順次GET
- `apps/web/app/ui/member-growth-roadmap/roadmap.css`: このcomponentだけに限定したスタイル
- `scripts/test/learning-ui/growth-fixture.ts`: 合成の公開APIデータ
- `scripts/test/learning-ui/growth-harness.tsx`: 実componentのローカルブラウザ表示・切替fixture
- `scripts/test/learning-ui/member-growth.e2e.ts`: 新規スマホUIテスト
- `scripts/test/learning-ui/main.tsx`: harness選択の追加（既存選択肢を維持）
- `scripts/test/learning-ui/e2e.config.ts`: test一覧へ追加
- `docs/adr/HASSY_ROADMAP_UI_ADR.md`: 実装前の判断
- 本報告書

共有ファイルの変更: 共用ブラウザharnessのmainとtest一覧へ追加した。package公開index、Decision Log、Roadmap、環境変数、cronsの変更はない。Application / Database / API、schema / migration、依存・Feature Flag・本番設定も変更していない。

## 3. 主要な設計判断

[ADR](adr/HASSY_ROADMAP_UI_ADR.md)を参照。

### 今日の行動を優先する

「今日やること」は既存の表示を維持し、その下の「その他のメニュー」に本人だけが開ける成長ロードマップを追加した。SOCIAL Capabilityを持つ本人Bunshinに限定し、現在停止中でも過去の進捗を確認できる。認可はAPI / Adapterでも再検証する。

初期表示やメニュー展開だけでは集計しない。「成長ロードマップを見る」ボタンで既存member-roadmap、member-usageを順次GETする。次のおすすめ1件を活動数より先に表示する。初版の操作リンクはFIRST_DECISIONから同じホームの `#today-post` へ戻るものだけ。勝手なPOST・機能開放・外部接続はない。

### 表示する情報

- 5段階と各項目の達成済み / 利用可能 / 準備中、未確認件数、全体progress、現在の段階
- 直近7日・30日の活動日数、投稿案の生成・採用・不採用、本人の投稿完了報告
- 起動元が不明な旧生成がある場合の件数と、旧生成だけでは活動日と判定しない案内
- 進捗・活動それぞれの確認日時と日付基準timezone
- 有効紹介人数・ロードマップ特典は「集計準備中」。0件や特典獲得済みへ補完しない

UNKNOWNは未達成へ変換しない。完成済み実績と現在の利用可否を分け、候補なしも正常表示する。ログインだけで活動日とせず、投稿完了報告をSNS公開確認として扱わない。紹介しなくても基本SNS機能を使える旨を表示する。

### 通信と復旧

回数・同時枠は既存APIのguardを利用し、並列要求・自動poll・自動retryを行わない。手動更新時は先に古い表示を消す。片方だけ成功しても一式が成功するまで表示しない。401 / 403 / 404、429、その他の障害を固定文言で案内し、生のエラー本文を出さない。不正なversion・構造・件数・timezoneや、利用不能な次候補も成功扱いしない。

Bunshin / Service切替ではendpointをkeyにした内部componentを作り直し、unmountでAbortControllerを中止する。遅い旧応答を新しい表示へ反映しない。localStorage等に保存しない。API間の同一DB snapshotは保証せず、時点を明記する。権限・前提の実行時再確認は既存Use Caseに残す。

### スマホとアクセシビリティ

白背景、Noto Sans JPを先頭とするfont stack、太い見出しと文字、48pxのボタン / リンク、色だけに頼らない状態ラベルを使用する。新しい外部font取得は追加していない。progressに読み上げ名、読み込みにstatus / aria-busy、エラーにalert、操作にfocus-visibleを付けた。CSSはmember-growth配下に限定する。

## 4. 実行した検証

Node 24.22.1 / pnpm 10.10.0 / Chromium、390 × 844。

- 新規UIテスト初回10件成功。読み込み前の非通信・順序 / GET限定・二重取得防止・各HTTPエラー・不正version・失敗時の古い表示除去・候補なし・Bunshin切替の遅延応答を確認
- 横スクロールなし、操作領域44px以上、候補リンク1件を確認
- 活動、段階、紹介欄の3枚のスクリーンショットを目視確認。読める太さ・折返し・状態ラベルの崩れなし
- 旧生成の案内を加えた11件と既存39件を含むUI全体は最終検証に含める
- 既存HTTP / guard: 3ファイル68件成功
- Prisma Client生成、UI harness TypeScript、変更TS lint、依存境界、git diff --check: 成功

ブラウザ検証は本番component + 合成APIのharnessであり、本人認証からproduction DBまでの通し確認とは区別する。APIの所有境界とSQL検証は既存テスト / CIで再検証する。テスト内のbrowser.evaluateがvoidを返していた型不整合はnullへ直し、検証設定の緩和はしていない。

最終コミットの全体format / typecheck / lint / test / UI / build、DB統合 / readiness / native release / TLSはCI verify / databaseを品質ゲートにする。最終の結果とコミットをPR本文に記録する。

## 5. 未解決事項

- 有効紹介の資格判定・特典連携、定義保存・管理、提案への回答 / 履歴 / 抑制 / 効果測定は未実装
- AI予算・操作前提や達成証拠が未接続の機能は準備中。SOCIAL権限を自動付与しない
- 初版の次候補リンクは投稿案の採否だけ。他の機能の操作導線は前提と提供画面を確認してから追加する
- 利用実績Source上限と分散Rate Limit、本番での負荷・ユーザー効果は未確認。1回の手動取得は共有guardの2要求を使う
- 本番反映・DB接続・Flag変更・AI / SNS外部操作は実施していない

## 6. 次へ進める条件

- 本PRのレビュー、最終コミットのCI verify / database成功、マージ
- 次は既存紹介基盤で、有効紹介を達成条件へ使うための判定と接続を小さなPRで進める
- 生成等をおすすめへ含める前に、既存予算と操作前提の読み取り照合を別途接続する
