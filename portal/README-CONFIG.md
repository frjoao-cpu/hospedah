# Portal do Hóspede — Configuração necessária no Supabase

Este documento explica os passos **obrigatórios** que precisam ser realizados no
painel do Supabase (e no Google Cloud Console) para que o Portal do Hóspede
funcione 100%. As correções de código já foram aplicadas, mas alguns recursos
dependem de configuração externa.

---

## 1. Erro `Unsupported provider: provider is not enabled` ao clicar em "Entrar com Google"

Esse erro vem do Supabase porque o provedor Google **ainda não foi habilitado**
no projeto. O front-end já trata o erro mostrando uma mensagem amigável
("Login com Google temporariamente indisponível. Use e-mail e senha."),
mas para de fato permitir o login social você precisa:

### 1.1 — Criar credenciais OAuth no Google Cloud Console

1. Acesse https://console.cloud.google.com/ e selecione (ou crie) um projeto.
2. Vá em **APIs & Services → Credentials → + CREATE CREDENTIALS → OAuth client ID**.
3. Escolha **Web application**.
4. Em **Authorized JavaScript origins**, adicione:
   - `https://<SEU_DOMINIO>` (ex.: `https://hospedah.com.br`)
   - `https://<SEU_PROJETO>.supabase.co`
5. Em **Authorized redirect URIs**, adicione:
   - `https://<SEU_PROJETO>.supabase.co/auth/v1/callback`
6. Salve e copie o **Client ID** e o **Client Secret**.

### 1.2 — Habilitar o provedor no Supabase

1. Acesse o painel do projeto no Supabase.
2. Vá em **Authentication → Providers → Google**.
3. Marque **Enable Sign in with Google**.
4. Cole o **Client ID** e o **Client Secret** obtidos no passo anterior.
5. Clique em **Save**.

Após isso, o botão "Entrar com Google" no portal funcionará normalmente.

---

## 2. Cadastro / criação de conta — confirmação por e-mail

O fluxo de signup chama `supabase.auth.signUp({ ... })` com
`emailRedirectTo` apontando para `/portal/dashboard.html`. Para o e-mail de
confirmação chegar ao usuário e o link funcionar:

1. Em **Authentication → URL Configuration**, defina:
   - **Site URL**: `https://<SEU_DOMINIO>` (ex.: `https://hospedah.com.br`)
   - **Redirect URLs**: adicionar `https://<SEU_DOMINIO>/portal/dashboard.html`,
     `https://<SEU_DOMINIO>/portal/reset-password.html` e `http://localhost:*`
     (para testes locais).
2. Em **Authentication → Email Templates**, revise o template **Confirm signup**
   e personalize se desejar.
3. Em **Authentication → Providers → Email**, mantenha **Enable email provider**
   ativo. Se quiser permitir login imediato sem confirmação, desmarque
   **Confirm email** (não recomendado em produção).

---

## 3. Recuperação de senha pelo login

O botão **Esqueci minha senha** chama `supabase.auth.resetPasswordForEmail(...)`
e envia o usuário para `/portal/reset-password.html`. Para o fluxo funcionar:

1. Em **Authentication → URL Configuration**, confirme que
   `https://<SEU_DOMINIO>/portal/reset-password.html` está em **Redirect URLs**.
2. Em **Authentication → Email Templates**, revise o template **Reset Password**.
3. Teste com um e-mail cadastrado: o link recebido deve abrir a tela
   **Redefinir senha** já autenticada para salvar a nova senha.

---

## 4. Vouchers sem foto

O código foi corrigido para:
- mapear corretamente todos os resorts (Hot Beach, São Pedro Thermas,
  Olimpia, Solar das Águas, Wyndham, Juquehy, Ipioca, Porto 2 Life);
- usar uma imagem de fallback automática se a URL do banner falhar
  (`onerror` no `<img>`);
- escapar nomes/códigos para evitar problemas de renderização.

Se ainda assim algum voucher aparecer sem foto, verifique se o campo
`resort` no banco de dados Supabase está preenchido com o **nome do resort**
(ex.: `"Hot Beach Suites"`, `"Ipioca Beach Resort"`, etc.).

---

## 5. Verificação rápida

Após aplicar as configurações acima, teste no portal:

- [ ] Criar conta com e-mail/senha → recebe e-mail de confirmação.
- [ ] Login com e-mail/senha → entra no dashboard.
- [ ] Login com Google → abre popup do Google e retorna ao dashboard.
- [ ] Aba **Vouchers** → cards aparecem com foto do resort + QR code.
- [ ] Aba **Reservas** → cards aparecem com foto, datas e badge de status.

---

> Dúvidas sobre infraestrutura? Documentação oficial:
> https://supabase.com/docs/guides/auth/social-login/auth-google
