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
Só em `academiadevirtudes/index.html`, "Academia de Virtudes ▾" abre "A Academia" e "Área do Aluno" (o menu do celular e o hero também têm o link). As outras páginas continuam com o link simples.
O menu vira hambúrguer abaixo de 1200 px (na home, o menu completo some abaixo de 1200 px e o botão "Como se tornar um Nexialista" continua até 768 px).

## Endereços

- `/academiadevirtudes/`: página pública da Academia (Encontro 2 com inscrições abertas).
- `/npsencontro1/`: avaliação (NPS) do Encontro 1, que termina na inscrição do Encontro 2.
- `/academiadevirtudes/_inscricao-encontro-1.html`: página antiga guardada, sem link (noindex).
- Área do Aluno: `/academiadevirtudes/{entrar,cadastro,confirmar,redefinir-senha,aluno,admin}/`; dentro de `aluno/`: `encontro/?id=`, `aula/?id=`, `materiais/`, `perfil/`, `completar/`; dentro de `admin/`: `mfa/` e as abas `#alunos`, `#encontros`, `#conteudos`, `#avisos`, `#relatorios`.

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
- `_app/vendor/supabase-2.119.0.js`: `@supabase/supabase-js` 2.119.0 (build UMD oficial do npm, licença MIT), `sha384-uteMfOloLDGt042uDz+xHGF3ym63/WQ6rFq7murQRG8Ih7QrXGEGNtWd8688sb4O`. Para atualizar: baixar a nova versão com o número no nome do arquivo, conferir o hash com o pacote do npm e trocar a referência nas páginas.
- `_app/fonts/`: Cormorant Garamond (normal 500–600 e itálico 500) e Inter (400–600), só o subconjunto latino, em woff2 variável; licença SIL OFL 1.1 nos arquivos `OFL-*.txt`.
- Ao alterar um arquivo de `_app/`, aumente o `?v=` nas páginas que o carregam, para o navegador não usar a cópia antiga.
- Links externos com `rel="noopener noreferrer"`. Nada de dados pessoais em `localStorage` além da sessão do supabase-js.
- Cabeçalhos de segurança (CSP, noindex, no-store, no-referrer, COOP) ficam no `.htaccess` de cada pasta: `entrar/`, `cadastro/`, `confirmar/`, `redefinir-senha/`, `aluno/`, `admin/`. Não em `academiadevirtudes/`, para não afetar a página pública. Pasta nova da Área do Aluno precisa estar dentro de uma delas ou ter o próprio `.htaccess`.
- Para testar a CSP no computador: `node _notas/ferramentas/servidor-teste.cjs . 8080` na raiz do repositório e abrir `http://localhost:8080/academiadevirtudes/entrar/` (o Live Server da porta 5500 não lê `.htaccess`).
- Configuração do painel, modelos de e-mail e primeiro admin: `supabase/PAINEL.md`.

### Cadastro aberto (decisão da GPM, 11/2026)

- Plataforma gratuita, com cadastro aberto em `/academiadevirtudes/cadastro/`. O convite pelo painel continua existindo, e o admin pode desativar qualquer pessoa.
- Acesso só depois de: cadastro completo (nome, sobrenome, e-mail, WhatsApp, CPF, empresa, cargo, senha), CAPTCHA, aceite da privacidade e confirmação do e-mail (`/academiadevirtudes/confirmar/`, que grava o aceite com `aceitar_privacidade()`).
- No banco, conteúdo só aparece com `is_active() and cadastro_completo()` (admin com MFA vê tudo). No site, quem está com o cadastro incompleto vai para `/aluno/completar/` antes de qualquer página.
- Regras dos campos: `_app/campos.js` no navegador e a migration 0006 no banco (as duas precisam bater). WhatsApp e CPF ficam só com dígitos; o CPF é validado, só é preenchido pelo aluno se estiver vazio e sai dos metadados da conta (não vai no token de sessão).
- Consentimento de comunicações é separado e opcional: só muda pela função `definir_comunicacoes()`, que grava a data e registra na auditoria.
- Nenhuma tela pode revelar se um e-mail já tem conta (cadastro, reenvio, login e "esqueci minha senha" respondem igual).

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
