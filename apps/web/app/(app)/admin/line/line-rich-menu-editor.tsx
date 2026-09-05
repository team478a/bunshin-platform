'use client';
import { useState, type FormEvent } from 'react';

type Menu = {
  id: string;
  version: number;
  name: string;
  description: string | null;
  status: 'DRAFT' | 'VERIFIED' | 'ACTIVE' | 'DISABLED' | 'ERROR';
  imageWidth: number;
  imageHeight: number;
  lineRichMenuId: string | null;
  lastSyncedAt: string | null;
  lastErrorCategory: string | null;
};
const statusName = {
  DRAFT: '下書き',
  VERIFIED: '確認済み',
  ACTIVE: '公開中',
  DISABLED: '停止中',
  ERROR: 'エラー',
};

export function LineRichMenuEditor(props: { environment: string; initialMenus: Menu[] }) {
  const [menus, setMenus] = useState(props.initialMenus);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/admin/line-rich-menus', { method: 'POST', body: form });
    const result = (await response.json()) as { data?: Menu; error?: { message?: string } };
    if (!response.ok || !result.data) setMessage(result.error?.message ?? '保存できませんでした。');
    else {
      setMenus((current) => [result.data!, ...current]);
      setMessage('下書きを保存しました。内容を確認して「確認済みにする」を押してください。');
      event.currentTarget.reset();
    }
    setBusy(false);
  }

  async function createDefault() {
    const reason = window.prompt(
      '標準メニューを作る理由を入力してください。',
      '標準メニューを利用する',
    );
    if (!reason) return;
    setBusy(true);
    setMessage('標準メニューを作成しています。');
    const response = await fetch('/api/admin/line-rich-menus/default', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    const result = (await response.json()) as { data?: Menu; error?: { message?: string } };
    if (!response.ok || !result.data)
      setMessage(result.error?.message ?? '標準メニューを作成できませんでした。');
    else {
      setMenus((current) => [result.data!, ...current]);
      setMessage(
        '標準メニューの下書きを作成しました。画像を確認して「確認済みにする」を押してください。',
      );
    }
    setBusy(false);
  }

  async function action(menu: Menu, name: 'verify' | 'publish' | 'disable') {
    const labels = { verify: '確認済みにする', publish: '公開する', disable: '停止する' };
    const reason = window.prompt(`${labels[name]}理由を入力してください。`);
    if (!reason) return;
    if (
      name === 'publish' &&
      props.environment === 'PRODUCTION' &&
      !window.confirm('本番のLINEメニューを切り替えます。画像と4つのボタンを確認しましたか？')
    )
      return;
    if (name === 'disable' && !window.confirm('LINEのメニューを停止します。よろしいですか？'))
      return;
    setBusy(true);
    setMessage('LINEと通信しています。画面を閉じずにお待ちください。');
    const response = await fetch(`/api/admin/line-rich-menus/${menu.id}/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    const result = (await response.json()) as { data?: Menu; error?: { message?: string } };
    if (!response.ok || !result.data) setMessage(result.error?.message ?? '操作できませんでした。');
    else {
      setMenus((current) =>
        current.map((item) =>
          item.id === menu.id
            ? result.data!
            : name === 'publish' && item.status === 'ACTIVE'
              ? { ...item, status: 'DISABLED' }
              : item,
        ),
      );
      setMessage(
        name === 'verify'
          ? '内容を確認済みにしました。公開できる状態です。'
          : name === 'publish'
            ? 'LINEのメニューを公開しました。'
            : 'LINEのメニューを停止しました。',
      );
    }
    setBusy(false);
  }

  return (
    <section aria-labelledby="rich-menu-heading">
      <h2 id="rich-menu-heading">LINEの下に出すメニュー</h2>
      <p>画像を1枚選ぶだけで、4つのボタンを作れます。リンク先は安全のため固定です。</p>
      <ol>
        <li>画像と並び方を選んで下書きを保存</li>
        <li>内容を見直して確認済みにする</li>
        <li>公開する</li>
      </ol>
      <p>4つのボタン：今日やること／分身を見る／お知らせ設定／アカウント</p>
      {message ? <p role="status">{message}</p> : null}
      <div>
        <h3>かんたん設定</h3>
        <p>画像を用意できない場合は、システム標準の画像とボタン配置を自動で作成します。</p>
        <button type="button" disabled={busy} onClick={() => void createDefault()}>
          標準メニューを作成
        </button>
      </div>
      <h3>画像を自分で設定</h3>
      <form onSubmit={(event) => void create(event)}>
        <label>
          メニューの名前
          <input name="name" required maxLength={120} placeholder="例：いつものメニュー" />
        </label>
        <label>
          説明（なくても大丈夫です）
          <input name="description" maxLength={500} />
        </label>
        <label>
          ボタンの並び方
          <select name="template" defaultValue="FOUR_COLUMNS" required>
            <option value="FOUR_COLUMNS">横に4つ（画像：2500×843 または 2500×1686）</option>
            <option value="TWO_BY_TWO">上に2つ・下に2つ（画像：2500×1686）</option>
          </select>
        </label>
        <label>
          メニュー画像（PNGまたはJPEG、1MB以内）
          <input name="image" type="file" accept="image/png,image/jpeg" required />
        </label>
        <label>
          作る理由
          <input
            name="reason"
            required
            minLength={3}
            maxLength={500}
            placeholder="例：最初のメニューを作る"
          />
        </label>
        <button type="submit" disabled={busy}>
          下書きを保存
        </button>
      </form>
      <h3>保存したメニュー</h3>
      {menus.length === 0 ? <p>まだメニューはありません。</p> : null}
      <ul>
        {menus.map((menu) => (
          <li key={menu.id}>
            <strong>
              第{menu.version}版「{menu.name}」／{statusName[menu.status]}
            </strong>
            <p>
              画像：{menu.imageWidth}×{menu.imageHeight}
              {menu.description ? ` ／ ${menu.description}` : ''}
            </p>
            <img
              src={`/api/admin/line-rich-menus/${menu.id}/image`}
              alt={`第${menu.version}版「${menu.name}」の確認画像`}
              width={500}
              height={Math.round((500 * menu.imageHeight) / menu.imageWidth)}
            />
            <p>
              最終同期：{menu.lastSyncedAt ?? 'まだLINEへ送っていません'}
              {menu.lastErrorCategory ? ` ／ エラー：${menu.lastErrorCategory}` : ''}
            </p>
            {menu.status === 'DRAFT' || menu.status === 'ERROR' ? (
              <button disabled={busy} onClick={() => void action(menu, 'verify')}>
                確認済みにする
              </button>
            ) : null}
            {menu.status === 'VERIFIED' ? (
              <button disabled={busy} onClick={() => void action(menu, 'publish')}>
                LINEで公開する
              </button>
            ) : null}
            {menu.status === 'ACTIVE' ? (
              <button disabled={busy} onClick={() => void action(menu, 'disable')}>
                公開を停止する
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
