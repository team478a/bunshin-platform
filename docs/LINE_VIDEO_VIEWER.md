# LINE内ブラウザーでの動画閲覧

完成通知はアプリのログインUserと動画所有者が一致する管理URLを送っていたため、別のログイン文脈や未ログインのLINE内ブラウザーから開くと404またはログイン画面になった。

通知用URLを`/video-access/[projectId]`に分離する。既に送った`/groups/[groupId]/videos/[projectId]`もNextのredirectで認証レイアウトの前に閲覧画面へ案内する。管理画面は`?manage=1`で維持し、未完成動画のアプリ所有者はそちらへ戻す。

アプリの所有者セッション、または通知先として登録済みのService専用LINEでOAuth本人確認した場合だけ動画タイトル・動画を表示する。別のアプリUserでログイン中でも、専用LINEの検証済みsubjectが元の通知先と一致すれば、その動画の閲覧だけを許可する。ログインUserやAuthIdentityの統合・切替・権限変更は行わない。

OAuthは10分の単回state、HttpOnly/Secure/SameSite=Lax Cookie、PKCE、nonceを利用し、消費後にnonce/verifierを消去する。閲覧Cookieは動画単位・30分期限の乱数とし、DBにはハッシュだけを保持する。閲覧とダウンロードのたびに所有者、所属、専用LINE設定、通知先の一致、期限を再確認する。保存先はWorkspace/所有者/Renderの一致を確認したうえで5分の署名URLを発行する。匿名UUIDアクセスや別LINEの認証では許可しない。

本番LINE Loginチャネルには既存URLを残して`https://www.watashi-works.com/auth/video-line/callback`を追加する。受入確認は、アプリ所有者と異なる/未ログインのブラウザーで既存通知URLから入り、LINE本人確認後にMP4を読み込んで再生できることまで行う。
