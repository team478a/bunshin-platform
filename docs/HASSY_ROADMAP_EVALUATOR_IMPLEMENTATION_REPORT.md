# 成長ロードマップ Phase 1-B1 判定コア実装報告

作成日: 2026-11-02

基点: origin/main `7284811c7de8afb079c1d1069f69f95c863c0626`（PR #1421マージ後）

ブランチ: `codex/hassy-roadmap-evaluator`

## 1. 調査した内容

AGENTS、仕様正本、Architecture Principles、Roadmap、Decision Log、利用実績集計・生成起動元・本人向けAPIの最新ADRと実装報告、Applicationの公開入口・関連テストを確認した。既存のGroupFeatureEntitlement、紹介成果・紹介特典の責務と、固定90日ロードマップの存在も照合した。

利用実績だけでは初期設定、ガイド閲覧、外部連携、実際の改善反映を証明できない。権限付与や有効紹介判定を再実装せず、既存基盤の結果をscope付きContextとして受け取る契約を追加した。

## 2. 変更したファイル

- `packages/application/src/member-roadmap.ts`: 型付き定義・既定5段階、進捗評価、取得Use Case
- `packages/application/test/member-roadmap.test.ts`: 新規50件の合成データによるテスト
- `packages/application/src/index.ts`: exportの追加のみ（共有ファイルの変更）
- `docs/adr/HASSY_ROADMAP_EVALUATOR_ADR.md`: 実装前の主要判断と対象範囲
- 本報告書

DB/schema/migration、HTTP/API、既存画面、依存、環境変数、Feature Definition / Flag、Providerには変更がない。

## 3. 主要な設計判断

[ADR](adr/HASSY_ROADMAP_EVALUATOR_ADR.md)を参照。

### 証拠と進捗

初期5段階・15項目をコピーを返すfactoryで定義する。初回生成は成功1件、初回判断は採用または不採用1件、継続利用は累計3活動日を初期値とする。他の事実は明示的なtrue / false / nullで受け取り、欠測はUNKNOWNとして返す。

7日・30日の窓移動で累計の達成を取り消さない。SchedulerやUNKNOWN起動の生成は生成実績には含むが、活動日数には加えない。初期設定やガイド利用、SNS公開等を生成回数・投稿自己申告・Mission Schedulerから推測しない。

取得Use Caseは既存GetMemberUsageSummaryで認可と集計を完了してからContextを取得する。Context Repositoryも現在の同意・所有権・利用権を再検証し、asOf以前の本人の証拠を返す契約とした。評価時に5つのscope ID、日時、timezone、version、件数、定義の妥当性を検証する。

### 利用可否と優先表示

達成状態と利用可否は別々に返す。表示用状態はCOMPLETED / AVAILABLE / PREPARINGで、詳細理由、進捗の実測値（未確認はnull）、ステージごとの達成数・未確認数を保持する。

利用可否は既存EffectiveGroupFeatureAccessに加え、実装状態・停止スイッチ・予算の投影を用いる。達成済み項目の利用権が失効しても、過去の達成は取り消さない。ロードマップから利用権を付与・消費しない。

ステージ順・項目順で「未達成が確認でき、利用でき、操作上の前提も確認済み」の項目を1件だけ優先する。readyForRecommendation=falseなら、権限上利用可能でも優先しない。前ステージ未達成を機能lockへ転用せず、後段階の利用可能な項目も選べる。

### 紹介と版

基本15項目を削除・別段階へ移動したり、紹介条件へ置き換えたりする定義は拒否する。紹介はSTEP 5へ追加できる任意のREFERRAL_MILESTONEだけに使える。有効紹介数が増えても、その数から機能開放を生成しない。

既定のhassy-roadmap-v1の内容変更は拒否する。名称・閾値・段階内の順序を変える場合は別versionを指定し、Service固有定義はWorkspace / Serviceへ束縛する。Service版の永続的な不変性や変更監査は、保存・管理機能を接続する段階で実装する。

## 4. 実行した検証

Node 24.22.1、pnpm 10.10.0。

- Application全テスト: 148ファイル1,102件成功（新規50件を含む）
- Application全体のTypeScript検査: 成功
- 新規TSファイルのESLint、Prettier、依存境界検査、git diff --check: 成功

主な新規検証は、進捗・優先順、期間移動、未確認の保持、権限・予算・停止・準備状況、紹介条件の分離、版変更、全scopeの否定テスト、非同期入力変更、既存認可Use Caseとの合成。不正な条件の拒否や、継承された事実・権限値を使わないことも検証した。

型チェックで配列検証後のcallback型の不足、lintで型専用importを検出し、明示的な型へ修正した。型・lint設定は緩和していない。

全体format / typecheck / lint / test / learning UI / buildと既存DB統合・readiness・release・TLSはPRのCI verify / databaseを最終ゲートとする。最終コミットとCI結果はPR本文へ記録する。

## 5. 未解決事項

- ContextのDB Adapter、定義の保存・管理、HTTP/API、ロードマップUIは未接続。
- 定義の保存先は未確定。migrationを作るタスクで既存設定との重複を再監査して決定する。
- 既存の固定90日画面は変更していない。成長ロードマップの接続時にroute / 導線を整理する。
- 有効紹介数・既存権限・予算・操作上の前提を本物のSourceから解決する接続は次の作業単位。取得できない事実を0やfalseへ補完しない。
- 自動化提案の履歴・見送り抑制・効果測定・外部AIガイド / 接続は今回の対象外。
- 本番DB接続、デプロイ、Feature有効化、外部操作は行っていない。

## 6. 次へ進める条件

- 本PRのレビューとCI verify / databaseの成功、マージ。
- 次は既存の正本からContextを読むAdapterを接続し、現時点の所有権・同意・権限・予算と、asOf以前の達成証拠を分離して検証する。
- 未取得を未達成扱いしないこと、紹介による基本機能lockをしないことをHTTP / UIでも維持する。
