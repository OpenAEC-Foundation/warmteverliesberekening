/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OIDC_ISSUER: string;
  readonly VITE_OIDC_CLIENT_ID: string;
  readonly VITE_REPORTS_API_URL?: string;
  readonly VITE_REPORTS_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
