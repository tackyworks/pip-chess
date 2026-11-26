/// <reference types="@cloudflare/workers-types" />

interface Env {
  SHARES: KVNamespace
  ASSETS: Fetcher
}

interface ShareMeta {
  title: string
  description: string
}
