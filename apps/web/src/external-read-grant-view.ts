import { z } from 'zod';
export const externalGrantViewSchema = z
  .object({
    version: z.literal('external-grant-owner-v1'),
    consentVersion: z.literal('external-read-consent-v1'),
    targetName: z.string().min(1).max(100),
    managementAvailable: z.boolean(),
    clients: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
            name: z.string().min(1).max(160),
          })
          .strict(),
      )
      .max(10),
    grants: z
      .array(
        z
          .object({
            id: z.uuid(),
            clientName: z.string().min(1).max(160),
            revision: z.number().int().positive(),
            state: z.enum(['ACTIVE', 'EXPIRED', 'REVOKED']),
            grantedAt: z.iso.datetime(),
            expiresAt: z.iso.datetime(),
          })
          .strict(),
      )
      .max(50),
  })
  .strict();
export type ExternalGrantOwnerView = z.infer<typeof externalGrantViewSchema>;
