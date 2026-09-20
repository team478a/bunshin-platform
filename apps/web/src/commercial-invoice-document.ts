import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createElement, type CSSProperties, type ReactNode } from 'react';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import satori from 'satori';
import { z } from 'zod';

const nullableText = z.string().nullable();

export const commercialInvoiceDocumentSnapshotSchema = z.object({
  version: z.literal(1),
  invoiceNumber: z.string(),
  issuedAt: z.iso.datetime(),
  dueAt: z.iso.datetime(),
  periodStart: z.iso.datetime(),
  periodEnd: z.iso.datetime(),
  description: z.string(),
  quantity: z.literal(1),
  taxRatePercent: z.literal(10),
  subtotalYen: z.number().int().nonnegative(),
  taxYen: z.number().int().nonnegative(),
  totalYen: z.number().int().positive(),
  issuer: z.object({
    name: z.string(),
    postalCode: nullableText,
    address: z.string(),
    registrationNumber: nullableText,
  }),
  recipient: z.object({
    name: z.string(),
    email: z.email(),
    organizationName: z.string(),
    address: nullableText,
  }),
});

export type CommercialInvoiceDocumentSnapshot = z.infer<
  typeof commercialInvoiceDocumentSnapshotSchema
>;

export function currentPlatformBillingIssuer() {
  return {
    name: process.env.PLATFORM_BILLING_ISSUER_NAME?.trim() || '和愛株式会社',
    postalCode: process.env.PLATFORM_BILLING_ISSUER_POSTAL_CODE?.trim() || null,
    address:
      process.env.PLATFORM_BILLING_ISSUER_ADDRESS?.trim() || '兵庫県神戸市北区大沢町簾326番地の1',
    registrationNumber: process.env.PLATFORM_BILLING_INVOICE_REGISTRATION_NUMBER?.trim() || null,
  };
}

const yen = (value: number) => `${value.toLocaleString('ja-JP')}円`;
const date = (value: string) =>
  new Date(value).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' });
const inclusivePeriodEnd = (value: string) =>
  new Date(new Date(value).getTime() - 86_400_000).toLocaleDateString('ja-JP', {
    timeZone: 'Asia/Tokyo',
  });

const row = (label: string, value: ReactNode, options: CSSProperties = {}) =>
  createElement(
    'div',
    {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        borderBottom: '1px solid #d8dee9',
        padding: '16px 4px',
        ...options,
      },
    },
    createElement('span', { style: { color: '#536176' } }, label),
    createElement('span', { style: { fontWeight: 700 } }, value),
  );

async function invoiceJpeg(snapshot: CommercialInvoiceDocumentSnapshot): Promise<Buffer> {
  const fontDirectory = join(process.cwd(), 'assets/fonts/noto-sans-jp');
  const [regular, bold] = await Promise.all([
    readFile(join(fontDirectory, 'NotoSansCJKjp-Regular.otf')),
    readFile(join(fontDirectory, 'NotoSansCJKjp-Bold.otf')),
  ]);
  const body = createElement(
    'div',
    {
      lang: 'ja-JP',
      style: {
        width: '1240px',
        height: '1754px',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#ffffff',
        color: '#172033',
        fontFamily: 'Noto Sans JP',
        padding: '96px 100px',
        fontSize: '28px',
      },
    },
    createElement(
      'div',
      { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } },
      createElement(
        'div',
        { style: { display: 'flex', flexDirection: 'column' } },
        createElement('div', { style: { fontSize: '58px', fontWeight: 700 } }, '請求書'),
        createElement(
          'div',
          { style: { marginTop: '16px', color: '#536176' } },
          snapshot.invoiceNumber,
        ),
      ),
      createElement(
        'div',
        { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end' } },
        createElement('div', null, `発行日：${date(snapshot.issuedAt)}`),
        createElement('div', { style: { marginTop: '10px' } }, `支払期限：${date(snapshot.dueAt)}`),
      ),
    ),
    createElement(
      'div',
      { style: { display: 'flex', justifyContent: 'space-between', marginTop: '80px' } },
      createElement(
        'div',
        { style: { width: '52%', display: 'flex', flexDirection: 'column' } },
        createElement('div', { style: { color: '#536176', fontSize: '22px' } }, '請求先'),
        createElement(
          'div',
          { style: { fontSize: '38px', fontWeight: 700, marginTop: '12px' } },
          `${snapshot.recipient.name} 御中`,
        ),
        snapshot.recipient.address
          ? createElement('div', { style: { marginTop: '14px' } }, snapshot.recipient.address)
          : null,
        createElement(
          'div',
          { style: { color: '#536176', marginTop: '8px', fontSize: '22px' } },
          snapshot.recipient.email,
        ),
      ),
      createElement(
        'div',
        {
          style: { width: '42%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' },
        },
        createElement(
          'div',
          { style: { fontWeight: 700, fontSize: '32px' } },
          snapshot.issuer.name,
        ),
        snapshot.issuer.postalCode
          ? createElement(
              'div',
              { style: { marginTop: '10px' } },
              `〒${snapshot.issuer.postalCode}`,
            )
          : null,
        createElement(
          'div',
          { style: { marginTop: '6px', textAlign: 'right' } },
          snapshot.issuer.address,
        ),
        snapshot.issuer.registrationNumber
          ? createElement(
              'div',
              { style: { marginTop: '10px' } },
              `登録番号：${snapshot.issuer.registrationNumber}`,
            )
          : null,
      ),
    ),
    createElement(
      'div',
      {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#f1f5fb',
          borderLeft: '10px solid #3559d7',
          padding: '28px 34px',
          marginTop: '74px',
        },
      },
      createElement('span', { style: { fontWeight: 700 } }, 'ご請求金額（税込）'),
      createElement(
        'span',
        { style: { fontSize: '48px', fontWeight: 700 } },
        yen(snapshot.totalYen),
      ),
    ),
    createElement(
      'div',
      { style: { display: 'flex', flexDirection: 'column', marginTop: '56px' } },
      createElement(
        'div',
        {
          style: {
            display: 'flex',
            backgroundColor: '#172033',
            color: '#ffffff',
            padding: '16px 20px',
          },
        },
        createElement('span', { style: { width: '62%' } }, '内容'),
        createElement('span', { style: { width: '13%', textAlign: 'right' } }, '数量'),
        createElement('span', { style: { width: '25%', textAlign: 'right' } }, '金額'),
      ),
      createElement(
        'div',
        { style: { display: 'flex', padding: '24px 20px', borderBottom: '1px solid #d8dee9' } },
        createElement(
          'div',
          { style: { width: '62%', display: 'flex', flexDirection: 'column' } },
          createElement('span', null, snapshot.description),
          createElement(
            'span',
            { style: { color: '#536176', fontSize: '21px', marginTop: '7px' } },
            `${date(snapshot.periodStart)}〜${inclusivePeriodEnd(snapshot.periodEnd)}`,
          ),
        ),
        createElement('span', { style: { width: '13%', textAlign: 'right' } }, '1'),
        createElement(
          'span',
          { style: { width: '25%', textAlign: 'right', fontWeight: 700 } },
          yen(snapshot.totalYen),
        ),
      ),
    ),
    createElement(
      'div',
      { style: { display: 'flex', justifyContent: 'flex-end', marginTop: '32px' } },
      createElement(
        'div',
        { style: { width: '48%', display: 'flex', flexDirection: 'column' } },
        row('税抜金額', yen(snapshot.subtotalYen)),
        row(`消費税（${snapshot.taxRatePercent}%）`, yen(snapshot.taxYen)),
        row('合計', yen(snapshot.totalYen), { fontSize: '34px' }),
      ),
    ),
    createElement(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          marginTop: 'auto',
          borderTop: '2px solid #d8dee9',
          paddingTop: '28px',
          color: '#536176',
          fontSize: '21px',
        },
      },
      createElement('span', null, 'お支払い状況はワタシワークスの団体管理画面で確認できます。'),
      createElement(
        'span',
        { style: { marginTop: '8px' } },
        'この請求書は電子的に発行されています。',
      ),
    ),
  );
  const svg = await satori(body, {
    width: 1240,
    height: 1754,
    fonts: [
      { name: 'Noto Sans JP', data: regular, weight: 400, style: 'normal' },
      { name: 'Noto Sans JP', data: bold, weight: 700, style: 'normal' },
    ],
  });
  return sharp(new Resvg(svg).render().asPng())
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
    .toBuffer();
}

function jpegPdf(jpeg: Buffer, width: number, height: number): Buffer {
  const objects: Buffer[] = [];
  const object = (value: string | Buffer) =>
    objects.push(Buffer.isBuffer(value) ? value : Buffer.from(value));
  object('<< /Type /Catalog /Pages 2 0 R >>');
  object('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>',
  );
  object(
    Buffer.concat([
      Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
      ),
      jpeg,
      Buffer.from('\nendstream'),
    ]),
  );
  const content = Buffer.from('q 595.28 0 0 841.89 0 0 cm /Im0 Do Q');
  object(Buffer.from(`<< /Length ${content.length} >>\nstream\n${content.toString()}\nendstream`));

  const chunks = [Buffer.from('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n', 'binary')];
  const offsets = [0];
  let offset = chunks[0]!.length;
  objects.forEach((value, index) => {
    offsets.push(offset);
    const wrapped = Buffer.concat([
      Buffer.from(`${index + 1} 0 obj\n`),
      value,
      Buffer.from('\nendobj\n'),
    ]);
    chunks.push(wrapped);
    offset += wrapped.length;
  });
  const xrefOffset = offset;
  const xref = [
    `xref\n0 ${objects.length + 1}\n`,
    '0000000000 65535 f \n',
    ...offsets.slice(1).map((value) => `${value.toString().padStart(10, '0')} 00000 n \n`),
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`,
  ].join('');
  chunks.push(Buffer.from(xref));
  return Buffer.concat(chunks);
}

export async function renderCommercialInvoicePdf(
  value: unknown,
): Promise<{ snapshot: CommercialInvoiceDocumentSnapshot; pdf: Buffer }> {
  const snapshot = commercialInvoiceDocumentSnapshotSchema.parse(value);
  return { snapshot, pdf: jpegPdf(await invoiceJpeg(snapshot), 1240, 1754) };
}
