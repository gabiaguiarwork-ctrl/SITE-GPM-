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
10. Depois: `0008_mais_assistidas.sql`, `0009_inscricoes.sql` e `0010_inscricoes_email.sql`, com os testes `0005_inscricoes_test.sql` e `0006_inscricoes_email_test.sql` (ver item 13).
11. Opcional, só para ver a vitrine cheia: `supabase/seed/exemplo.sql` (2 trilhas, 4 videoaulas de exemplo e 2 PDFs fictícios; o fim do arquivo explica como apagar).
12. **Advisors → Security Advisor**: precisa ficar sem alertas. Se aparecer "Leaked password protection disabled", é a opção do item 2 abaixo (depende do plano).

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

## 13. Inscrições nos encontros e confirmação de presença (desde 24/11/2026)

Substitui o Formspree nas inscrições da página `/academiadevirtudes/` e na confirmação de presença (`/academiadevirtudes/presenca/?t=…`). O Formspree continua como plano B: em `academiadevirtudes/_publico/academia-config.js`, troque `FORM_BACKEND: "supabase"` por `"formspree"` e publique.

**Inscrição ≠ portal.** A inscrição num encontro não cria conta, não envia convite e não libera nada na Área do Aluno (o teste `0006_inscricoes_email_test.sql` confere isso).

### 13.1 SQL (nesta ordem, no SQL Editor)

1. `supabase/migrations/0008_mais_assistidas.sql` (se ainda não rodou)
2. `supabase/migrations/0009_inscricoes.sql`: eventos, cotas de fralda, inscrições, presença. Cria o **Encontro 3** com 50 lugares, 1 reservado, fraldas P 17 · M 17 · G 16, **inscrições fechadas**.
3. `supabase/migrations/0010_inscricoes_email.sql`: e-mail de confirmação, travas das cotas, aviso "tem conta no portal".
4. Testes: `supabase/tests/0005_inscricoes_test.sql` e `supabase/tests/0006_inscricoes_email_test.sql` (todas as linhas `ok = true`; os testes apagam o que criam).
5. **Advisors → Security Advisor**: sem alertas.

### 13.2 Edge Functions

```bash
supabase functions deploy inscricao            --no-verify-jwt
supabase functions deploy confirmar-presenca   --no-verify-jwt
supabase functions deploy reenviar-confirmacao --no-verify-jwt
# o código comum (CORS) mudou: publique de novo as que já existem
supabase functions deploy convidar-aluno alterar-status-aluno alterar-papel-aluno importar-alunos dados-aluno --no-verify-jwt
```

### 13.3 Segredos (secrets) das funções

Gere o sal do limite por IP (64 caracteres aleatórios), no terminal, na raiz do repositório:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Depois (troque os valores entre < >; nada disso vai para o repositório):

```bash
supabase secrets set IP_SALT=<o valor gerado acima>
supabase secrets set TURNSTILE_SECRET=<secret key NOVA do Turnstile, ver 13.4>
supabase secrets set RESEND_API_KEY=<chave do Resend, começa com re_, ver 13.5>
# opcionais (os padrões já são estes):
supabase secrets set EMAIL_REMETENTE="Academia de Virtudes <marketing@gpmintegracao.com.br>"
supabase secrets set EMAIL_RESPONDER_PARA=marketing@gpmintegracao.com.br
```

Sem `RESEND_API_KEY`, as inscrições funcionam normalmente e ficam com o e-mail "não enviado"; depois é só usar **Reenviar** no painel.

### 13.4 Troca da secret key do Turnstile (nos DOIS lugares, no mesmo momento)

A secret atual apareceu num print e precisa ser trocada. Faça num horário sem uso da plataforma:

1. Cloudflare → **Turnstile** → widget do site → **Settings** → **Rotate secret key**. Copie a nova secret.
2. Na hora, nos dois lugares:
   - `supabase secrets set TURNSTILE_SECRET=<nova>`
   - Supabase → **Authentication → Attack Protection → CAPTCHA protection** → cole a nova secret → **Save**.
3. Teste logo em seguida, numa janela anônima:
   - entrar na Área do Aluno (`/academiadevirtudes/entrar/`) com uma conta de teste;
   - "Esqueci minha senha" com essa conta (o e-mail precisa chegar);
   - uma inscrição de teste (13.7).
4. Se o login falhar com erro de CAPTCHA, confira se a secret colada no Supabase é a nova (sem espaços no fim).

A site key (pública, em `_app/config.js`) não muda. Confira em **Hostname Management** que o widget tem `gpmintegracao.com.br`, `www.gpmintegracao.com.br` e `localhost`.

### 13.5 Resend (e-mail de confirmação da inscrição)

**Atenção:** o DNS público de `gpmintegracao.com.br` (consultado em 24/11/2026) mostra o e-mail na **Hostinger**, não no Microsoft 365:
- MX: `mx1.hostinger.com` (5) e `mx2.hostinger.com` (10)
- SPF (TXT na raiz): `v=spf1 include:_spf.mail.hostinger.com ~all`
- DMARC (`_dmarc`): `v=DMARC1; p=none`
- Servidores de DNS: `ns1/ns2.dns-parking.com` (os registros são editados no **hPanel da Hostinger → Domínios → DNS**).

Os registros do Resend **não mexem** em nada disso: o envio usa o subdomínio `send.` para o retorno e a assinatura DKIM no próprio domínio.

1. Crie a conta em resend.com (de preferência com um e-mail da equipe) → **Domains → Add Domain** → `gpmintegracao.com.br`, região **São Paulo (sa-east-1)**.
2. Crie no DNS **exatamente** os registros que o Resend mostrar. Para a região São Paulo, são estes (o valor do DKIM é único da conta; copie do Resend):

| Tipo | Nome (host) | Valor | Prioridade |
|---|---|---|---|
| TXT | `resend._domainkey` | `p=MIGfMA0…` (copiar do Resend) | — |
| MX | `send` | `feedback-smtp.sa-east-1.amazonses.com` | 10 |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` | — |

   - **Não** altere o MX da raiz (`@`) nem o SPF da raiz. **Não** crie um segundo SPF na raiz: o SPF novo fica só em `send`.
   - **Não** crie outro `_dmarc`: o domínio já tem um (`p=none`). Mais tarde, com os envios estáveis, vale subir para `p=quarantine`.
   - Se um dia o e-mail do domínio for mesmo para o Microsoft 365, o SPF da raiz muda para `v=spf1 include:spf.protection.outlook.com ~all` (um registro só) — sem relação com o Resend.
3. Clique em **Verify** no Resend (pode levar de minutos a algumas horas). Quando o domínio ficar **Verified**, crie a chave: **API Keys → Create** → permissão **Sending access**, domínio `gpmintegracao.com.br`. Cadastre com `supabase secrets set RESEND_API_KEY=re_…`.
4. Teste de entrega: faça uma inscrição de teste com um e-mail do **Gmail** e outra com um do **Outlook/Hotmail**.
   - Gmail: abra o e-mail → ⋮ → **Mostrar original**. Precisa aparecer **SPF: PASS**, **DKIM: PASS** e **DMARC: PASS**.
   - Outlook.com: abra o e-mail → ⋯ → **Exibir → Exibir origem da mensagem** e procure `Authentication-Results`: `spf=pass`, `dkim=pass` (`header.d=gpmintegracao.com.br`), `dmarc=pass`.
   - Se cair no spam, confira os três registros no Resend (**Domains**) e espere a propagação.

### 13.6 Painel → Inscrições

- **Antes de abrir:** confira o horário (9h) e o local do Encontro 3 em **Editar evento**. Depois marque **Inscrições abertas** e salve.
- Cotas de fralda e marca ficam na tela do evento. A soma das cotas pode ser maior que os lugares; o painel avisa se for menor. Não dá para baixar uma cota abaixo do que já está reservado.
- Confirmação pelo WhatsApp: o texto fica em **Editar evento → Mensagem do WhatsApp** (`{nome}`, `{evento}` e `{link}` são trocados por linha).
- **Modo check-in** no celular, no dia: busca pelo nome e "Chegou" separado para o acompanhante.

### 13.7 Como testar antes de abrir para o público

Tudo isto numa janela anônima, com o site rodando no Live Server (`http://localhost:5500`):

1. Sem enviar nada: `/academiadevirtudes/?teste` (e `?teste=espera`, `?teste=encerradas`, `?teste=esgotado`, `?teste=umlugar`) e `/academiadevirtudes/presenca/?teste`.
2. De verdade, sem tocar no Encontro 3: no painel, crie um evento de teste (slug `teste`, data futura, capacidade 3, cotas P 1 · M 1 · G 1, inscrições abertas). Abra `http://localhost:5500/academiadevirtudes/?evento=teste#inscricao` (o `?evento=` só vale no localhost) e faça:
   - inscrição completa sem acompanhante; depois a mesma de novo (mesmo WhatsApp): continua 1 linha, "Envios" = 2;
   - uma com acompanhante; com o evento cheio, a próxima entra na lista de espera;
   - peça um tamanho que acabou: o formulário volta para a etapa da fralda e mostra os que restam;
   - feche as inscrições no painel: o formulário mostra "Inscrições encerradas";
   - no painel, use o botão de WhatsApp de uma linha "Aguardando", abra o link de presença e responda "sim" e depois "não vou";
   - modo check-in no celular; exporte os dois CSV e abra no Excel.
3. No fim, exclua o evento de teste (exclua as inscrições dele antes).
