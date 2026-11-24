# マナベルスタイル PR-6 Mimik 操作記録を取り込む

[設計判断](../adr/MANABERU_MIMIK_IMPORT_PR6.md)

1. 開発用 DB に migration を適用して Web を `APP_ENV=development` で起動する。
2. Mimik Desktop v1.2.0 で撮影した画像と説明を確認し、必要箇所をぼかす。入力値を除去し、URL をパスかオリジンに限定して `.mimik` を書き出す。
3. 自分の Workspace の `/organizations/{workspaceId}/browser-materials` を開く。「Mimik の操作記録を取り込む」でファイルと記録端末を選択する。
4. 取り込んだ操作記録は、手順の説明、撮影した画像、実践課題として開ける。「人の操作記録・未検証」と取り込み日を表示する。

バンドル v1 の manifest と WebP を対象とする。30手順、8 MiB 以下で、少なくとも1枚の画像が必要。見出しなど画像なしの手順も保存する。保存前に WebP の再エンコードを行い、画像メタデータを除去する。画像内にある個人情報に対しては、記録者が書き出す前に加工する。

形式を確認した Mimik Desktop v1.2.0 は MIT、Copyright 2026 Westpoint。ZIP 読み取りには yauzl 3.4.0（MIT）を追加し、画像加工は既存の Sharp 0.35.4（Apache-2.0）を使用する。テスト用アーカイブには既存の fflate 0.7.5（MIT）を使用する。取り込みの AI 呼び出しは0回。 [Mimik の形式](https://raw.githubusercontent.com/westpoint-io/mimik/desktop-v1.2.0/packages/core/src/transfer/schema.ts) · [Mimik のライセンス](https://raw.githubusercontent.com/westpoint-io/mimik/desktop-v1.2.0/LICENSE) · [yauzl](https://github.com/thejoshwolfe/yauzl)

現在の対象は本人用教材ライブラリ。研修参加者への共有公開、記録の再生、教材の編集・動画化は対象外。
