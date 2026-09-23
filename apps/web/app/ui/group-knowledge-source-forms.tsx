import type { FormEvent, RefObject } from 'react';
import type { ProductVersionOption } from './group-knowledge-types';

function ProductScopeField({ productVersions }: { productVersions: ProductVersionOption[] }) {
  return (
    <label className="field">
      <span className="field__label">この資料を使う範囲</span>
      <select className="field__control" name="productPackVersionId" defaultValue="">
        <option value="">グループのすべての投稿で使う</option>
        {productVersions.map((item) => (
          <option key={item.id} value={item.id}>
            商品「{item.label}」の投稿だけで使う
          </option>
        ))}
      </select>
      <small>商品専用の資料を選ぶと、その商品の投稿では共通資料より優先して使います。</small>
    </label>
  );
}

export function GroupKnowledgeSourceForms({
  fileForm,
  urlForm,
  textForm,
  productVersions,
  saving,
  saveFile,
  saveSimple,
}: {
  fileForm: RefObject<HTMLFormElement | null>;
  urlForm: RefObject<HTMLFormElement | null>;
  textForm: RefObject<HTMLFormElement | null>;
  productVersions: ProductVersionOption[];
  saving: boolean;
  saveFile: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  saveSimple: (event: FormEvent<HTMLFormElement>, type: 'URL' | 'TEXT') => void | Promise<void>;
}) {
  return (
    <>
      <section className="settings-card knowledge-upload-card">
        <div className="knowledge-section-heading">
          <div>
            <p className="eyebrow">いちばん簡単な方法</p>
            <h2>資料をアップロード</h2>
          </div>
          <span className="knowledge-type-badge">PDF・動画</span>
        </div>
        <p>PDFや動画をまとめて選べます。資料名はファイル名から自動で入ります。</p>
        <form ref={fileForm} className="form-stack" onSubmit={(event) => void saveFile(event)}>
          <label className="field">
            <span className="field__label">ファイルを選ぶ</span>
            <input
              className="field__control"
              name="file"
              type="file"
              accept="application/pdf,video/mp4,video/quicktime"
              multiple
              required
            />
            <small>一度に10件まで選べます。PDFは1件50MBまで、動画は1件25MBまでです。</small>
          </label>
          <label className="field">
            <span className="field__label">1件だけ選ぶ場合の名前（書かなくても大丈夫）</span>
            <input
              className="field__control"
              name="title"
              maxLength={200}
              placeholder="空欄ならファイル名を使います"
            />
          </label>
          <ProductScopeField productVersions={productVersions} />
          <label className="field">
            <span>
              <input name="rightsConfirmed" type="checkbox" required />
              この資料をワタシワークスで使っても大丈夫です
            </span>
          </label>
          <button className="button button--primary" type="submit" disabled={saving}>
            選んだ資料をまとめて追加する
          </button>
        </form>
      </section>

      <section className="settings-card knowledge-add-card">
        <div className="knowledge-section-heading">
          <h2>公式Webページを追加</h2>
          <span className="knowledge-type-badge">URL</span>
        </div>
        <p>商品ページや公開FAQのURLを登録できます。</p>
        <form
          ref={urlForm}
          className="form-stack"
          onSubmit={(event) => void saveSimple(event, 'URL')}
        >
          <label className="field">
            <span className="field__label">名前（書かなくても大丈夫）</span>
            <input className="field__control" name="title" maxLength={200} />
          </label>
          <label className="field">
            <span className="field__label">WebページのURL</span>
            <input
              className="field__control"
              name="sourceUri"
              type="url"
              inputMode="url"
              required
              placeholder="https://example.jp/faq"
            />
          </label>
          <ProductScopeField productVersions={productVersions} />
          <button className="button button--primary" type="submit" disabled={saving}>
            Webページを保存する
          </button>
        </form>
      </section>

      <section className="settings-card knowledge-add-card">
        <div className="knowledge-section-heading">
          <h2>文章を直接追加</h2>
          <span className="knowledge-type-badge">FAQ・説明文</span>
        </div>
        <p>短いFAQや社内で決めた説明文は、そのまま入力できます。</p>
        <form
          ref={textForm}
          className="form-stack"
          onSubmit={(event) => void saveSimple(event, 'TEXT')}
        >
          <label className="field">
            <span className="field__label">名前（書かなくても大丈夫）</span>
            <input className="field__control" name="title" maxLength={200} />
          </label>
          <label className="field">
            <span className="field__label">内容</span>
            <textarea
              className="field__control"
              name="content"
              maxLength={8000}
              rows={8}
              required
              placeholder="例：Q. 返品できますか？ A. 商品到着後7日以内に…"
            />
          </label>
          <ProductScopeField productVersions={productVersions} />
          <button className="button button--primary" type="submit" disabled={saving}>
            文章を保存する
          </button>
        </form>
      </section>
    </>
  );
}
