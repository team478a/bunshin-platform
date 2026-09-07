import sharp from 'sharp';

// A generic 9:16 cover, containing no private video frames or recipient data.
const cover = () =>
  sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="540" height="960" viewBox="0 0 540 960"><rect width="540" height="960" fill="#0b3470"/><circle cx="270" cy="480" r="96" fill="#ffffff"/><path d="M245 430 L245 530 L320 480 Z" fill="#0b3470"/></svg>`,
    ),
  )
    .png()
    .toBuffer();

export async function GET() {
  const bytes = await cover();
  return new Response(new Uint8Array(bytes), {
    headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' },
  });
}
