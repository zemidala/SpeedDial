// Облака со входом по OAuth. Client ID приложений задаются при сборке в .env.local (см. docs/cloud-setup.md)
import {dropbox} from './dropbox';
import {googleDrive} from './googleDrive';
import {oneDrive} from './oneDrive';
import type {OAuthProvider, OAuthProviderId} from './types';

export type {OAuthProvider, OAuthProviderId} from './types';

export const OAUTH_PROVIDERS: Record<OAuthProviderId, OAuthProvider> = {
  google: googleDrive(import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''),
  dropbox: dropbox(import.meta.env.VITE_DROPBOX_CLIENT_ID ?? ''),
  onedrive: oneDrive(import.meta.env.VITE_ONEDRIVE_CLIENT_ID ?? ''),
};

export function isOAuthProvider(id: unknown): id is OAuthProviderId {
  return typeof id === 'string' && id in OAUTH_PROVIDERS;
}
