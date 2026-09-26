/// <reference types="vite/client" />

// App Client IDs for cloud backups; set in .env.local (see docs/cloud-setup.md)
interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_DROPBOX_CLIENT_ID?: string;
  readonly VITE_ONEDRIVE_CLIENT_ID?: string;
  /** "Support the author" page (Boosty); a placeholder is used when it's not set */
  readonly VITE_SUPPORT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Build identity injected by vite.config.ts */
declare const __BUILD_INFO__: {number: number; commit: string; date: string};
