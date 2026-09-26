import type {OAuthTokens} from '../oauth';
import type {CloudClient} from '../provider';

export type OAuthProviderId = 'google' | 'dropbox' | 'onedrive';

/** A cloud with OAuth sign-in */
export interface OAuthProvider {
  id: OAuthProviderId;
  label: string;
  /** Client ID of the registered app; empty — the service isn't configured in this build */
  clientId: string;
  /** API origins the extension needs access to */
  origins: string[];
  /** Sign-in window; account — email or a name to show in the settings */
  signIn(): Promise<{tokens: OAuthTokens; account: string}>;
  /** A new token without the user; throws if the user must sign in again */
  refresh(tokens: OAuthTokens, account: string): Promise<OAuthTokens>;
  client(accessToken: string): CloudClient;
}
