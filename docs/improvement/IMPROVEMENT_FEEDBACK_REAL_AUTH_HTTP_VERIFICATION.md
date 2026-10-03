# Feedback人手確認: ローカル実Auth・Next・PostgreSQLのHTTP通し検証

## 結論

2026-10-03 Asia/Tokyo、基準main/調査SHAは`86b022115640997129f6a8b6f2c91c55e9b666e0`（PR #1102 merge）。同PRの最新headのverify/database成功を確認した。branchは`codex/improvement-feedback-real-auth-e2e`。

ユーザーのローカルAuth runtime・合成アカウント・Next起動の承認を受け、**実Supabase Authのセッション→実NextのgetUser/HTTP→実PostgreSQL保存**を接続して検証した。正常判断、再送、実HTTPの保存後応答喪失、所有/管理権限拒否、Authユーザー削除後の旧cookie拒否は試験範囲で成功した。

**2026-10-04の追試で、指定Chrome profileの実画面操作→実Auth/Next/PostgreSQL保存→終端表示と、保存後応答喪失→同一内容再送を同じrunで確認した**。後述の範囲限定のブラウザ通し検証は成功。通常ログインUI/PKCE、実端末、本番gateまで合格した意味ではなく、本番NO-GOは維持する。以下の2026-10-03の未完記録は当時の結果として残す。

変更はテスト専用script/helperと文書のみ。本番アプリ/API/認証/Repository、schema/migration、依存/lockfile、CI/CD、本番設定は変更しない。認証bypassは本番経路へ追加しない。

## 実行環境と隔離

### 2026-10-04 指定Chrome profileでの通し検証（範囲限定で成功）

基準main/調査SHAはPR #1104 merge `82ca2659f6f31b7747404e7005ff844f21b8e9fd`。同PR head `bf57714851db1b4882e90d7f0ebca74f12f90ac9`のverify/database SUCCESSを確認した。今回のbranchは`codex/improvement-feedback-chrome-auth-check`。ユーザー指定のChrome profile **tomoichiro**を使用し、user-owned tabには操作せず、試験tabを作成した。

#### 切り分けとテスト専用の変更

- fresh run `8c09a184d402`のHTTP assertionsは全PASSだったが、従来の19000 proxy経由では確認ボタンが反応せずbrowser candidate0。Nextの19002へ直接接続すると判断操作は反応したが、意図通りOrigin不一致で「画面更新が必要」となった。直接接続を保存成功とは扱わない。
- インストール済みNext **16.3.3**の`dist/client/dev/hot-reloader/app/web-socket.js`で開発接続先`/_next/hmr`を確認。従来のtest proxyはHTTPだけを転送し、このWebSocket upgradeを転送していなかった。GETだけを固定loopback宛へ転送する一時診断proxyで、upgrade追加後に判断操作が反応した。診断proxyのPOSTは405として保存を行わない。この診断はhydration/通信の切り分けであり、DB保存成功ではない。
- 診断では元のCSPを強制した状態でも反応を確認した。CSP緩和を最終解決にしない。test-only `feedback-e2e-next-upgrade.mjs`を追加し、19000→19002の**正確な`/_next/hmr`のみ**を転送する。他のupgradeは拒否、handshake timeout、socket cleanupを持つ。本番アプリ/proxy設定は変更しない。単体3件は固定宛先、拒否、cleanupを検証し、実Chromeの最終runで実HMR接続と画面操作を確認した。この開発環境の因果関係から本番障害とは断定しない。
- run `8c09a184d403`ではPostgres初期化用Unix socket serverのready判定直後、再起動中のためAuth DB作成が失敗した。成功扱いしない。setup helperの`pg_isready`を`-h 127.0.0.1`へ限定し、最終TCP serverの起動を待つ。失敗taskはID/labelを照合して除去、新しいd404でsetupからやり直した。本番DB設定は変更しない。
- 一時診断scriptは削除し、最終成果に含めない。runnerにはbrowserの200/応答喪失と、再送bodyのSHA-256比較結果（booleanのみ）を追加した。body、handle、cookie、digestは表示しない。観測のみでrequest内容/本番処理/安全条件のassertionを変更しない。

#### 最終runとDB照合

fresh run **`8c09a184d404`**、空の`bunshin_disposable_8c09a184d404`に既存226 migrationを適用しexit0。2026-10-04 00:07 JST頃にrunnerを開始し、全HTTP assertionsとbrowser入口の出力を確認してから操作した。実GoTrue2.192.0/Next16.3.3 dev webpack/PostgreSQL16、Node24/pnpm10、前回同様の合成fixtureと通信ガードを使用した。runtime imageはcached公式imageで追加取得なし。

| 手順           | 実画面・通信で確認した結果                                                                                                                                    | 同runのbrowser ServiceのDB読取                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 初期表示       | 30報告/5人/6bucket、実Auth発行cookieを使うtest-only入口から管理画面へ                                                                                         | HTTP試験は別Serviceで完了、browser確定操作は未実施                           |
| 正常判断       | 最初の「確認を始める」→判断フォーム→checkbox→「判断を確定」→disabled「記録済み」。修正完了/開発承認ではないstatus                                             | MARK_REVIEWED / REVIEW_COMPLETED / REVIEWED のoperation1                     |
| 保存後応答喪失 | 次のbucketでPREPARE後、local test-only制御で次の成功応答を破棄。実Nextの200後にproxyが切断、画面は「同じ内容で再送」。判断欄/checkboxは変更不可、成功表示なし | operation2。保存は既に完了                                                   |
| 同一判断の再送 | 上記ボタンをクリック→「記録済み」。runner観測は`BROWSER replay same-body=true`                                                                                | operation2のまま、追加監査なし                                               |
| 原本・scope    | 合成DBだけを読取して照合                                                                                                                                      | browser candidate2/operation2、全Feedback120/User24/Workspace4。原本件数不変 |

応答喪失は実障害ではなくtest proxyによる注入。再送同一性はJSON body bytesの比較であり、画面の偶然の表示だけでは判定していない。DB件数と組み合わせて当該操作の冪等性を確認する。今回browserではREVIEW_COMPLETEDを2bucketで実行し、他の2理由はHTTP assertionsの範囲。LINE、Provider、原価、利用枠の検証へ拡張しない。原本件数の最初の確認SQLは存在しない`user_feedback_reports`を指定してexit1となり、実schemaの`improvement_feedback`で再読取120件を確認した。誤ったSQLを成功記録に含めない。

#### 実行した検証と未確認

```text
# Node24のPATHをprocess限定で設定。Next/proxy停止時に実行:
node --require ./scripts/test/feedback-e2e-network-guard.cjs --test scripts/test/feedback-e2e-next-upgrade.test.mjs
node --test scripts/test/feedback-e2e-network-guard.test.mjs
pnpm --filter web exec vitest run test/improvement-feedback-review-http.test.ts test/improvement-feedback-review-service.test.ts test/improvement-feedback-review-handle.test.ts test/improvement-feedback-review-control.test.tsx
pnpm --filter web typecheck
pnpm architecture:check

# 新しいd404にsetup/migration完了後:
BUNSHIN_TEST_RUN_ID=8c09a184d404
BUNSHIN_E2E_KEEP_FOR_BROWSER=8c09a184d404
node --require ./scripts/test/feedback-e2e-network-guard.cjs scripts/test/feedback-real-auth-e2e.mjs
```

upgrade3件、通信ガード8件、関連4ファイル35件、Web typecheck、architecture、Node構文/PowerShell parse、対象Prettier、diff checkを確認。HTTP runnerは全PASS後にbrowser待機をCtrl+Cで終了したためshell exit1であり、全体exit0とは記録しない。ブラウザ操作は手動確認であり、通常PR CIに組み込んだ自動browser assertionではない。

未確認: 通常Magic Link/PKCE、cookie refresh/TTL失効、同時2画面barrier、別environment handle、原本変更後の実HTTP拒否、mobile viewport/実Safari、OS sandbox、browser cookie/profileの完全削除、本番停止/drain/backup復元後再削除。指定profileを使うことは専用の隔離profileを新設した意味ではない。合成session使用とAuth DB除去で完全なbrowser隔離を証明しない。

終了時に試験tabをcloseし、HTTP runner/Next/proxyを停止した。d402/d403/d404の各taskについて完全ID/`codex.task` labelを照合し、当該container/networkだけを除去。d404の残存task resourceなし、18998/18999/19000/19002/19003 listenerなしを確認した。合成DBは使い捨てで復元対象ではない。ソースmirror `C:\Users\Owner\AppData\Local\Temp\bunshin-feedback-e2e-zmpd3c`と`C:\Users\Owner\AppData\Local\Temp\bunshin-feedback-e2e-abFDD7`は保持し、他checkout/依存junctionや過去mirrorを削除していない。tab closeはcookie cleanupの証明ではない。本番変更/資格情報/顧客素材、課金、実生成、LINE/SNS、merge/deployなし。

今回の最小ゴールはこの範囲限定のブラウザ通し検証で完了。次の最小タスクは**Feedback maintenanceの停止→drain→preflightの非本番再現と証跡確認**。既存停止設計を読み、合成環境で実行可能な範囲を別作業で確定する。backup復元後再削除、通常ログイン/実端末など残るgateは独立に未完とし、本番GOを今回の成功から推論しない。

### 2026-10-03 ブラウザ再確認（未完）

基準mainはPR #1103 merge `ccdd669a07fa82315ec207f3f709f59ca6e0c0db`。同PR head `54359a520a41f4379aa1421c891f1ac3ab645378`のverify/database SUCCESSを確認。今回のbranchは`codex/improvement-feedback-real-auth-browser`。既存の同名に近いbrowser検証branchは上書きしていない。

- 新しいrun `8c09a184d401`を上記setup helperで作成。既存226 migrationのdeployがexit0になったことを確認してから、同じHTTP runnerを`BUNSHIN_E2E_KEEP_FOR_BROWSER=8c09a184d401`で実行した。全HTTP assertionのPASS出力とbrowser入口出力を確認した。browser待機のため、この時点ではrunnerは終了していない。
- 途中、migration完了前にrunnerを開始し`public.users`不存在でexit1になった。fixture作成前の停止であり、成功扱いしない。migration完了後はUser0のpreflightを通った。同じDBのresetや既存データ削除は行わない。
- アプリ内ブラウザでtest-only入口`http://127.0.0.1:19000/__e2e/login/browser`を開いた。初回navigationはtimeoutしたが、その後のAX/DOM/screenshotで実管理画面の表示を確認した。30報告/5人/6bucket、6個の「確認を始める」、週選択・説明文が表示された。セッションはfixture用実Auth発行cookieであり、通常ログインUI/PKCEの検証ではない。
- 最初のbucketをAX click、DOM locator click、reload後のEnterで確認。いずれもボタンは「確認を始める」のままで、判断フォームやstatus文言は現れなかった。2026-10-03 22:54:09 +09:00の実DB読取でbrowser Serviceのcandidate0、全Serviceのoperation4（HTTP試験だけ）を確認した。**画面のPREPARE/保存/終端表示/応答喪失再送は未達**。
- DOM内の5個のscript参照を確認し、該当するmain-app.jsをローカルHTTPで読取すると200/application-javascript、13,531,821 bytesだった。ブラウザ診断ログのerror/warn取得は空だった。これだけではscriptの実行・hydration・全chunk配信成功を証明しない。原因は未確定であり、本番不具合、CSP不具合、ブラウザ不具合のいずれとも断定しない。
- 追加の合成HTML probeを一時的な127.0.0.1:19003だけに配信した（DB/Auth/外部通信なし、インラインscriptでparagraphの文言を変更するだけ）。同じアプリ内ブラウザで`SCRIPT_NOT_RUN`→`SCRIPT_READY`、ボタンクリック→`CLICK_CONFIRMED`をAXで確認した。ブラウザ全体のJavaScript無効・クリック不能はこの最小条件では再現しない。ただしReact/Next hydration、外部script、eval、実管理画面のAPI送信まで証明するprobeではない。アプリ固有のscript配信/実行を次に切り分ける。
- Node24/Next dev webpack、実Auth/PostgreSQL、loopback gateway/proxy、合成fixture、通信ガードは前回と同じ。ブラウザの別profile/OS sandbox・cookie cleanup・mobile・実Safariは未確認。接続復旧とSSR画面表示を、ブラウザE2E完了と扱わない。本番NO-GOは維持。

再実行コマンドは後述の手順と同じ。今回の起動は`BUNSHIN_TEST_RUN_ID=8c09a184d401`と`BUNSHIN_E2E_KEEP_FOR_BROWSER=8c09a184d401`をprocess内で設定した。次はユーザーが選んだChrome profileで同じ合成画面を確認し、実行環境依存かを切り分ける。安全対策や本番ロジックを変更して試験を通さない。

ブラウザ試験は未完のため、成功したとのassertionやPR名にしない。終了時に2つの試験tabをcloseし、HTTP runner/probeへCtrl+Cを送った（shell終了コード1、待機中の中断であり全体exit0とは記録しない）。記録した完全container/network IDとtask labelを照合し、当該3container/2networkだけをstop/removeした。合成DBは使い捨てで復元対象ではない。一時mirror `C:\Users\Owner\AppData\Local\Temp\bunshin-feedback-e2e-AaIlvw`は保持し、前回の11mirrorや他checkout/依存junctionを削除していない。tab closeとブラウザcookie/profileの完全削除は区別する。今回も本番変更、課金、実生成、LINE/SNS実送信、merge/deployはない。

- Windows、Node24.21.0、pnpm10.10.0、Vitest4.1.11、Docker29.8.0。Authはcached `public.ecr.aws/supabase/gotrue:v2.192.0`（healthでもv2.192.0）、PostgreSQLはcached16。gatewayに公式`node:24-alpine`を追加取得した。初期のcached別アプリimageはNode単体gatewayだけで使い、その後公式imageへ交換し、最終検証は公式Node24 gatewayで実施した。別アプリ本体は起動していない。
- image ID: Auth `sha256:b252efb680be37d4a8bf77c210cf0439c19b63a4b51929233a65dd101d25bdab`、Postgres `sha256:33f923b05f64ca54ac4401c01126a6b92afe839a0aa0a52bc5aeb5cc958e5f20`、Node `sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1`。再取得時はtagの変更を前提にdigestを再照合する。
- task専用internal networkにAuthとDBだけを配置。Authの`/proc/net/route`にdefault routeがなく、networkのInternal=trueを確認。Auth DB `auth_e2e`とアプリDBは別database。公式Auth自身のmigrationはAuth専用DBだけに適用し、bunshinのschemaへ混ぜない。
- 固定宛先のみのgatewayをinternal/edgeの両networkに置き、host公開は127.0.0.1:18998（DB）/18999（Auth）のみ。Authの`/auth/v1/`を実GoTrueへ転送するだけで、架空の認証応答は返さない。gatewayはread-only/cap-drop/no-new-privileges、helper1ファイルだけread-only mount。DBにhost/shared volumeを渡さない。
- Nextはtracked HEADの一時ソースmirrorで起動し、既存node_modulesをjunctionで参照する。`.env*`実ファイルをコピーせず、processの許可list envだけを渡す。Nextには合成public key/session secretと専用DB URLだけ。Auth admin JWTはfixture runnerだけに保持し、Nextのenvへ渡さない。
- runner/Nextのtest-only Node preloadでfetch、raw socket、TLS、DNSをloopbackの18998/18999/19000/19002へ限定する。外部redirectも拒否する。これは**OS sandboxではない**。native Prisma engineや任意child binaryの通信を一般に封じるものではなく、Prismaの宛先は固定URL/live DB名/run markerで別途照合する。gatewayも固定コードの制限であり、悪意あるhost管理者への防御ではない。
- Next devを127.0.0.1:19002、test HTTP proxyを127.0.0.1:19000に限定。proxyのCSPはローカルtab内resourceの外部参照抑止であり、ブラウザ全体/extensionのOS隔離ではない。ブラウザprofile分離・cleanupも未検証のため完全なbrowser readinessとは判定しない。
- メール/外部OAuth、Provider、Storage、LINE、SNS、Cron/Workerは起動しない。合成アカウントのAuth admin作成・password sessionを使用した。Magic Link/PKCE/通常ログイン画面は今回の合格範囲に含めない。

参照した公式資料（2026-10-03確認）: [Supabase Auth v2.192.0 README](https://github.com/supabase/auth/blob/v2.192.0/README.md)、[Docker network create](https://docs.docker.com/reference/cli/docker/network/create/)、[Docker port publishing](https://docs.docker.com/engine/network/port-publishing/)。runtime設定はこの版と実health/制約を照合し、手順を本番構成へ流用しない。

## 合成fixtureと実経路

管理者A/B、非管理者、ブラウザ用管理者の4Auth identityを、アプリUser/AuthIdentityへ事前に紐付けた。各Service/Workspaceは分離し、5人の合成報告者×6bucket（3category×2surface）の完了済みJST週Feedbackを作成した。合計User24/Workspace4/Feedback120。ServiceConfigurationだけでなくBrand/RegistrationPolicyを揃えた。

実SDK `createServerClient` のpassword loginが発行したcookieを実HTTPへ渡し、Nextの`currentUserProvider`→Supabase `getUser()`→`PrismaCurrentUserAccountRepository`を通す。cookie writerはテストの保存先であり、SessionUserVerifier/getUserのfakeではない。未知identityのprovisionが発生しないことをUser/Workspace件数で確認する。

実経路は既存`/s/[serviceSlug]/manage/improvement-feedback`のGET、既存review APIのPREPARE/確定POST、暗号化handle、`ReviewImprovementFeedbackCandidate`、`PrismaImprovementFeedbackTriageRepository`。本番処理をtestへ複製しない。proxyは通信の転送と応答喪失注入だけを担う。run-boundのbrowser helper入口はfixtureの実セッションをcookieへ渡すテスト専用proxyで、本番アプリのログインrouteではない。通常実行後はproxy/Nextを停止する。

## ケース別の今回の結果

最終合格runは`8c09a184d3f8`、新しい空DB `bunshin_disposable_8c09a184d3f8`に既存226 migrationを適用し、全HTTP assertionを単一実行で完了した。source mirror作成は21:48:00 JST、終了時刻/所要時間は未計測。成功ログとexit0を確認し、過去/途中runの部分成功と区別する。

| ケース              | 注入/実行した層と観測                                                                                              | 判定                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| 実認証・GET         | real Auth password session→Next GET200。6selection handleを確認、GET前後candidate件数不変                          | 試験範囲で成功。browser login UIは未確認                |
| 確認済み            | PREPARE→MARK_REVIEWED→200/REVIEWED、同一bodyを新HTTP requestで再送→200、監査増加なし                               | 成功                                                    |
| 対象外2理由         | OUT_OF_SCOPE/DUPLICATE_REVIEW各PREPARE→DISMISS→200/DISMISSED、各再送でも監査増加なし                               | 成功                                                    |
| 保存後応答喪失      | real Nextの200応答をproxyが破棄しsocket切断。callerは例外、DB監査は既に4件。同じhandle/body再送→200、監査4件のまま | 成功。Providerの二重課金検証ではない                    |
| 別actor             | Bの実cookieでAのendpoint/handleを送信→404、保存増加なし                                                            | 成功                                                    |
| 別Service/Workspace | Aの実cookie/handleをBのendpointへ→404、保存増加なし                                                                | 成功。actor変更とscope変更を独立に実行                  |
| 非管理者            | 実PARTICIPANT sessionで管理POST→404                                                                                | 成功                                                    |
| 未認証              | cookieなしで管理POST→401                                                                                           | 成功                                                    |
| 権限取消            | PREPARE後、合成membershipをREVOKED＋revokedAtへ更新。実sessionの確定POST→404、監査4件のまま                        | 成功                                                    |
| 意図しないprovision | 上記実HTTP操作後のUser24/Workspace4を確認                                                                          | 成功                                                    |
| 実Auth本人不存在    | Auth admin APIで合成非管理者だけ削除。旧cookieを使うPOST→401、監査増加なし                                         | 成功。logout/session TTL/失効API一般の保証ではない      |
| response privacy    | PREPARE実HTTPのprivate,no-storeをassert、handleをURL/ログへ出さない                                                | 当該応答で成功。全ログ漏えい/全headerの網羅試験ではない |
| browser/mobile      | Chrome timeout→接続復旧確認もunavailable。IAB webview attach timeout                                               | 未確認。画面操作/実Safari/390×844は未実施               |

最終DBをread-onlyで再確認: candidate5（4終端＋未判断OPEN1）、operation4、User24、Workspace4。権限拒否でOPEN1が残ることと確認成功を混同しない。利用枠/原価/通知の処理は今回呼び出していない。

未実施: browserでの終端表示と同じ内容で再送、同時2画面の明示barrier、原本変更後のHTTP拒否、別environment handle、実token expiry/refresh、通常Magic Link/PKCE、実端末。本番gate/停止・drain/backup復元後再削除は引き続き未完。

## 途中失敗を含む証跡

1. Windows NODE_OPTIONSのbackslashがpreload pathから消え起動失敗。test-only pathをforward slashにした。
2. Auth空DBにauth schemaがなく自身のmigrationで停止。schema作成後のnamespace/search_path調整でも旧migration再検出があり、最終public,authの順序で起動/healthとloginを確認した。再実行setupではschema/search_pathを初回起動前に設定する。
3. 非管理者fixtureの`MEMBER`はServiceRoleに存在せず停止。`PARTICIPANT`へ修正した。途中fixtureを成功扱いしない。
4. Turbopackはmirror外のnode_modules junctionをfilesystem root外として拒否しpanic/502。CLIだけ`--webpack`へ変更。本番next.configやbuildは変更しない。
5. Brand/RegistrationPolicyの不足でGET500。fixtureだけ補完した。proxy終了時のheaders-sent helper errorも修正した。
6. run `8c09a184d3f7`は正常判断・応答喪失・scope拒否まで部分成功したが、REVOKEDにrevokedAtを設定しないfixtureがDB CHECKで失敗した。修正後、新しいrun f8で全HTTPケースを最初から成功させた。
7. デバッグ中に保存前fixtureだけの再開を試したが、その分岐は最終helperから除去した。最終helperで使用済みf8へ再実行し、User24≠0による拒否/exit1とcandidate5/operation4不変を確認。これは拒否試験の成功であり、2回目のE2E成功ではない。

assertion削除/skip/期待失敗指定で安全条件を合格させていない。最後の変更は未使用のdebug再開分岐・不要なtoken保持・ログ表示の除去で、最終fresh runで実行した通常ケースのassertionは維持している。

## 再実行手順

Node24/pnpm10と既存依存・生成済みPrisma clientが必要。HTTP検証の環境はDocker/psqlコマンドを個別確認して起動した。追加setup helperも別run `8c09a184d3f9` で全体を実行しexit0、Auth health v2.192.0、専用アプリDB名とAuth User0を確認した（f9ではアプリmigration/HTTP試験は実行しない）。初回helperはPowerShellの共通parameterにDockerの`-e`が誤解釈されnetwork作成後に停止したため、その2networkをID/label確認後に除去し、plain functionへの修正後に成功した。通常CIにはAuth/browserがなく、CIの成功を手動runの代わりにしない。

1. 上記3imageを公式sourceから取得/照合。ports18998/18999/19000/19002に別作業があれば止めず中断。新しい12〜32桁hex run IDを選ぶ。
2. `scripts/test/feedback-real-auth-environment.ps1 -RunId <freshRunId>`で専用runtimeを作成。既存の同名container/networkは拒否する。出力した完全ID、task label、Internal、loopback publish、DB名を照合する。setupはアプリmigration/testsを自動実行しない。失敗時も他資源をpruneしない。
3. process限定でAPP_ENV=development、DATABASE_URL/DIRECT_URLを`postgresql://postgres:synthetic-local-test-only@127.0.0.1:18998/bunshin_disposable_<freshRunId>`に完全一致設定。既存226 migrationだけを適用する。Auth healthがv2.192.0であることを読み取り確認する。
4. repo rootで次を実行する。runner自身もlive DB名/commentとUser0をfixture書込前に検査する。既存DBへmarkerを付けて試験を通さない。

```text
pnpm --filter @bunshin/database db:migrate:deploy
node --test scripts/test/feedback-e2e-network-guard.test.mjs
# BUNSHIN_TEST_RUN_ID=<freshRunId> をprocess内で明示して:
node --require ./scripts/test/feedback-e2e-network-guard.cjs scripts/test/feedback-real-auth-e2e.mjs
```

network guard/upgrade単体は19000を使うため、Next/proxyと同時に実行しない。通常runnerは終わるとNext/proxyを停止する。browser用に残す場合だけBUNSHIN_E2E_KEEP_FOR_BROWSERに同じrun IDを明示し、全HTTP PASS出力の後に`/__e2e/login/browser`を開く。2026-10-04に指定Chromeで確認した範囲は上記追記を参照。確認後Ctrl+Cで停止する。opt-inは通常ログインや完全なbrowser隔離を保証しない。

5. 検証終了後、記録ID/labelを再確認し、そのtaskのAuth/gateway/DBだけstop（--rmで匿名volumeを含む使い捨てDBを除去）、専用networkを除去する。残存task labelとloopback listenerを確認。一時mirrorのjunctionを先にunlinkし、検証した自taskの絶対pathだけを削除する。他のcheckout/依存の実体を削除しない。

今回の検証コマンド: 上記guard8件成功、real Auth HTTP runner成功/exit0、使用済みDB拒否成功（非zeroを確認）、Web typecheck成功、既存review HTTP/service/handle/controlの4ファイル35件成功、Node構文/PowerShell parse、architecture、変更ファイルPrettier、diff check。全体lint/test/buildは最新headの通常PR CIで別途確認する。

## 次の最小タスクと停止境界

検証終了後、f6/f7/f8の合成DBを含む旧taskのAuth/DB/gatewayと2networkを完全ID/label照合後に除去した。setup検証f9も同じ方法で除去し、各task labelのcontainer/network残存なしを確認した。Next/proxyの19000/19002 listenerは終了を確認。共有pruneや別作業のcontainer停止はない。一方、Tempの`bunshin-feedback-e2e-*`一時ソースmirror11個は削除操作が拒否されたため保持している。tracked sourceのコピー・依存junction・dev cacheであり、実ユーザーデータは持ち込んでいない。依存junctionの参照先である本来のcheckout/node_modulesを削除せず、必要なら別途安全なcleanupを行う。browser cookie/profileのcleanup確認は未実施で、Auth DB除去とその確認を混同しない。

2026-10-03時点の次タスクはブラウザ操作とDB証跡の接続だった。2026-10-04追試で範囲限定の成功を確認したため、現在の最小タスクは上記追記の**非本番での停止→drain→preflight再現**。OS全体のbrowser sandbox、通常ログイン、実端末などの未確認条件は残す。

今回、本番DB/設定/資格情報/顧客素材、課金API、実生成、LINE/SNS、merge/deployは使用・実行していない。本番gateを解除しない。切り戻しは追加テストscript/helperと文書のみで、アプリとschemaに影響しない。完了/未確認を分けたテスト専用PRとして共有する。
