# Supabase · configuração do painel (Área do Aluno)

Projeto: `https://qfghgtrvwklzlsuawndm.supabase.co`. Quem altera o painel e roda SQL é a equipe GPM.
Os nomes dos menus podem mudar um pouco entre versões do painel; procure pelo nome da opção.

**Importante:** a 0006 e a 0007 substituem funções, políticas e privilégios das migrations anteriores. Se alguma migration anterior for rodada de novo, rode as seguintes logo depois, em ordem.
**Ordem de publicação:** rode a 0006 e a 0007 no Supabase **antes** de publicar o site (as páginas novas leem as colunas e a tabela novas).

## 1. SQL (nesta ordem)

No painel: **SQL Editor → New query**, cole o arquivo inteiro e clique em **Run**.

1. `supabase/migrations/0001_auth_base.sql`
2. `supabase/tests/0001_auth_base_test.sql`: o resultado é uma tabela com a coluna `ok`. Todas as linhas precisam estar `true`. O teste apaga os usuários de teste que cria.
3. `supabase/migrations/0002_conteudo.sql`
4. `supabase/migrations/0003_storage.sql`
5. `supabase/migrations/0004_admin.sql`
6. `supabase/migrations/0005_hardening.sql` (tira de anon/authenticated o acesso à função `rls_auto_enable()` do "RLS automático"; se a função não existir, não faz nada)
7. `supabase/migrations/0006_cadastro_aberto.sql` (cadastro aberto, CPF, cadastro completo, consentimento de comunicações)
8. `supabase/migrations/0007_aulas.sql` (aulas com YouTube ou PDF, trilhas opcionais, PDFs de apoio; adapta os encontros que já existem, sem apagar nada)
9. Testes, depois de todas as migrations: `supabase/tests/0002_conteudo_test.sql`, `supabase/tests/0003_cadastro_test.sql` e `supabase/tests/0004_aulas_test.sql` (todas as linhas `ok = true`). O 0002 agora testa as regras da 0007 (publicação e liberação por aula), então só roda depois dela.
10. Opcional, só para ver a vitrine cheia: `supabase/seed/exemplo.sql` (2 trilhas, 4 videoaulas de exemplo e 2 PDFs fictícios; o fim do arquivo explica como apagar).
11. **Advisors → Security Advisor**: precisa ficar sem alertas. Se aparecer "Leaked password protection disabled", é a opção do item 2 abaixo (depende do plano).

## 2. Senha

**Authentication → Providers → Email** (ou **Sign In / Providers**):

- Minimum password length: **10**
- Password requirements: **Lowercase, uppercase letters and digits**
- Secure password change: **ligado**
- Secure email change: **ligado**
- Email OTP expiration: **3600** segundos (1 hora; vale para convite e recuperação)
- Prevent use of leaked passwords (Attack Protection): ligar, se o plano permitir

## 2b. Cadastro aberto

**Authentication → Sign In / Providers** (ou **Providers → Email**):

- **Confirm email**: **ligado** (sempre). Sem ele, a pessoa entraria sem provar que o e-mail é dela.
- **Allow new users to sign up**: ligar **só no dia do lançamento**, depois que o SMTP próprio (item 9) estiver funcionando e testado. Sem SMTP, o e-mail de confirmação só chega para quem é da equipe do Supabase. Enquanto estiver desligado, a tela de cadastro mostra "Os cadastros ainda não estão abertos".
- **Allow anonymous sign-ins**: desligado.
- Intervalo mínimo entre e-mails para o mesmo usuário (se aparecer a opção): **60 segundos**.

## 3. MFA

**Authentication → Multi-Factor**: **TOTP (App Authenticator)** ligado. Phone desligado.
O admin é obrigado a usar TOTP pelo código (a função `is_admin()` só vale com sessão `aal2`). Para alunos, é opcional.

## 4. CAPTCHA

**Authentication → Attack Protection → Enable Captcha protection**: Cloudflare Turnstile, com a secret key (já feito).
Site key no site: `0x4AAAAAAF7uZlVNU6NHdDHd` (em `academiadevirtudes/_app/config.js`).

## 5. Limites (Rate Limits)

**Authentication → Rate Limits** (valores sugeridos):

Valores revistos para o cadastro aberto (o CAPTCHA já barra robôs; estes limites seguram abuso de uma mesma rede):

| Item | Valor |
|---|---|
| Sign-ups and sign-ins (por 5 min, por IP) | **50** (num encontro presencial, muita gente se cadastra pelo mesmo Wi-Fi; fora de evento, 30 basta) |
| Token refreshes (por 5 min, por IP) | 150 |
| Token verifications (por 5 min, por IP) | 30 |
| Emails sent (por hora) | começar com **100** e ajustar ao limite do SMTP contratado (cada cadastro, reenvio, convite e recuperação gasta 1 e-mail) |

Se o SMTP for a caixa da Hostinger, confira o limite diário dela: num lançamento com muitos cadastros ao mesmo tempo, um serviço como Resend, Brevo ou Amazon SES aguenta melhor.

## 6. Sessão

- **Authentication → Sessions**: se o plano permitir, "Inactivity timeout" de **7 dias** e "Time-box" de **30 dias**.
- **Settings → JWT**: expiração do access token em **3600** segundos (padrão).

## 7. URLs (já feito, conferir)

**Authentication → URL Configuration**:
- Site URL: `https://gpmintegracao.com.br`
- Redirect URLs: `https://gpmintegracao.com.br/academiadevirtudes/**` e `http://localhost:5500/**` (já cobrem a página nova de confirmação, `/academiadevirtudes/confirmar/`; não é preciso acrescentar nada)

## 8. Modelos de e-mail (português)

**Authentication → Emails → Templates**. Para cada modelo, troque o assunto e cole o HTML do arquivo:

| Modelo no painel | Assunto | Arquivo |
|---|---|---|
| Invite user | Seu acesso à Área do Aluno · Academia de Virtudes | `supabase/templates/convite.html` |
| Reset password | Criar nova senha · Academia de Virtudes | `supabase/templates/recuperacao.html` |
| Confirm signup | Confirme seu e-mail · Academia de Virtudes | `supabase/templates/confirmacao.html` (**novo**: o link agora abre `/academiadevirtudes/confirmar/`; cole de novo) |
| Change email address | Confirme o novo e-mail · Academia de Virtudes | `supabase/templates/troca-de-email.html` |

Os links usam `{{ .SiteURL }}/academiadevirtudes/redefinir-senha/?token_hash=…&type=…`. Por isso o link do e-mail sempre abre o site publicado (não o localhost). Para testar no computador, troque `https://gpmintegracao.com.br` por `http://localhost:5500` no endereço do link antes de abrir.

## 9. SMTP (envio de e-mails)

**Importante:** o envio padrão do Supabase só entrega para e-mails da equipe do projeto (membros da organização no Supabase) e com limite baixo por hora. **Convites para alunos só funcionam com SMTP próprio.**

O que é preciso:
1. Remetente: sugestão `academia@gpmintegracao.com.br` (confirmar). Nome: "Academia de Virtudes".
2. Um serviço de SMTP: a caixa de e-mail da Hostinger (smtp.hostinger.com, porta 465) serve para começar; para volume maior, Resend, Brevo ou Amazon SES.
3. Registros de DNS do domínio: SPF, DKIM e DMARC do serviço escolhido (sem eles, os e-mails caem no spam).
4. No painel: **Authentication → Emails → SMTP Settings**: host, porta, usuário, senha, remetente. A senha do SMTP fica só no painel, nunca no repositório.

## 10. Edge Functions (convites, status, papel, importação, LGPD)

Precisa da Supabase CLI no computador (https://supabase.com/docs/guides/cli). Na raiz do repositório:

```bash
supabase login
supabase link --project-ref qfghgtrvwklzlsuawndm
supabase functions deploy convidar-aluno       --no-verify-jwt
supabase functions deploy alterar-status-aluno --no-verify-jwt
supabase functions deploy alterar-papel-aluno  --no-verify-jwt
supabase functions deploy importar-alunos      --no-verify-jwt
supabase functions deploy dados-aluno          --no-verify-jwt
```

- `--no-verify-jwt`: a verificação é feita dentro de cada função (sessão válida + `is_admin()` com MFA). Isso é necessário porque o projeto usa as chaves novas (`sb_publishable_…`) e porque o navegador faz uma checagem de CORS sem token antes de cada chamada.
- Nenhum segredo precisa ser configurado: `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` já existem no ambiente das Edge Functions. **Nunca** coloque a chave do servidor no site ou no repositório.
- As funções aceitam chamadas só de `https://gpmintegracao.com.br`, `https://www.gpmintegracao.com.br` e `http://localhost:5500`.
- Para conferir: **Edge Functions** no painel → cada função → **Logs**.

## 11. Player de vídeo

- **YouTube (padrão)**: suba o vídeo no canal da GPM como **Não listado** e confira em **Detalhes → Mostrar mais → Permitir incorporação** (ligado). No painel da Academia (aba **Aulas → Nova aula**), cole o link do vídeo (`youtube.com/watch?v=…`, `youtu.be/…`, `/shorts/` ou `/live/`): o sistema guarda só o ID. O player usa `youtube-nocookie.com` e a capa vem do YouTube (pode ser trocada por uma capa própria).
  - "Não listado" não é sigiloso: quem tiver o link do YouTube consegue assistir fora da Área do Aluno. Para conteúdo que não pode vazar, use Vimeo ou Panda com restrição de domínio (abaixo).
- **Vimeo**: em cada vídeo, **Privacidade → Onde o vídeo pode ser incorporado → Somente domínios especificados**: `gpmintegracao.com.br` (e `localhost` só durante os testes). "Quem pode assistir": **Ocultar do Vimeo**. No painel da Academia, use o número do vídeo; se o link do vídeo tiver um código depois do número (vídeo não listado, ex.: `vimeo.com/123456789/abc123def4`), use `123456789:abc123def4`.
- **Panda Video**: em **Configurações → Segurança**, ligar a restrição de domínio para `gpmintegracao.com.br`; se quiser, ligar a marca d'água. Depois copie o endereço do player (formato `player-vz-xxxxxxxx-xxx.tv.pandavideo.com.br`) para `pandaHost` em `academiadevirtudes/_app/config.js` (e aumente o `?v=` de config.js nas páginas).

## 11b. Armazenamento (PDFs e capas)

- Os PDFs ficam no bucket privado `materiais` (até 20 MB cada) e as capas no bucket `capas`. O painel (aba **Aulas**) mostra o espaço usado e avisa ao passar de **80%** do limite do plano (grátis: 1 GB).
- Se o plano mudar, ajuste `storageLimiteBytes` em `academiadevirtudes/_app/config.js` (e aumente o `?v=` de config.js nas páginas).

## 12. Primeiro admin e aluno de teste

1. **Authentication → Users → Add user → Send invitation**: convide o seu e-mail.
   (Enquanto não houver SMTP próprio, use um e-mail de quem é membro da organização no Supabase.)
2. Abra o e-mail, crie a senha, entre e aceite a política de privacidade. Você cai em `/academiadevirtudes/aluno/`.
3. No **SQL Editor**, rode (trocando o e-mail):
   ```sql
   update public.profiles set role = 'admin' where email = 'seu-email@gpmintegracao.com.br';
   ```
4. Saia e entre de novo. Você vai para `/academiadevirtudes/admin/mfa/`: leia o QR code com o aplicativo autenticador (Google Authenticator, Microsoft Authenticator ou 1Password) e digite o código.
5. Guarde a chave (o texto abaixo do QR) num cofre de senhas. Sem o aplicativo, só outro admin (ou o SQL Editor) consegue liberar o acesso.
6. Para o aluno de teste, repita o passo 1 com outro e-mail (sem o passo 3).

Para tirar o MFA de um admin que perdeu o celular (SQL Editor):
```sql
delete from auth.mfa_factors where user_id = (select id from auth.users where email = 'email-do-admin');
```
