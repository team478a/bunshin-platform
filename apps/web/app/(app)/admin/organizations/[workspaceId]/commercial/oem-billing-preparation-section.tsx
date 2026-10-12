import type { CommercialAdminDashboardProps } from './commercial-admin-types';

function dateTimeInput(value: Date | null | undefined): string {
  if (!value) return '';
  const local = new Date(value.getTime() + 9 * 60 * 60 * 1_000);
  return local.toISOString().slice(0, 16);
}

function dateTime(value: Date | null | undefined): string {
  if (!value) return '終了日なし';
  return value.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
}

function count(value: number): string {
  return `${value.toLocaleString('ja-JP')}人`;
}

export function OemBillingPreparationSection({
  dashboard,
  query,
  oemPreparation,
  oemShadow,
  oemShadowReviewRequired,
  actions,
}: Pick<
  CommercialAdminDashboardProps,
  'dashboard' | 'query' | 'oemPreparation' | 'oemShadow' | 'oemShadowReviewRequired' | 'actions'
>) {
  const workspaceId = dashboard.workspace.id;
  const { readiness } = oemPreparation;
  const reviewedParticipants = oemPreparation.participants.filter(
    (participant) => participant.currentRegistration !== null,
  ).length;
  const preparedMessage =
    query.oemPrepared === 'offering'
      ? '提供区分の履歴を保存しました。'
      : query.oemPrepared === 'offering-correction'
        ? '提供期間の訂正版を保存しました。'
        : query.oemPrepared === 'registration'
          ? '正式登録の履歴を保存しました。'
          : query.oemPrepared === 'registration-correction'
            ? '正式登録期間の訂正版を保存しました。'
            : query.oemPrepared === 'contract'
              ? 'OEM契約期間の履歴を保存しました。'
              : query.oemPrepared === 'cutover'
                ? '将来月のcutoverを予約しました。'
                : null;

  return (
    <section className="settings-card" id="oem-billing-preparation">
      <p className="eyebrow">正式登録課金 V2</p>
      <h2>初期履歴とcutover準備</h2>
      <p>
        証跡を確認した内容だけを登録します。現在状態やサービス名から過去日付を推測せず、準備完了後も将来月を指定するまで課金方式は切り替わりません。
      </p>

      {preparedMessage ? <p className="notice notice--success">{preparedMessage}</p> : null}

      <div className="operations-overview" aria-label="正式登録課金の準備状況">
        <div>
          <span>サービス提供区分</span>
          <strong>
            {oemPreparation.services.length - readiness.missingOfferingCount}/
            {oemPreparation.services.length}件
          </strong>
        </div>
        <div>
          <span>正式登録履歴</span>
          <strong>
            {reviewedParticipants}/{oemPreparation.participants.length}人
          </strong>
        </div>
        <div>
          <span>契約期間履歴</span>
          <strong>{readiness.contractHistoryReady ? '確認済み' : '未登録'}</strong>
        </div>
        <div>
          <span>cutover</span>
          <strong>
            {oemPreparation.billingPolicy
              ? `${oemPreparation.billingPolicy.effectiveFrom.toISOString().slice(0, 7)}から予約済み`
              : '未予約'}
          </strong>
        </div>
      </div>

      <div className="settings-stack service-template-preview">
        <h3>1. 月次shadowを確認</h3>
        <p>
          読み取り専用計算です。確定、請求発行、既存履歴の変更は行いません。旧MAUとの差を証跡と照合してください。
        </p>
        <form method="get" className="form-stack">
          <label className="field">
            <span className="field__label">確認する利用月</span>
            <input
              className="field__control"
              type="month"
              name="shadowMonth"
              required
              defaultValue={query.shadowMonth}
            />
          </label>
          <button className="button button--secondary" type="submit">
            shadowを再計算
          </button>
        </form>
        {oemShadowReviewRequired ? (
          <p className="notice notice--danger">
            この月は履歴不足のため計算できません。0人や旧MAUで補完せず、下の不足項目を確認してください。
          </p>
        ) : oemShadow ? (
          <div className="operations-overview" aria-label="shadow計算結果">
            <div>
              <span>対象月</span>
              <strong>{oemShadow.month}</strong>
            </div>
            <div>
              <span>旧MAU</span>
              <strong>{count(oemShadow.mau)}</strong>
            </div>
            <div>
              <span>有料の正式登録 R</span>
              <strong>{count(oemShadow.registeredUserCount)}</strong>
            </div>
            <div>
              <span>無料の実利用 A</span>
              <strong>{count(oemShadow.freeActiveUserCount)}</strong>
            </div>
            <div>
              <span>R・Aの重複</span>
              <strong>{count(oemShadow.overlapUserCount)}</strong>
            </div>
            <div>
              <span>最終課金人数 R∪A</span>
              <strong>{count(oemShadow.billableUserCount)}</strong>
            </div>
          </div>
        ) : null}
      </div>

      <div className="settings-stack service-template-preview">
        <h3>2. サービスごとの提供区分</h3>
        {oemPreparation.services.length === 0 ? (
          <p className="notice notice--danger">対象WorkspaceにServiceがありません。</p>
        ) : (
          oemPreparation.services.map((service) => {
            const offering = service.currentOffering;
            const selectableProducts = offering
              ? oemPreparation.products.filter((product) => product.key === offering.productPolicy)
              : oemPreparation.products;
            return (
              <div className="settings-stack" key={service.groupId}>
                <h4>{service.displayName}</h4>
                <p className="field__hint">
                  {service.group.name} / {service.slug}
                </p>
                {offering ? (
                  <p>
                    現在：<strong>{offering.product.displayName}</strong> /{' '}
                    <strong>{offering.classification}</strong>（商品ポリシー v
                    {offering.productPolicyVersion.version}、開始 {dateTime(offering.startsAt)}）
                  </p>
                ) : (
                  <p className="notice notice--danger">提供区分の履歴がありません。</p>
                )}
                {service.offeringHistory.length > 0 ? (
                  <details>
                    <summary>提供期間履歴を確認・訂正</summary>
                    <div className="settings-stack">
                      {service.offeringHistory.map((period) => (
                        <div className="settings-stack" key={period.id}>
                          <p>
                            {period.classification} / {dateTime(period.startsAt)} から{' '}
                            {period.endsAt ? dateTime(period.endsAt) : '継続中'}
                            {period.supersedesId ? '（訂正版）' : ''}
                          </p>
                          <form className="form-stack" action={actions.correctOemOffering}>
                            <input type="hidden" name="workspaceId" value={workspaceId} />
                            <input type="hidden" name="offeringPeriodId" value={period.id} />
                            <input
                              type="hidden"
                              name="expectedStartsAt"
                              value={period.startsAt.toISOString()}
                            />
                            <input
                              type="hidden"
                              name="expectedEndsAt"
                              value={period.endsAt?.toISOString() ?? ''}
                            />
                            <input
                              type="hidden"
                              name="expectedClassification"
                              value={period.classification}
                            />
                            <div className="form-grid form-grid--two">
                              <label className="field">
                                <span className="field__label">訂正後の開始</span>
                                <input
                                  className="field__control"
                                  type="datetime-local"
                                  name="revisedStartsAt"
                                  defaultValue={dateTimeInput(period.startsAt)}
                                  required
                                />
                              </label>
                              <label className="field">
                                <span className="field__label">訂正後の終了</span>
                                <input
                                  className="field__control"
                                  type="datetime-local"
                                  name="revisedEndsAt"
                                  defaultValue={dateTimeInput(period.endsAt)}
                                />
                              </label>
                            </div>
                            <label className="field">
                              <span className="field__label">訂正後の提供区分</span>
                              <select
                                className="field__control"
                                name="revisedClassification"
                                defaultValue={period.classification}
                                required
                              >
                                <option value="FREE">FREE</option>
                                <option value="PAID">PAID</option>
                                <option value="PAID_BUNDLE">PAID_BUNDLE</option>
                              </select>
                            </label>
                            <label className="field">
                              <span className="field__label">訂正根拠</span>
                              <textarea
                                className="field__control"
                                name="reason"
                                minLength={10}
                                maxLength={1000}
                                required
                              />
                            </label>
                            <label className="field field--checkbox">
                              <input type="checkbox" name="confirmed" required />
                              <span>
                                元履歴を残して訂正版を追加します。確定済み請求月に影響する訂正は保存できません
                              </span>
                            </label>
                            <button className="button button--secondary" type="submit">
                              提供期間の訂正版を保存
                            </button>
                          </form>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}
                {service.supersededOfferingHistory.length > 0 ? (
                  <details>
                    <summary>訂正前の提供期間を表示</summary>
                    <ul className="summary-list">
                      {service.supersededOfferingHistory.map((period) => (
                        <li key={period.id}>
                          <span>
                            {period.classification} / {dateTime(period.startsAt)} から{' '}
                            {period.endsAt ? dateTime(period.endsAt) : '継続中'}
                          </span>
                          <strong>訂正前・参照専用</strong>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
                <form className="form-stack" action={actions.setOemOffering}>
                  <input type="hidden" name="workspaceId" value={workspaceId} />
                  <input type="hidden" name="groupId" value={service.groupId} />
                  <input type="hidden" name="expectedCurrentId" value={offering?.id ?? ''} />
                  <label className="field">
                    <span className="field__label">Service Product</span>
                    <select
                      className="field__control"
                      name="productPolicy"
                      required
                      defaultValue={offering?.productPolicy}
                    >
                      <option value="">選択してください</option>
                      {selectableProducts.map((product) => (
                        <option key={product.id} value={product.key}>
                          {product.displayName}（{product.key} / v{product.currentPolicy.version}）
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field__label">提供区分</span>
                    <select
                      className="field__control"
                      name="classification"
                      required
                      defaultValue={offering?.classification ?? 'PAID'}
                    >
                      <option value="FREE">FREE</option>
                      <option value="PAID">PAID</option>
                      <option value="PAID_BUNDLE">PAID_BUNDLE</option>
                    </select>
                  </label>
                  <label className="field">
                    <span className="field__label">確認根拠・変更理由</span>
                    <textarea
                      className="field__control"
                      name="reason"
                      minLength={10}
                      maxLength={1000}
                      required
                    />
                  </label>
                  <label className="field field--checkbox">
                    <input type="checkbox" name="confirmed" required />
                    <span>契約資料で対象商品と提供区分を確認しました</span>
                  </label>
                  <button className="button button--secondary" type="submit">
                    提供区分を保存
                  </button>
                </form>
              </div>
            );
          })
        )}
      </div>

      <div className="settings-stack service-template-preview">
        <h3>3. OEM契約期間の履歴</h3>
        {oemPreparation.contractPeriods.length === 0 ? (
          <p className="notice notice--danger">確認済みの契約期間がありません。</p>
        ) : (
          <ul className="summary-list">
            {oemPreparation.contractPeriods.map((period) => (
              <li key={period.id}>
                <div>
                  <span>{dateTime(period.startsAt)} から</span>
                  <strong>{period.endsAt ? dateTime(period.endsAt) : '継続中'}</strong>
                  {period.supersedesId ? <small>訂正版</small> : null}
                </div>
                <details>
                  <summary>この契約期間を訂正</summary>
                  <form className="form-stack" action={actions.correctOemContract}>
                    <input type="hidden" name="workspaceId" value={workspaceId} />
                    <input type="hidden" name="contractPeriodId" value={period.id} />
                    <input
                      type="hidden"
                      name="expectedStartsAt"
                      value={period.startsAt.toISOString()}
                    />
                    <input
                      type="hidden"
                      name="expectedEndsAt"
                      value={period.endsAt?.toISOString() ?? ''}
                    />
                    <div className="form-grid form-grid--two">
                      <label className="field">
                        <span className="field__label">訂正後の契約開始</span>
                        <input
                          className="field__control"
                          type="datetime-local"
                          name="revisedStartsAt"
                          defaultValue={dateTimeInput(period.startsAt)}
                          required
                        />
                      </label>
                      <label className="field">
                        <span className="field__label">訂正後の契約終了</span>
                        <input
                          className="field__control"
                          type="datetime-local"
                          name="revisedEndsAt"
                          defaultValue={dateTimeInput(period.endsAt)}
                        />
                      </label>
                    </div>
                    <label className="field">
                      <span className="field__label">訂正根拠</span>
                      <textarea
                        className="field__control"
                        name="reason"
                        minLength={10}
                        maxLength={1000}
                        required
                      />
                    </label>
                    <label className="field field--checkbox">
                      <input type="checkbox" name="confirmed" required />
                      <span>
                        元履歴を残して訂正版を追加します。確定済み請求月に影響する訂正は保存できません
                      </span>
                    </label>
                    <button className="button button--secondary" type="submit">
                      契約期間の訂正版を保存
                    </button>
                  </form>
                </details>
              </li>
            ))}
          </ul>
        )}
        {oemPreparation.contractPeriodHistory.some((period) => period.supersededBy !== null) ? (
          <details>
            <summary>過去の訂正前履歴を表示</summary>
            <ul className="summary-list">
              {oemPreparation.contractPeriodHistory
                .filter((period) => period.supersededBy !== null)
                .map((period) => (
                  <li key={period.id}>
                    <span>
                      {dateTime(period.startsAt)} から{' '}
                      {period.endsAt ? dateTime(period.endsAt) : '継続中'}
                    </span>
                    <strong>訂正前・参照専用</strong>
                  </li>
                ))}
            </ul>
          </details>
        ) : null}
        <form className="form-stack" action={actions.reviewOemContract}>
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <div className="form-grid form-grid--two">
            <label className="field">
              <span className="field__label">契約開始</span>
              <input className="field__control" type="datetime-local" name="startsAt" required />
            </label>
            <label className="field">
              <span className="field__label">契約終了（継続中は空欄）</span>
              <input className="field__control" type="datetime-local" name="endsAt" />
            </label>
          </div>
          <label className="field">
            <span className="field__label">確認根拠</span>
            <textarea
              className="field__control"
              name="reason"
              minLength={10}
              maxLength={1000}
              required
            />
          </label>
          <label className="field field--checkbox">
            <input type="checkbox" name="confirmed" required />
            <span>契約書等の証跡で開始・終了日時を確認しました</span>
          </label>
          <button className="button button--secondary" type="submit">
            契約期間を保存
          </button>
        </form>
      </div>

      <div className="settings-stack service-template-preview">
        <h3>4. 参加者の正式登録履歴</h3>
        <p>
          同意済みで現在ACTIVEまたはSUSPENDEDの参加者だけを表示します。停止は登録終了として扱いません。
        </p>
        {oemPreparation.participants.length === 0 ? (
          <p>確認対象の参加者はいません。</p>
        ) : (
          oemPreparation.participants.map((participant) => {
            const service = oemPreparation.services.find(
              (candidate) => candidate.groupId === participant.groupId,
            );
            return (
              <div className="settings-stack" key={participant.id}>
                <h4>{participant.user.displayName}</h4>
                <p className="field__hint">
                  {service?.displayName ?? participant.groupId} / {participant.status} / 同意{' '}
                  {dateTime(participant.consentedAt)}
                </p>
                {participant.currentRegistration ? (
                  <p>
                    正式登録済み：
                    <strong>{dateTime(participant.currentRegistration.startsAt)}</strong>
                  </p>
                ) : participant.latestRegistration ? (
                  <p className="notice notice--danger">
                    終了済み履歴があります。初期履歴を追加せず、訂正・再登録の個別レビューが必要です。
                  </p>
                ) : (
                  <form className="form-stack" action={actions.reviewOemRegistration}>
                    <input type="hidden" name="workspaceId" value={workspaceId} />
                    <input type="hidden" name="groupMembershipId" value={participant.id} />
                    <label className="field">
                      <span className="field__label">正式登録日時</span>
                      <input
                        className="field__control"
                        type="datetime-local"
                        name="registeredAt"
                        defaultValue={dateTimeInput(participant.consentedAt)}
                        required
                      />
                    </label>
                    <p className="field__hint">
                      同意日時を候補表示しています。正式登録の証跡と異なる場合は必ず修正してください。
                    </p>
                    <label className="field">
                      <span className="field__label">確認根拠</span>
                      <textarea
                        className="field__control"
                        name="reason"
                        minLength={10}
                        maxLength={1000}
                        required
                      />
                    </label>
                    <label className="field field--checkbox">
                      <input type="checkbox" name="confirmed" required />
                      <span>同意・参加承認と正式登録日時の証跡を確認しました</span>
                    </label>
                    <button className="button button--secondary" type="submit">
                      正式登録履歴を保存
                    </button>
                  </form>
                )}
                {participant.registrationHistory.length > 0 ? (
                  <details>
                    <summary>正式登録期間を確認・訂正</summary>
                    <div className="settings-stack">
                      {participant.registrationHistory.map((period) => (
                        <div className="settings-stack" key={period.id}>
                          <p>
                            {dateTime(period.startsAt)} から{' '}
                            {period.endsAt ? dateTime(period.endsAt) : '継続中'}
                            {period.supersedesId ? '（訂正版）' : ''}
                          </p>
                          <form className="form-stack" action={actions.correctOemRegistration}>
                            <input type="hidden" name="workspaceId" value={workspaceId} />
                            <input type="hidden" name="registrationPeriodId" value={period.id} />
                            <input
                              type="hidden"
                              name="expectedStartsAt"
                              value={period.startsAt.toISOString()}
                            />
                            <input
                              type="hidden"
                              name="expectedEndsAt"
                              value={period.endsAt?.toISOString() ?? ''}
                            />
                            <div className="form-grid form-grid--two">
                              <label className="field">
                                <span className="field__label">訂正後の登録開始</span>
                                <input
                                  className="field__control"
                                  type="datetime-local"
                                  name="revisedStartsAt"
                                  defaultValue={dateTimeInput(period.startsAt)}
                                  required
                                />
                              </label>
                              <label className="field">
                                <span className="field__label">訂正後の登録終了</span>
                                <input
                                  className="field__control"
                                  type="datetime-local"
                                  name="revisedEndsAt"
                                  defaultValue={dateTimeInput(period.endsAt)}
                                />
                              </label>
                            </div>
                            <label className="field">
                              <span className="field__label">訂正根拠</span>
                              <textarea
                                className="field__control"
                                name="reason"
                                minLength={10}
                                maxLength={1000}
                                required
                              />
                            </label>
                            <label className="field field--checkbox">
                              <input type="checkbox" name="confirmed" required />
                              <span>
                                元履歴を残して訂正版を追加します。確定済み請求月に影響する訂正は保存できません
                              </span>
                            </label>
                            <button className="button button--secondary" type="submit">
                              正式登録期間の訂正版を保存
                            </button>
                          </form>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}
                {participant.supersededRegistrationHistory.length > 0 ? (
                  <details>
                    <summary>訂正前の正式登録期間を表示</summary>
                    <ul className="summary-list">
                      {participant.supersededRegistrationHistory.map((period) => (
                        <li key={period.id}>
                          <span>
                            {dateTime(period.startsAt)} から{' '}
                            {period.endsAt ? dateTime(period.endsAt) : '継続中'}
                          </span>
                          <strong>訂正前・参照専用</strong>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <div className="settings-stack service-template-preview">
        <h3>5. 将来月cutover</h3>
        {oemPreparation.billingPolicy ? (
          <p className="notice notice--success">
            {oemPreparation.billingPolicy.effectiveFrom.toISOString().slice(0, 7)}から正式登録課金
            V2へ切り替える予約があります。ここから変更・取消はできません。
          </p>
        ) : readiness.readyToSchedule ? (
          <form className="form-stack" action={actions.scheduleOemCutover}>
            <input type="hidden" name="workspaceId" value={workspaceId} />
            <label className="field">
              <span className="field__label">開始する利用月</span>
              <input className="field__control" type="month" name="month" required />
            </label>
            <label className="field">
              <span className="field__label">確認根拠</span>
              <textarea
                className="field__control"
                name="reason"
                minLength={10}
                maxLength={1000}
                required
              />
            </label>
            <label className="field field--checkbox">
              <input type="checkbox" name="historyReviewed" required />
              <span>全Service、契約期間、全参加者の初期履歴を確認しました</span>
            </label>
            <label className="field field--checkbox">
              <input type="checkbox" name="confirmed" required />
              <span>旧確定月を変更せず、指定した将来利用月から切り替えます</span>
            </label>
            <button className="button button--danger" type="submit">
              cutoverを予約
            </button>
          </form>
        ) : (
          <p className="notice notice--danger">
            予約できません。提供区分 {readiness.missingOfferingCount}件、正式登録{' '}
            {readiness.missingRegistrationCount}人、契約期間
            {readiness.contractHistoryReady ? '確認済み' : '未登録'}を確認してください。
          </p>
        )}
      </div>
    </section>
  );
}
