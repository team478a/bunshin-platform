# ADR: LINE Loginと既存verified sessionの統合

日付: 2026-08-22
状態: Proposed

## Context

現在のWeb認証はSupabase AuthのEmail Magic Link + PKCE、SSR cookie、server-side `getUser()`検証を入口とし、Platform DBのActive User、AuthIdentity、WorkspaceMembershipを認可の正本としている。

Phase 6ではLINE Loginからも同じWeb UIとAPIへ到達する必要がある。一方、LINE user IDだけでUserやMissionを取得する方式、Routeごとに異なる認可を持つ方式、メール一致による自動account mergeはtenant isolationを壊す。

## Decision

LINE Loginは外部Identity検証として追加し、認可は既存と同じPlatform actor解決とWorkspace/Bunshin scopeへ収束させる。

1. LINE Login v2.1 Authorization Code Flowを使い、`state`、`nonce`、PKCE S256を必須とする。
2. Backendがcodeをtokenへ交換し、ID tokenのsignature、issuer、audience、expiry、nonceを検証する。
3. 検証済み`sub`を`AuthIdentity(provider=LINE, providerUserId=sub)`として解決する。
4. 新規LINE LoginではUserとPERSONAL Workspaceを作成できる。
5. 既存UserへのLINE追加はverified session中の明示的な「LINEを連携する」操作だけ許可する。
6. LINEから得たメールアドレスと既存Userのメールアドレスが一致しても自動統合しない。
7. LINE起点sessionも既存Routeが利用する単一の`CurrentUserProvider`契約へ変換する。Routeやapplication serviceは認証Providerを条件分岐しない。
8. Mission Deep Linkは環境別の用途分離鍵で署名したsingle-use短期stateへ復帰先を保存し、Login後にverified actorからMission ownershipを再検証する。
9. LINE access tokenはcallbackで必要な検証を終えた後、継続利用要件がない限り永続保存しない。Messaging Channel Access Tokenとは別の秘密値として扱う。

## Session実装のGate

現在のSupabase sessionをLINE認証後に安全に発行できる公式・保守可能な方法を6-B着手前にspikeで確認する。

- 既存Supabase SSR cookieへ収束できる場合は、EmailとLINEで同じsession検証を利用する。
- 収束できない場合は、署名・rotation・失効・CSRF・cookie属性を備えたPlatform sessionを認証Provider共通で導入する別ADRを先に承認する。
- LINE専用cookieやLINE専用認可middlewareを暫定追加してRouteごとに混在させない。

## Account Linking

- 未ログインLINE Loginで既存のLINE Identityがある場合、そのUserへログインする。
- 未ログインLINE LoginでIdentityがない場合、新規User作成フローへ進む。
- Email UserへLINEを追加する場合、既存verified sessionと新しいLINE OAuth transactionの双方を確認する。
- 同じLINE Identityが別Userへ登録済みの場合は競合として拒否し、自動移動しない。
- SUSPENDEDまたはDELETED Userはsessionを発行しない。
- 連携解除はIdentityを失効または削除する前に、未送信LINE通知を取消し、監査記録を残す。

## Security

- OAuth transactionは短時間有効、single-useとする。
- `state`、`nonce`、PKCE verifierをブラウザから任意入力として信頼しない。
- Callback URLと復帰先はallowlistを使い、open redirectを許可しない。
- Callback URLは信頼済みアプリURLと固定pathから自動生成し、runtime environmentと設定環境の一致をサーバー側で検証する。
- Production callbackはProductionドメインだけ、localhostはDEVELOPMENTだけを許可し、URL user info、任意query、fragmentを拒否する。
- LINE user ID、token、ID token、OAuth codeをログへ記録しない。
- Login callback後もWorkspaceMembership、Bunshin ownership、Capability、resource scopeを必ず検証する。
- Cross User / Workspace / BunshinとIdentity競合をintegration testに含める。

## Consequences

- LINE Loginは入口を追加するが、application serviceの認可方式は増えない。
- 新規User作成と既存User連携を明確に分離できる。
- Supabase Authとのsession統合方法には事前spikeが必要であり、確認前に6-B本実装へ進めない。
- LINE user access tokenを常時保存しないため、友だち状態はLogin時確認とWebhook follow/unfollowを用途別に扱う。
- Deep Link署名はLINE SecretやTokenを流用せず、環境変数の親鍵からHKDF等で環境・用途・key version別に導出する。

## Deep Link State

- stateへ`keyVersion`、purpose、expiry、single-use identifier、必要最小の復帰先参照だけを含める。
- Mission本文、個人情報、Secret、Token、Knowledgeを含めない。
- expiry超過、環境不一致、purpose不一致、使用済みidentifierを拒否する。
- 署名親鍵は管理画面・DBへ保存しない。既存`ENCRYPTION_KEY`のraw valueを署名APIへ直接渡さず、異なるHKDF infoで署名専用鍵を導出する。
- 安全な導出・rotationが難しい場合は、環境別の専用`LINE_DEEP_LINK_SIGNING_KEY`を採用する別ADRを先に承認する。
- 署名の成功は認可ではない。Login後にUser、Workspace、Bunshin、Missionを再度scopeする。

## Rejected Alternatives

### LINE user IDだけでMissionを取得する

Workspace、User、Bunshinの認可を迂回するため却下する。

### メールアドレス一致で自動統合する

LINE側メール取得許可の有無や既存アカウントの真正性だけでは安全な所有権移転にならないため却下する。

### LINE専用SessionをRouteへ直接追加する

認可経路が二重化し、将来のRouteで検証漏れが発生するため却下する。

### LINE access tokenを無期限保存する

初期MVPの継続要件がなく、漏えい・失効・rotationの負担だけを増やすため却下する。
