export type ExternalTrackingConfiguration = {
  systems: Array<{
    id: string;
    name: string;
    status: string;
    resultIngestTokenPrefix: string | null;
    resultIngestTokenCreatedAt: string | null;
    lastResultReceivedAt: string | null;
    allowedDomains: Array<{ id: string; hostname: string; status: string }>;
  }>;
  links: Array<{
    id: string;
    name: string;
    url: string;
    scopeType: string;
    effectiveStatus: string;
    startsAt: string | null;
    expiresAt: string | null;
    system: { name: string };
    productPack: { name: string } | null;
    campaign: { name: string } | null;
  }>;
  members: Array<{
    id: string;
    role: string;
    consentedAt: string | null;
    identityConfigured: boolean;
    activeLinkCount: number;
    user: { displayName: string; email: string | null };
  }>;
  usages: Array<{
    id: string;
    createdAt: string;
    insertedUrlSnapshot: string;
    linkNameSnapshot: string;
    expiresAtSnapshot: string | null;
    groupMembership: { user: { displayName: string } };
    productPack: { name: string };
    campaign: { name: string } | null;
    dailyMission: { missionDate: string; format: string };
  }>;
  audits: Array<{ id: string; action: string; performedAt: string }>;
  resultTotals: Array<{
    metricType: string;
    currency: string | null;
    count: number;
    amountMinor: number;
  }>;
  results: Array<{
    id: string;
    metricType: string;
    count: number;
    amountMinor: number | null;
    currency: string | null;
    occurredAt: string;
    system: { name: string };
    externalTrackingLink: { name: string } | null;
    memberIdentity: { groupMembership: { user: { displayName: string } } } | null;
  }>;
};

export type ExternalTrackingResultConnection = {
  token: string;
  endpointPath: string;
  endpointUrl: string;
};
