/// <reference types="vite/client" />

/** Build-time versienummer, geïnjecteerd via vite.config.ts define. */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_OIDC_ISSUER: string;
  readonly VITE_OIDC_CLIENT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
