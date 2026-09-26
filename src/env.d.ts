/// <reference types="vite/client" />

// Client ID приложений для облачных копий; задаются в .env.local (см. docs/cloud-setup.md)
interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_DROPBOX_CLIENT_ID?: string;
  readonly VITE_ONEDRIVE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
