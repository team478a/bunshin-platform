# B3 資格保存前の状態遷移・DB設計

日付: 2026-11-02  
基点: main `0e0fb413`（#1431マージ後）

## 1. 調査

AGENTS、正本仕様、Architecture Principles、Roadmap、Decision Log、
紹介資格の責務分離・保存先監査・本人証拠Reader、既存ServiceReferral、
Creditルール版、管理者認可、公開exportsを確認した。
本人専用Readerは管理者が他会員を操作する認可Portではなく、
reviewも未保存のため、保存時に推測でCLEARへ変換しない。

## 2. 変更

- `packages/application/src/service-referral-confirmation.ts`: 審査・確定・取消の純粋な共通遷移。
- `packages/application/test/service-referral-confirmation.test.ts`: 32件。
- `docs/adr/SERVICE_REFERRAL_CONFIRMATION_STORAGE_ADR.md`: 保存場所・scope・版の不変性・認可・排他・再試行、次DB PRのmigration範囲とSQL Gate。
- 本書。

## 3. 判断

UNASSESSED / CONFIRMED / REVOKEDと、UNKNOWN / REQUIRED / CLEARの審査を区別する。
共通処理はWorkspace / Service / 紹介ID・revision・Policy版と評価結果を扱い、
Bunshin、投稿、ハッシーや特典内容を必須化しない。
SNSの証拠解釈はSOCIAL、ハッシーの閾値・提供方針はService Policyの境界を維持する。

CLEAR審査と、同scope / referral / Policy版 / revision / 基準日時で評価された
QUALIFIEDだけを確定可能にする。古い評価・停止・未知・範囲不一致は拒否。
確定日時と版は固定し、取消後に再確定しない。審査変更で既存確定を暗黙取消しない。
余分な情報を遷移結果へ引き継がず、入力も変更しない。

この関数は操作者の管理権限を検証せず、DBも読み書きしない。
保存・監査・並行処理・永続的な冪等性を保証するものではない。
評価結果は将来のサーバー側実行境界から渡す内部契約であり、
HTTPでクライアントのQUALIFIEDやactive=trueを信用する設計ではない。

既存ServiceReferralへ資格属性を追加し、資格Policy版と操作監査だけを新たに保存する案にした。
新しい紹介関係・報酬・口座・台帳・登録イベントを重複作成しない。
旧成果のstatus、特典・確定済みCredit・原価・Entitlementは書き換えない。
具体的な保存・migration・同時実行SQLの実装は次PRに分ける。

## 4. 検証

新規32件は審査不明・調査待ち、未達・不明な評価、停止、他OEM / 紹介 / 版 /
revision / 時刻の不一致、確定版固定、明示取消、復活拒否、不正入力、未知情報の除去を含む。
型検査・変更箇所lint、format、architecture checkとApplication全体を実行する。
全体のformat / typecheck / lint / test / UI / SQL / buildは最新HEAD CI verify / databaseで確認し、PR本文に記録する。
今回SQL実装はなく、既存SQL成功を新しい永続化の検証とは扱わない。

## 5. 共有ファイルの変更

`packages/application/src/index.ts`へexportを末尾1行追加のみ。
schema / migration、API / UI / Job、環境変数・Flag・依存に変更なし。

## 6. 次の条件

次はADRに限定したDB実装を行う。資格Policy版・審査・確定・監査の保存と
認可・CAS・同command再試行・payload衝突のSQL Gateを先に通す。
管理者用の評価証拠取得が整うまで、確定操作を外部へ公開しない。
本人Readerのactorを被紹介者へ偽装して流用しない。
最新HEADのCI verify / database成功とレビュー・マージが次作業の条件。
資格の永続保存・紹介人数への接続・特典付与・本番反映は未実施。
