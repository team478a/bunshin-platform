# マナベル個別LINEメニュー: Provider境界

2026-10-13時点の実装メモ。これは機能全体の完了報告ではない。

## 実装した範囲

- `publishDefaultGroupRichMenu`は従来どおり標準メニューを全体へ設定する。既存挙動は変更していない。
- `linkGroupRichMenuToUser`は、検証済みのLINEユーザーIDへ既存Rich Menuを個別リンクする。全体向けendpointとは別の関数とし、URL path componentをencodeする。
- `unlinkGroupRichMenuFromUser`は、指定したユーザーの個別上書きだけを解除し、標準メニューへの復帰を可能にする。
- Providerエラーは従来のLINEエラー分類へ変換し、リンク失敗を成功として扱わない。

## まだ実装していない範囲

- 初期設定/学習目標・課題の状態から個人向けラベルや内容を作るAI処理と既存原価Admissionへの接続。
- メニュー画像の個別レンダリング、生成結果の保存、version管理。
- 本人認証・有効Enrollment・GroupLineConnection・友だち状態を再確認するApplication/API経路。
- 受講者画面の「個別メニューを設定」導線と、設定結果・標準メニューへ戻す導線。
- LINE Provider上のメニューID再利用、退会・失効時の削除、上限監視を含むRepository/Job。
- Webhookによる再訪計測、実端末での表示・遷移確認。

このため、現在の状態は「個人リンク用Provider primitiveの実装」であり、受講者が利用できる個別AIリッチメニューではない。本番で機能利用可能とは判定しない。

## 安全性・上限

- 個別リンクは明示的に選択された1人にだけ適用し、チャンネル全体の標準メニューを更新しない。
- 対象本人と受講資格の認可はProvider関数の呼出し元で必須。今の関数単体は認可を実行しないため、HTTP/APIから直接未認可で呼び出さない。
- LINEは公式アカウントあたり最大1,000件のRich Menuを作成可能とし、作成・削除にはendpoint rate limitがある。個人ごとに毎回新規作成する設計を採らず、ID再利用と利用者終了時の解放方針を次の実装で確定する。
- 参考: [LINE Developers Messaging APIリファレンス](https://developers.line.biz/ja/reference/messaging-api/nojs/)、[ユーザーごとのリッチメニュー](https://developers.line.biz/ja/docs/messaging-api/use-per-user-rich-menus/)

## 検証

- `apps/web/test/group-rich-menu-provider.test.ts`: 6件成功。既存標準メニュー3件を含む。
- `eslint`を変更2ファイルに実行し成功。
- ProviderはモックFetchだけを使用。実AI、実LINE API、実ユーザー、本番環境への接続・変更は行っていない。

## 次の実装単位

1. 個人メニュー定義・画像を、確認済みの現在課題を元に生成する。追加AI呼出しが必要なら既存Admission/原価枠を必須とする。
2. GroupLineConnectionとEnrollmentを複合scopeで照合するAPIを作り、同一利用者の既存メニューID再利用・更新とリンクを冪等化する。
3. 初期設定後の受講者UIに導線を加え、LINE未接続・未友だち・資格失効・AI失敗では標準メニューを維持する。
4. 統合テストで別User/Service拒否、同一利用者の再実行、標準への復帰、失敗時の状態維持を確認する。
