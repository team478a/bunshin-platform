import type { Prisma, PrismaClient } from '@prisma/client';
export type MigrationManifest = {
  name: string;
  checksum: string;
  compatibleChecksums?: string[];
}[];
export type DatabaseShape = {
  tables: { name: string; columns: string[] }[];
  enums: { name: string; value: string }[];
};
export function gateFailureLabel(error: unknown): string;
export function readMigrationManifest(directory?: URL): Promise<MigrationManifest>;
export function requiredDatabaseShape(datamodel?: typeof Prisma.dmmf.datamodel): DatabaseShape;
export function deploymentDatabaseUrl(source: string | undefined): string;
export function inspectDeploymentSnapshot(
  tx: Prisma.TransactionClient,
  manifest: MigrationManifest,
  required: DatabaseShape,
): Promise<{ migrations: number; tables: number; enums: number }>;
export function verifyDeploymentDatabase(
  client: PrismaClient,
  manifest: MigrationManifest,
  required?: DatabaseShape,
): ReturnType<typeof inspectDeploymentSnapshot>;
