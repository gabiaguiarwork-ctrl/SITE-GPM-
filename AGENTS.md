# Regras do site Grupo GPM (gpmintegracao.com.br)

Leia antes de alterar qualquer arquivo deste repositório.

## Como o site funciona

- Site estático em HTML/CSS/JS puro: sem framework, sem build, sem Node/npm no site publicado.
- Cada página é um `.html` autossuficiente (CSS em `<style>` interno nas páginas públicas).
- O header e o footer são **copiados em cada página**. Ao mudar o menu, mude em todas: `index.html`, `unidades/*.html` e `academiadevirtudes/index.html`.
- Cada rota é uma pasta com `index.html` (ex.: `/academiadevirtudes/`, `/npsencontro1/`).

## Publicação

- Todo push na branch `main` dispara `.github/workflows/deploy.yml`, que envia o repositório por **FTPS** para a Hostinger.
- **Tudo o que for commitado vira público na internet**, exceto o que está no `exclude` do deploy.
- `exclude` atual (não remova nenhum item sem revisar a segurança): `.git*`, `.github/`, `node_modules/`, `GPM_CRM/`, `CRM/`, `supabase/`, `_notas/`, `academiadevirtudes/fotos/`, `**/*.md`, `**/*.ps1`, `**/*.sql`, `**/.env*`.
- **Nunca envie o repositório inteiro à mão para o `public_html`.** Publicação só pelo GitHub Actions. Se for indispensável subir algo à mão, envie só os arquivos específicos.
- O `.htaccess` da raiz é uma segunda barreira (bloqueia `.md`, `.ps1`, `.sql`, `.env`, `.git*`, `.bak` e as pastas `GPM_CRM/`, `CRM/`, `supabase/`, `_notas/`, `.github/`). Ele precisa preservar as regras que a Hostinger já tem no servidor.

## Nunca no repositório

- Prompts e notas internas: ficam em `_notas/` (ignorada pelo git).
- Chaves secretas (`sb_secret_…`, `service_role`), senhas, `.env`, certificados (`*.pem`, `*.key`).
- Antes de cada commit, busque `sb_secret`, `service_role`, `password` e `senha` e confira que só aparecem em textos de interface ou documentação, nunca com valor.

## Identidade visual

- Fontes: Cormorant Garamond (títulos) + Inter (textos).
- Site institucional: `--azul-marinho #0a1628`, `--dourado #c9a84c`, `--dourado-brilho #e2c46a`.
- Academia de Virtudes: `--bg #08142E`, `--bg-2 #0E1F45`, `--gold #C9A45C`, `--gold-2 #E2C88E`, `--ivory #F4EEE2`, `--paper #FAF6EE`, `--ink #14203B`, `--error #B5483A`.
- Contraste AA, mobile-first (360–430 px), foco visível, labels em todos os campos.
- A fonte Cormorant usa algarismos "antigos" por padrão: em títulos com números, use `font-variant-numeric: lining-nums`.

## Menu

Início · Sobre ▾ (Nossa Tese, Mentoria Nexialista) · Unidades · Metodologia · Academia de Virtudes (com o símbolo dourado) · Contato.
O menu vira hambúrguer abaixo de 1200 px (na home, o menu completo some abaixo de 1200 px e o botão "Como se tornar um Nexialista" continua até 768 px).

## Endereços

- `/academiadevirtudes/`: página pública da Academia (Encontro 2 com inscrições abertas).
- `/npsencontro1/`: avaliação (NPS) do Encontro 1, que termina na inscrição do Encontro 2.
- `/academiadevirtudes/_inscricao-encontro-1.html`: página antiga guardada, sem link (noindex).
- Área do Aluno: `/academiadevirtudes/{entrar,redefinir-senha,aluno,admin}/`.

## Formulários

| Página | Destino | Uso |
|---|---|---|
| `playbook.html` | Formspree `xwvdapgq` | download do playbook |
| `academiadevirtudes/index.html` | Formspree `xoeernrz` | inscrição no Encontro 2 |
| `npsencontro1/index.html` | Formspree `mljjeqwp` | NPS anônimo do Encontro 1 |
| `mentoria.html` e `mentoria-formulario.html` | Google Forms `forms.gle/UFvUrSbM4izxHkzA7` | questionário da Mentoria Nexialista (`mentoria-formulario.html` só redireciona) |
| `academiadevirtudes/_inscricao-encontro-1.html` | Formspree `xoejvbdd` | inscrição do Encontro 1 (página antiga, formulário inativo) |

Não usados mais no site: `xaeeyrdb` (lista prioritária do Encontro 2) e `mnppzldd` (primeiro formulário do Encontro 2).

## Área do Aluno (Academia de Virtudes)

- Supabase: Auth (login), Postgres com RLS em todas as tabelas, Storage com bucket privado.
- No front-end, **apenas** a chave pública (`sb_publishable_…`), em `academiadevirtudes/_app/config.js`.
- Páginas da Área do Aluno **não usam `<style>` nem `<script>` inline nem atributos `style=`/`onclick=`**: todo CSS e JS fica em arquivos em `academiadevirtudes/_app/`, para a Content-Security-Policy funcionar sem `unsafe-inline`.
- Nunca usar `innerHTML`, `outerHTML`, `insertAdjacentHTML` ou `document.write` com dado do banco ou do usuário: usar `textContent` ou criação de elementos.
- Bibliotecas e fontes servidas do próprio site (`_app/vendor/`, `_app/fonts/`). Única exceção: o script do Cloudflare Turnstile (`https://challenges.cloudflare.com`), que entra explicitamente na CSP.
- Links externos com `rel="noopener noreferrer"`. Nada de dados pessoais em `localStorage` além da sessão do supabase-js.

## Supabase

- Projeto: `https://qfghgtrvwklzlsuawndm.supabase.co` (região São Paulo).
- SQL e migrations ficam em `supabase/` (excluída do deploy).
- O agente escreve o SQL, mas **quem executa no Supabase é a equipe GPM**. O agente nunca executa SQL nem altera configurações do painel.
- Admin exige MFA: a função `is_admin()` só é verdadeira com a sessão em `aal2`.
- CAPTCHA Cloudflare Turnstile ligado no Supabase: todo login e toda recuperação de senha precisam enviar o token (`captchaToken`).
- Ao fim de cada fase, o Security Advisor (Advisors → Security) precisa estar sem alertas.

## Pendências

- HSTS começa com `max-age=300` e **sem** `includeSubDomains`. Depois de confirmar que todas as páginas abrem normalmente, subir para `31536000` em outro commit (e só incluir subdomínios depois de confirmar quais existem).
- A publicação automática depende de corrigir o segredo `FTP_SERVER` no GitHub (só o host/IP de FTP do hPanel, sem `ftp://`, barra ou porta) e de confirmar o `server-dir` (`/` ou `public_html/`).

## Histórico

- Funil e CRM antigos (`GPM_CRM/`, `CRM/`) foram excluídos em 11/2026 por decisão da GPM. O novo funil será um projeto separado e deve seguir as mesmas regras de segurança da Área do Aluno.
