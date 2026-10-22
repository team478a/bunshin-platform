import { readFileSync } from 'node:fs';
import { X509Certificate } from 'node:crypto';
import { fileURLToPath } from 'node:url';

/** Reviewed public CA shared by the migration and read-only readiness runners. */
export function releaseCaPath() {
  const path = fileURLToPath(new URL('./certs/supabase-prod-ca-2021.crt', import.meta.url));
  const ca = new X509Certificate(readFileSync(path));
  if (
    !ca.ca ||
    ca.fingerprint256 !==
      '80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA' ||
    Date.now() < Date.parse(ca.validFrom) ||
    Date.now() >= Date.parse(ca.validTo)
  )
    throw new Error('INVALID_RELEASE_CA');
  return path;
}
