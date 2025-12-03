import { OktaProvider } from "./oktaProvider.js";
import type { IdpProvider, IdpType } from "./types.js";

class UnsupportedIdpProvider implements IdpProvider {
  type: IdpType;

  constructor(type: IdpType) {
    this.type = type;
  }

  async getAccessTokenForNhi(): Promise<string> {
    throw new Error(`IdP provider ${this.type} is not yet implemented`);
  }
}

const providers: Record<IdpType, IdpProvider> = {
  okta: new OktaProvider(),
  entra: new UnsupportedIdpProvider("entra"),
};

export function getIdpProvider(type: IdpType): IdpProvider {
  const provider = providers[type];
  if (!provider) {
    throw new Error(`Unsupported IdP type: ${type}`);
  }
  return provider;
}

export * from "./types.js";
