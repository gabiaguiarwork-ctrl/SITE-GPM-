# Supabase · configuração do painel (Área do Aluno)

Projeto: `https://qfghgtrvwklzlsuawndm.supabase.co`. Quem altera o painel e roda SQL é a equipe GPM.
Os nomes dos menus podem mudar um pouco entre versões do painel; procure pelo nome da opção.

## 1. SQL (nesta ordem)

No painel: **SQL Editor → New query**, cole o arquivo inteiro e clique em **Run**.

1. `supabase/migrations/0001_auth_base.sql`
2. `supabase/tests/0001_auth_base_test.sql`: o resultado é uma tabela com a coluna `ok`. Todas as linhas precisam estar `true`. O teste apaga os usuários de teste que cria.
3. **Advisors → Security Advisor**: precisa ficar sem alertas.

## 2. Senha

**Authentication → Providers → Email** (ou **Sign In / Providers**):

- Minimum password length: **10**
- Password requirements: **Lowercase, uppercase letters and digits**
- Secure password change: **ligado**
- Secure email change: **ligado**
- Email OTP expiration: **3600** segundos (1 hora; vale para convite e recuperação)
- Prevent use of leaked passwords (Attack Protection): ligar, se o plano permitir

## 3. MFA

**Authentication → Multi-Factor**: **TOTP (App Authenticator)** ligado. Phone desligado.
O admin é obrigado a usar TOTP pelo código (a função `is_admin()` só vale com sessão `aal2`). Para alunos, é opcional.

## 4. CAPTCHA

**Authentication → Attack Protection → Enable Captcha protection**: Cloudflare Turnstile, com a secret key (já feito).
Site key no site: `0x4AAAAAAF7uZlVNU6NHdDHd` (em `academiadevirtudes/_app/config.js`).

## 5. Limites (Rate Limits)

**Authentication → Rate Limits** (valores sugeridos):

| Item | Valor |
|---|---|
| Sign-ups and sign-ins (por 5 min, por IP) | 30 |
| Token refreshes (por 5 min, por IP) | 150 |
| Token verifications (por 5 min, por IP) | 30 |
| Emails sent (por hora) | o máximo que o SMTP permitir (o envio padrão do Supabase fica preso em poucos por hora) |

## 6. Sessão

- **Authentication → Sessions**: se o plano permitir, "Inactivity timeout" de **7 dias** e "Time-box" de **30 dias**.
- **Settings → JWT**: expiração do access token em **3600** segundos (padrão).

## 7. URLs (já feito, conferir)

**Authentication → URL Configuration**:
- Site URL: `https://gpmintegracao.com.br`
- Redirect URLs: `https://gpmintegracao.com.br/academiadevirtudes/**` e `http://localhost:5500/**`

## 8. Modelos de e-mail (português)

**Authentication → Emails → Templates**. Para cada modelo, troque o assunto e cole o HTML do arquivo:

| Modelo no painel | Assunto | Arquivo |
|---|---|---|
| Invite user | Seu acesso à Área do Aluno · Academia de Virtudes | `supabase/templates/convite.html` |
| Reset password | Criar nova senha · Academia de Virtudes | `supabase/templates/recuperacao.html` |
| Confirm signup | Confirme seu e-mail · Academia de Virtudes | `supabase/templates/confirmacao.html` |
| Change email address | Confirme o novo e-mail · Academia de Virtudes | `supabase/templates/troca-de-email.html` |

Os links usam `{{ .SiteURL }}/academiadevirtudes/redefinir-senha/?token_hash=…&type=…`. Por isso o link do e-mail sempre abre o site publicado (não o localhost). Para testar no computador, troque `https://gpmintegracao.com.br` por `http://localhost:5500` no endereço do link antes de abrir.

## 9. SMTP (envio de e-mails)

**Importante:** o envio padrão do Supabase só entrega para e-mails da equipe do projeto (membros da organização no Supabase) e com limite baixo por hora. **Convites para alunos só funcionam com SMTP próprio.**

O que é preciso:
1. Remetente: sugestão `academia@gpmintegracao.com.br` (confirmar). Nome: "Academia de Virtudes".
2. Um serviço de SMTP: a caixa de e-mail da Hostinger (smtp.hostinger.com, porta 465) serve para começar; para volume maior, Resend, Brevo ou Amazon SES.
3. Registros de DNS do domínio: SPF, DKIM e DMARC do serviço escolhido (sem eles, os e-mails caem no spam).
4. No painel: **Authentication → Emails → SMTP Settings**: host, porta, usuário, senha, remetente. A senha do SMTP fica só no painel, nunca no repositório.

## 10. Primeiro admin e aluno de teste

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
