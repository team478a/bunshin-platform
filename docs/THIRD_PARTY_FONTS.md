# 第三者フォント利用方針

## SNS画像生成

日本語画像の標準フォントはNoto Sans CJK JPとする。ライセンスはSIL Open Font License 1.1（OFL-1.1）。公式配布元から取得した静的OTFとライセンス本文を同梱する。

- Font: Noto Sans CJK JP Regular / Bold
- License: SIL Open Font License 1.1
- Official source: `https://github.com/notofonts/noto-cjk/tree/main/Sans/OTF/Japanese`
- License source: `https://scripts.sil.org/OFL`
- Regular SHA-256: `68A3FC98800B2A27B371F2FB79991DAF3633BD89309D4FFAA6946FD587F375B5`
- Bold SHA-256: `E53DCB0DCB2922E45D01AAE1EBD2F382BB81D4229B18B6B883BD170678AF1F76`

`apps/web/assets/fonts/noto-sans-jp`へRegularとBoldだけを固定して同梱する。SatoriはWOFF2を扱わず、可変TTFも使用ライブラリとの互換性を確認できなかったため、静的OTFを採用する。実行OSのインストール済みフォントや実行時の外部フォント配信には依存しない。

フォントを変更・追加する場合は、利用条件、再配布条件、ライセンス本文、使用weight、成果物への埋め込み可否を確認し、本書を更新してから使用する。
