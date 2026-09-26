import type {OAuthTokens} from '../oauth';
import type {CloudClient} from '../provider';

export type OAuthProviderId = 'google' | 'dropbox' | 'onedrive';

/** Облако со входом по OAuth */
export interface OAuthProvider {
  id: OAuthProviderId;
  label: string;
  /** Client ID зарегистрированного приложения; пустой — сервис не настроен в этой сборке */
  clientId: string;
  /** Адреса API, к которым расширению нужен доступ */
  origins: string[];
  /** Окно входа; account — email или имя для показа в настройках */
  signIn(): Promise<{tokens: OAuthTokens; account: string}>;
  /** Новый токен без участия пользователя; бросает ошибку, если нужно войти заново */
  refresh(tokens: OAuthTokens, account: string): Promise<OAuthTokens>;
  client(accessToken: string): CloudClient;
}
