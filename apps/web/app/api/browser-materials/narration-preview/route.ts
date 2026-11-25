import { browserPilotEnvironment } from '@bunshin/capability-browser';
import { getServerEnvironment } from '@bunshin/config';

export async function GET(request: Request) {
  const environment = browserPilotEnvironment(getServerEnvironment().APP_ENV);
  const voice = new URL(request.url).searchParams.get('voice');
  if (!environment || (voice !== 'shiori' && voice !== 'daichi'))
    return new Response(null, { status: 404 });
  const { prisma } = await import('@bunshin/database');
  const shiori = voice === 'shiori';
  const config = await prisma.browserMaterialSpeechConfiguration.findFirst({
    where: { environment, enabled: true, workspace: { status: 'ACTIVE' } },
    select: { shioriPreview: shiori, daichiPreview: !shiori },
  });
  const audio = shiori ? config?.shioriPreview : config?.daichiPreview;
  return audio
    ? new Response(new Uint8Array(audio), {
        headers: {
          'content-type': 'audio/wav',
          'cache-control': 'private, no-store',
          'x-content-type-options': 'nosniff',
        },
      })
    : new Response(null, { status: 404 });
}
