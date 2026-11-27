# 紹介先LPの設定と接続

紹介の審査・確定画面からサービス単位でLPを登録し、紹介URLの転送先を1件選択します。「標準の参加登録ページ」を選んだ場合は既存のサービスページへ進みます。選択中のLPを削除すると、標準の参加登録ページに戻ります。すでに配布した紹介URLとQRコードは共通です。

設定は登録ポリシーの専用列に保存し、変更履歴は既存のサービス設定監査へ記録します。紹介を利用できるサービスの条件、クリック計測、参加登録時の紹介判定は既存の手順を使います。設定されていないサービスは標準の参加登録ページへ進みます。

## 外部LPの申込ボタン

外部LPにはHTTPSの公開URLを登録します。管理者が運営・管理するLPを指定してください。紹介URLから遷移した場合、LPのURLに紹介コード `ref` とクリック識別子 `rc` が付きます。LPの申込ボタンから同じ2項目を本サービスの参加登録URLに渡してください。LPに直接訪れた場合も、同じボタンから通常登録できます。

月と星のオラクルのLPへの組み込み例です。両方の値が存在する場合にだけ引き継ぎます。

```html
<a id="fortune-apply" href="https://www.watashi-works.com/s/watashi-fortune"> LINEで申し込む </a>
<script>
  const button = document.getElementById('fortune-apply');
  const destination = new URL(button.href);
  const params = new URLSearchParams(window.location.search);
  const ref = params.get('ref');
  const rc = params.get('rc');
  if (ref && rc) {
    destination.searchParams.set('ref', ref);
    destination.searchParams.set('rc', rc);
    button.href = destination.toString();
  }
</script>
```

友だち追加ボタンを併設する場合、追加後にLPの「LINEで申し込む」へ戻るよう案内してください。LINEトークの共通登録リンクにはこの紹介情報がありません。公開前に、紹介URLから外部LP、LINEログイン、参加登録を通し、紹介管理の登録件数を確認してください。

## リリース

アプリのリリース前に同梱のマイグレーションを適用します。既存の登録ポリシーに空の設定を追加するため、既存の紹介先は従来のままです。外部LP側の申込ボタンを準備・確認した上で、管理画面からLPを登録して切り替えます。
