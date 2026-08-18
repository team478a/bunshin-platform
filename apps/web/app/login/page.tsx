export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const query = await searchParams;
  return (
    <main>
      <h1>BUNSHINへログイン</h1>
      <p>メールに届く一度限りのリンクでログインします。</p>
      {query.sent === '1' && <p>メールを送信しました。受信箱をご確認ください。</p>}
      {query.error === '1' && <p>ログインを完了できませんでした。もう一度お試しください。</p>}
      <form action="/auth/email" method="post">
        <label htmlFor="email">メールアドレス</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
        <button type="submit">ログインリンクを送る</button>
      </form>
    </main>
  );
}
