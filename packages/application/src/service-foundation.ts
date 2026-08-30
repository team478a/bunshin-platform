import { ApplicationError } from '@bunshin/shared';

export const SERVICE_VISIBILITIES = ['PUBLIC', 'PRIVATE'] as const;
export type ServiceVisibility = (typeof SERVICE_VISIBILITIES)[number];

export const SERVICE_REGISTRATION_MODES = [
  'PUBLIC',
  'INVITATION_ONLY',
  'APPROVAL_REQUIRED',
  'CLOSED',
] as const;
export type ServiceRegistrationMode = (typeof SERVICE_REGISTRATION_MODES)[number];

export interface ServiceFoundationRecord {
  id: string;
  workspaceId: string;
  groupId: string;
  slug: string;
  displayName: string;
  description: string;
  operatorName: string;
  contactEmail: string | null;
  visibility: ServiceVisibility;
  poweredByEnabled: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  termsUrl: string | null;
  privacyUrl: string | null;
  brand: {
    logoUrl: string | null;
    iconUrl: string | null;
    faviconUrl: string | null;
    primaryColor: string;
    secondaryColor: string;
    fontFamily: string;
  };
  registration: {
    mode: ServiceRegistrationMode;
    emailEnabled: boolean;
    lineEnabled: boolean;
    inviteCodeEnabled: boolean;
    referralEnabled: boolean;
    onboardingConfig: unknown;
    surveyConfig: unknown;
  };
}

export interface ServiceFoundationRepository {
  save(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
    reason: string;
    configuration: Omit<ServiceFoundationRecord, 'id' | 'workspaceId' | 'groupId'>;
  }): Promise<ServiceFoundationRecord | null>;
  findByGroup(input: {
    workspaceId: string;
    groupId: string;
    actorUserId: string;
  }): Promise<ServiceFoundationRecord | null>;
  findPublicBySlug(input: { slug: string; now: Date }): Promise<ServiceFoundationRecord | null>;
}

const text = (value: string, field: string, maximum: number) => {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maximum)
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return normalized;
};

const optionalText = (value: string | null, field: string, maximum: number) =>
  value === null ? null : text(value, field, maximum);

const httpsUrl = (value: string | null, field: string) => {
  if (value === null) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username !== '' ||
      url.password !== '' ||
      url.search !== '' ||
      url.hash !== ''
    )
      throw new Error('unsafe');
    return url.toString();
  } catch {
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  }
};

const color = (value: string, field: string) => {
  const normalized = value.toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(normalized))
    throw new ApplicationError('VALIDATION_ERROR', `invalid ${field}`);
  return normalized;
};

export class ServiceFoundationService {
  constructor(private readonly repository: ServiceFoundationRepository) {}

  async save(
    input: Parameters<ServiceFoundationRepository['save']>[0],
  ): Promise<ServiceFoundationRecord> {
    const { configuration } = input;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(configuration.slug))
      throw new ApplicationError('VALIDATION_ERROR', 'invalid slug');
    if (
      configuration.startsAt !== null &&
      configuration.endsAt !== null &&
      configuration.startsAt >= configuration.endsAt
    )
      throw new ApplicationError('VALIDATION_ERROR', 'invalid service period');
    if (!configuration.registration.emailEnabled && !configuration.registration.lineEnabled)
      throw new ApplicationError('VALIDATION_ERROR', 'at least one registration provider required');

    const result = await this.repository.save({
      ...input,
      reason: text(input.reason, 'reason', 1000),
      configuration: {
        ...configuration,
        displayName: text(configuration.displayName, 'displayName', 120),
        description: text(configuration.description, 'description', 1000),
        operatorName: text(configuration.operatorName, 'operatorName', 160),
        contactEmail: optionalText(configuration.contactEmail, 'contactEmail', 320),
        termsUrl: httpsUrl(configuration.termsUrl, 'termsUrl'),
        privacyUrl: httpsUrl(configuration.privacyUrl, 'privacyUrl'),
        brand: {
          ...configuration.brand,
          logoUrl: httpsUrl(configuration.brand.logoUrl, 'logoUrl'),
          iconUrl: httpsUrl(configuration.brand.iconUrl, 'iconUrl'),
          faviconUrl: httpsUrl(configuration.brand.faviconUrl, 'faviconUrl'),
          primaryColor: color(configuration.brand.primaryColor, 'primaryColor'),
          secondaryColor: color(configuration.brand.secondaryColor, 'secondaryColor'),
          fontFamily: text(configuration.brand.fontFamily, 'fontFamily', 120),
        },
      },
    });
    if (result === null)
      throw new ApplicationError('FORBIDDEN', 'service configuration management denied');
    return result;
  }

  async findByGroup(input: Parameters<ServiceFoundationRepository['findByGroup']>[0]) {
    const result = await this.repository.findByGroup(input);
    if (result === null) throw new ApplicationError('NOT_FOUND', 'service not found');
    return result;
  }

  async findPublicBySlug(input: { slug: string; now?: Date }) {
    const result = await this.repository.findPublicBySlug({
      slug: input.slug,
      now: input.now ?? new Date(),
    });
    if (result === null) throw new ApplicationError('NOT_FOUND', 'service not found');
    return result;
  }
}
