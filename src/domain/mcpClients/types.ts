export interface MpcClientMetadata {
  clientId: string;
  clientName: string;
  clientUri?: string;
  logoUri?: string;
  redirectUris: string[];
  rawJson: unknown;
  firstSeenAt: Date;
  lastSeenAt: Date;
  lastFetchedAt: Date;
}

