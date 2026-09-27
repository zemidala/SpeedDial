// Clouds with OAuth sign-in. App Client IDs are set at build time in .env.local (see docs/cloud-setup.md)
import {dropbox} from './dropbox';
import {googleDrive} from './googleDrive';
import {oneDrive} from './oneDrive';
import type {OAuthProvider, OAuthProviderId} from './types';

export type {OAuthProvider, OAuthProviderId} from './types';

/**
 * Sign-in to Google Drive, Dropbox and OneDrive isn't finished: the apps aren't registered, sign-in is untested.
 * Meanwhile the services are listed as "in development" and can't be chosen, in every build. False once they work
 */
export const OAUTH_IN_DEVELOPMENT = true;

export const OAUTH_PROVIDERS: Record<OAuthProviderId, OAuthProvider> = {
  google: googleDrive(import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''),
  dropbox: dropbox(import.meta.env.VITE_DROPBOX_CLIENT_ID ?? ''),
  onedrive: oneDrive(import.meta.env.VITE_ONEDRIVE_CLIENT_ID ?? ''),
};

export function isOAuthProvider(id: unknown): id is OAuthProviderId {
  return typeof id === 'string' && id in OAUTH_PROVIDERS;
}
