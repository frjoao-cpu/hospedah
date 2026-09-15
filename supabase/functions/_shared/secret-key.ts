// Helper compartilhado — resolve a chave de acesso servidor do Supabase.
//
// As chaves legadas SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY estão
// descontinuadas. O runtime passa a expor SUPABASE_PUBLISHABLE_KEYS e
// SUPABASE_SECRET_KEYS (JSON emitido via JWT Signing Keys), nos formatos
// sb_publishable_… e sb_secret_… respectivamente.
//
// Ordem de resolução (mantém compatibilidade durante a migração):
//   1. SUPABASE_SECRET_KEYS   → JSON { "<nome>": "sb_secret_…" }
//      (usa a chave "default" ou, na ausência dela, a primeira da lista)
//   2. SUPABASE_SECRET_KEY    → sb_secret_…
//   3. SUPABASE_SERVICE_ROLE_KEY → chave legada (fallback temporário)
export function getSupabaseSecretKey(): string {
    const secretKeysJson = Deno.env.get('SUPABASE_SECRET_KEYS');
    if (secretKeysJson) {
        try {
            const keys = JSON.parse(secretKeysJson) as Record<string, string>;
            if (keys && typeof keys === 'object') {
                const key = keys.default ?? Object.values(keys)[0];
                if (typeof key === 'string' && key) return key;
            }
        } catch {
            // JSON inválido — segue para os fallbacks.
        }
    }
    return Deno.env.get('SUPABASE_SECRET_KEY')
        ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
        ?? '';
}
