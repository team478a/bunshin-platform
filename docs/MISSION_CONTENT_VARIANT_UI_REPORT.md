# Daily Mission別案 API・画面 実装報告

## 1. 調査した内容

- 個人画面とService参加者画面のDaily Mission取得、表示、コピー、活動記録の経路を確認した。
- 既存の派生案Repositoryと生成サービスをAPIへ接続する際のWorkspace、Service、User、Bunshin境界を確認した。
- Service画面のコピー処理が、専用URLの現在の承認状態を再確認せずクリップボードへ書き込める状態だったため、同じ作業範囲で是正した。

## 2. 変更したファイル

- 個人・Service向けの派生案一覧、生成、選択APIを追加した。
- 個人・ServiceのDaily Mission画面へ「別の案を見る」「内容を直す」「この案を使う」を追加した。
- Daily Mission詳細取得時に選択済み派生案を読み込み、表示とコピーへ反映した。
- Service向けコピー認可APIを追加し、クリップボード書き込み前に専用URLと承認状態を再検証するよう変更した。
- 境界、画面動作、選択済み派生案の解決を自動テストへ追加した。

## 3. 主要な設計判断

- 通常のDaily Mission自動配信を変更せず、利用者の操作は配信済みMissionの派生案作成に限定した。
- 派生案は1 Missionにつき初期上限1件とし、元Mission本文を上書きしない。
- 最新の選択履歴を表示・コピー対象として解決し、原案と派生案の監査可能性を維持した。
- Serviceの権限範囲はサーバー側で導出し、修正指示だけを利用者入力として受け付ける。
- 専用URLを含むService投稿案は、コピー直前にも現在の利用可否を検証する。

## 4. 実行した検証

- TypeScript型検査
- ESLintとPrettier
- Daily Mission別案、Service境界、生成サービスの対象テスト
- リポジトリ全体のテストとProduction build

## 5. 未解決事項

- 本番Databaseへの派生案Migration適用と実端末確認はProduction Gateで実施する。
- 追加生成を行う30 WP交換は未接続のため、現在は初期上限の1件だけを生成できる。

## 6. 次Phaseへ進める条件

- 本番Migration後に個人・Serviceの両画面で生成、修正、選択、コピーを確認する。
- AI失敗時に元Missionが維持され、専用URL変更時にコピーが拒否されることを確認する。
