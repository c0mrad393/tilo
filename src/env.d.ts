/** The version in package.json, put in at build time. */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** The server's public (anon) key; when set, accounts are on. See src/data/account.ts. */
  readonly VITE_TILO_ANON_KEY?: string;
}
