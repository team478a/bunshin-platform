# LINEサービスホームのアクセス案内

日付: 2026-10-13。実装ブランチ: `codex/line-contextual-404`。

## 背景

マナベルスタイルのLINE標準メニューから `/s/manaberu-style/home` を開くと、通常ブラウザでは表示できる一方、LINE内ブラウザではログイン画面を経ず404になる報告があった。参加者ホームは認証後にService Membershipを解決し、Serviceを認識できない場合は404へ変換していた。LINE内ブラウザの未ログイン/別セッションと未参加状態を利用者が区別できず、次の操作も分からなかった。

## 対応

- 未ログイン時は自動転送せず、LINE内ブラウザと通常ブラウザのログイン状態が異なることを説明し、ホームを戻り先にしたログインボタンと、公開Serviceの参加案内を表示する。
- ログイン済みでも当該Serviceへの参加が確認できない場合、公開Serviceなら参加案内へ誘導する。非公開/不存在ならService名や状態を漏らさず、運営者への問い合わせを案内する。
- Membership取得結果が欠けている場合も参加者ホームを表示せず、状態案内にする。
- Membership/Workspace/Groupの照合は維持し、認可を弱めない。予期しないDB/Providerエラーは捕捉して案内に置き換えず、そのまま観測可能にする。
- Rich Menu、LINE設定、ログインProvider、DB schema、本番データは変更しない。

## 検証

- `service-home-access-guidance.test.tsx`: 3状態の見出し、案内、ログイン復帰URL、公開Service案内の有無を確認。
- `private-service-rich-menu-boundary.test.ts`、`service-home-module-boundary.test.ts`: 既存認可境界とホームのデータ境界を確認。
- 対象テスト22件、対象lint、Prettier、`git diff --check`は成功。
- Web typecheckは初回のoptional prop不一致を修正後に成功。
- ローカルNodeは22.15.0で、リポジトリ要求Node 24系と一致しない。PR CIのNode 24検証が必要。

## 未完了

- PRレビュー、CI、マージ、本番反映。
- 本番反映後のLINE内ブラウザで、未ログイン・参加済み・未参加を分けた実機確認。
- 通常ブラウザで表示できた同じ利用者がLINE内ブラウザで未ログインだったかどうかは、アクセスログ/認証情報を確認できていないため未確定。
