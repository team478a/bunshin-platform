# サービス法務文書の最新有効版 判定修正報告

日付: 2026-09-30。基準: main `87871c8f`（PR #1019マージ後）。公開法務文書の版選択を独立作業として修正する。本番反映とは区別する。

## 1. 調査した内容

- Service法務文書はtypeごとにversionが一意で、複数のPUBLISHED/有効版をDBが保持できる。現在の表示/参加/利用/通知判定はversion降順の一覧をMapへ代入し、後の旧版が新版を上書きしていた。
- 該当箇所は公開参加View/申請Transaction、既存参加者のrecordUse、Service通知Preferenceの取得/更新前ガードの4経路。非公開参加者の法務ページは既にversion降順findFirstで最新を選ぶため、公開/非公開で不一致があった。
- 正本仕様・設計原則、D-155、Service参加/法務Schema、関連Repositoryと公開入口、既存テストを確認した。本番に複数公開版が存在するか、誤った旧版へ実際に同意した人がいるかは未確認。

## 2. 変更したファイル

- `packages/database/src/service-legal-latest.ts`: 同一Scopeから取得済みの文書をtypeごと最大versionへ選択。
- `packages/database/src/service-participation-{registration,membership}-repository.ts`と`service-notification-preference.ts`: 表示、参加、利用、通知の版選択を統一。
- `packages/database/test/service-legal-latest.test.ts`: 選択・4経路の実行テスト。
- `packages/database/test/database.integration.test.ts`: 隔離DBで複数有効版、未来版、DRAFT、旧/新版同意と利用・通知判定を検証。
- D-156、Roadmap、機能不足監査とこの報告。

## 3. 主要な設計判断

- 各Repositoryで既存のWorkspace/Service、PUBLISHED、effectiveAt<=時刻の条件を維持し、型ごとに数値として最大versionを選ぶ。DBの並び順やMapの後勝ちへ依存しない。利用/通知の射影にはversionを追加する。
- 参加申請は既存Serializable Transaction内で最新IDを照合する。表示後に新版へ変わった古い同意IDは拒否し、所属/同意を作らない。既存の旧同意記録は消さず、最新版へ再同意するまで利用/通知のガードを維持する。
- 文書がない場合、匿名/非公開境界、Service固有の参加設定、定員/紹介/メール/自動登録や通知Preference保存処理は変更しない。非公開参加者ページの降順findFirstとも同じ最大versionになる。

## 4. 実行した検証

- DB Unit関連3ファイル14件成功。空文書、順序逆転、複数type/版、表示/申請/利用/通知の最新版IDと旧版拒否を確認。DBパッケージ全体は171ファイル中169ファイル・649件成功、ローカルCドライブ空き容量不足（ENOSPC）で2ファイルの読み込みに失敗した。コード失敗と区別し、隔離CIで再検証する。
- 隔離実DBで公開Serviceの複数版・未来版・DRAFT、古い画面の申請拒否、新版同意での参加・利用・通知と旧版だけになった際の拒否を確認する。全package検証の結果はPRに記録する。
- DB型検査、変更lint/format、アーキテクチャ境界と否定テスト10件、`git diff --check`成功。

## 5. 未解決事項

- 本番データを閲覧・移行していない。過去に旧版で記録された参加/同意がある場合、新版の再同意が必要になる可能性がある。旧同意を現在版へ自動付け替えない。運用確認・案内は別作業。
- 既存の最新版への再同意UIの状態表示と実端末導線は本作業では再確認していない。法務文書の内容・公開/廃止運用や即時通知は変更しない。
- DB schema/migration、設定/本番データ、実LINE/AI/Provider、デプロイは変更しない。

## 6. 次へ進める条件

- PRの全CI/隔離DB成功・レビュー・マージを確認する。
- 本番反映前に複数公開版/旧版同意の対象件数、最新版への再同意導線と利用/通知への影響を安全な読み取り専用で確認する。データ修正・本人への送信は別途扱う。
