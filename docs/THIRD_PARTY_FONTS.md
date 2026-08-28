# 第三者フォント利用方針

## SNS画像生成

日本語画像の標準フォント候補はGoogleの「Noto Sans JP」とする。ライセンスはSIL Open Font License 1.1（OFL-1.1）。配布元とライセンス本文を確認し、フォントファイルを同梱するPRでは対応するOFL本文も同梱する。

- Font: Noto Sans JP
- License: SIL Open Font License 1.1
- Official source: `https://fonts.google.com/noto/specimen/Noto+Sans+JP`
- License source: `https://scripts.sil.org/OFL`

本PRではフォントbinaryを追加しない。Satori / resvg / Sharpの描画実装時に、必要なweightだけをリポジトリまたは配備artifactへ固定して同梱する。実行OSのインストール済みフォントや、実行時の外部フォント配信への依存は禁止する。

フォントを変更・追加する場合は、利用条件、再配布条件、ライセンス本文、使用weight、成果物への埋め込み可否を確認し、本書を更新してから使用する。
