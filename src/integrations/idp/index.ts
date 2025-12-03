import { OktaProvider } from "./oktaProvider.js";
import type { IdpProvider, IdpType } from "./types.js";

const providers: Record<IdpType, IdpProvider> = {
  okta: new OktaProvider(),
  // Future providers: entra, auth0
};

export function getIdpProvider(type: IdpType): IdpProvider {
  const provider = providers[type];
  if (!provider) {
    throw new Error(`Unsupported IdP type: ${type}`);
  }
  return provider;
}

export * from "./types.js";
