# マナベルスタイル PR-3 検証済み操作の画像付き教材

[設計判断](../adr/MANABERU_BROWSER_MATERIALS_PR3.md)

個別学習で画像付き操作教材を開き、「マニュアルの形式を選ぶ（PDF・印刷）」から使う場面に合う形式を選びます。

- 詳しい手順書（初期表示）では、各手順の説明と操作前後・拡大の画像を確認します。
- 操作早見表では、作業中に参照する手順と完了の確認をテキストでまとめます。
- 画面比較では、操作前後の実画面を手順ごとに並べます。
- 実践ワークシートでは、操作のチェックリスト、実践課題、振り返りの記入欄を使います。

「印刷・PDFとして保存」を押し、ブラウザの印刷画面で保存先に PDF を選びます。どの形式も同じ教材版、手順番号、利用端末を参照します。形式の切り替えに AI 呼び出しや教材の再生成は発生しません。

- `material` ジョブは同じレシピ・教材版の既存教材を再利用する。新規生成では、DB が参照する検証証拠とレシピの手順・日時・端末を照合する。証拠ファイルが欠けている場合は Playwright で再実行して成功を確認する。
- 手順 ID ごとに命令から日本語の説明を作り、操作前後の画像を付ける。実画面の操作対象を観測できた場合は枠と拡大画像を生成する。PR-2 で保存した座標のない証拠も前後画像として再利用できる。
- 既存アプリと同じ Sharp 0.35.4（Apache-2.0／libvips）を使う。対象を中心にクロップし、端で切り取る範囲を画面に戻す考え方を Mimik Desktop v1.2.0（MIT、Copyright 2026 Westpoint）から取り入れた。 [Sharp の合成 API](https://sharp.pixelplumbing.com/api-composite/) · [Mimik の座標処理](https://raw.githubusercontent.com/westpoint-io/mimik/desktop-v1.2.0/packages/core/src/screenshot/geometry.ts)
- PostgreSQL へ教材と WebP を保存する。教材保存と既存ジョブの完了は同じトランザクションで確定する。新規テーブルの RLS と実データ取得時の Workspace・依頼者・有効な所属を適用する。

## 開発環境で使う

既存の使い捨て DB に migration を適用し、ブラウザワーカーに `BROWSER_FIXTURE_DATABASE_URL` を設定する。

```sh
pnpm --filter @bunshin/browser-worker start material "$WORKSPACE_ID" "$ACTOR_ID" "$RECIPE_ID" "$REQUEST_ID"
pnpm --filter @bunshin/browser-worker start once
```

開発環境の Web で対象 Workspace の依頼者としてログインし、`/organizations/{workspaceId}/browser-materials` を開く。教材名で検索し、前後画像と拡大画像を手順ごとに表示できる。最後に実践課題と理解度確認を表示する。

対象は合成画面。説明の作成と画像加工は AI を呼ばない。実受講者との接続、AI 相談、LINE 配信、実アカウントを使った画像のマスキングと共通教材共有は後続。本番の migration 適用・機能有効化および VPS 計測は未実施。

## 開発検証

実 Chromium と使い捨て PostgreSQL で、スマートフォン向け 3 手順・WebP 9 枚を作成。元の実行を指す教材を保存し、別の依頼で同じ ID を返すことを確認した。画像ディレクトリを切り替えた PC 向けのケースでは、再検証したジョブが新しい証拠参照になった。同じ Workspace の別利用者からの生成を拒否した。Web のテストで所有者と Workspace の検索・画像取得条件、非公開キャッシュ、選んだ手順と実践課題の表示を確認した。保存結果から書き出したスマートフォン向けサンプルは、幅 390 px で横スクロールなし、画像 9 枚を読み込めた。AI 呼び出し 0 回、AI 原価 0 円。
