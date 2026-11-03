# ハッシー利用実績集計 Phase 1-A 実装報告

作成日: 2026-11-01

基点: `origin/main` `078c950a3a85d67d67c0d6d4dbac1b4ff74e9a15`

ブランチ: `codex/hassy-usage-aggregator`

## 1. 調査した内容

Phase 0の監査・実装計画を引き継ぎ、既存のMissionActivity、MissionDecision、PostRecord、DailyMissionGeneration、AI Usageの記録形式、Applicationの公開入口と依存境界を確認した。今回は計画のPR-1AとしてApplication層の集計契約・集計関数・取得Use Caseを実装した。

## 2. 変更したファイル

- `packages/application/src/member-usage.ts`: scope、Source/認可Port、集計関数、取得Use Case
- `packages/application/test/member-usage.test.ts`: 合成データによる集計・境界・障害テスト
- `packages/application/src/index.ts`: 公開export追加（共有ファイルの変更）
- `docs/adr/HASSY_USAGE_AGGREGATOR_ADR.md`: 集計条件と所有境界の決定
- 本報告書

## 3. 主要な設計判断

- Workspace / Service / Membership / User / Bunshinの組み合わせで集計する。Bunshin間の履歴を暗黙合算しない。
- 取得Use Caseは認可Portを先に呼び、本人以外の要求を拒否する。Source内のscope不一致・部分取得も拒否する。
- 累計、直近7日、直近30日について生成成功、採用、不採用、投稿自己申告、活動日、最終活動日時、AI原価を返す。
- 期間は指定timezoneの暦日。操作発生日時を使い、未来の記録を除外する。DSTでも24時間固定の窓へ置き換えない。
- Activityの同じMission・同じ採否は1回。Decisionは同じ採否のActivityがない場合に補完する。
- POSTED ActivityとPostRecordは同じMissionで1回。SNS公開確認とは区別する。
- 成功した生成のうちUSER起動だけを活動日へ含める。UNKNOWNの旧記録は生成回数と不明件数に残す。
- 画面閲覧、ログイン、通知、休息、Feedbackだけでは活動日を増やさない。
- 原価はBigIntで加算し、出力はJSON化可能な10進文字列。NULL原価はunknown件数で保持する。
- 集計結果・行動イベントの新規永続化、migration、外部AI呼び出しは追加しない。

## 4. 実行した検証

Node `24.22.1`、pnpm `10.10.0`で実行。

- 新規合成データテスト: 23件成功
- Application全体: 147ファイル、1,052件成功
- Application typecheck / lint / build: 成功
- リポジトリ全体の `pnpm typecheck`: ローカル成功
- 依存境界検査とその否定テスト10件: 成功
- リポジトリ全体のformat:check、変更ファイルのPrettier、git diff --check: 成功
- 実装コミット `f56c48d9` の [CI run 41310112296](https://github.com/team478a/bunshin-platform/actions/runs/41310112296): `verify` / `database` ともに成功
- CIでは全体のformat / typecheck / lint / test、既存UIテスト、build、disposable PostgreSQLのmigration / readiness / integration / release / TLSテストが成功

この結果は上記実装コミットの証跡であり、本報告追記後のHEADの状態は [PR #1414のチェック](https://github.com/team478a/bunshin-platform/pull/1414/checks) を参照する。本番反映の証拠とはしない。

## 5. 未解決事項

- このPRはDB AdapterとHTTP/UIへ未接続。実会員のDB集計・画面表示はまだ提供していない。
- 認可PortとSource Repositoryは後続AdapterでACTIVE Membership、同意、Service配下のBunshin所有権を実DB上で検証する必要がある。
- 旧生成記録のUSER/SCHEDULER provenance不足は残る。後続の既存記録へのprovenance追加まではUNKNOWNとして扱う。
- 登録/初期設定日、SNS別内訳、画像/動画、紹介、自動化設定・提案結果は後続の個別source接続で追加する。
- 本番デプロイ、DB更新、Feature有効化は実施していない。

## 6. 次へ進める条件

- PRレビューとCIの品質Gateを通過すること。
- 次PRではこの契約へ既存DBの読み取りAdapterと認可Adapterを接続し、別OEM/User/Bunshinの実DB否定テストを追加する。
- 生成元provenance追加は別migration PRとし、旧行を推測backfillしない。
