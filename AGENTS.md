# Regras do site Grupo GPM (gpmintegracao.com.br)

Leia antes de alterar qualquer arquivo deste repositório.

## Como o site funciona

- Site estático em HTML/CSS/JS puro: sem framework, sem build, sem Node/npm no site publicado.
- Cada página é um `.html` autossuficiente (CSS em `<style>` interno nas páginas públicas).
- O header e o footer são **copiados em cada página**. Ao mudar o menu, mude em todas: `index.html`, `unidades/*.html` e `academiadevirtudes/index.html`.
- Cada rota é uma pasta com `index.html` (ex.: `/academiadevirtudes/`, `/npsencontro1/`).

## Publicação

- Todo push na branch `main` dispara `.github/workflows/deploy.yml`, que envia o repositório por **FTPS** (lftp, certificado conferido) para a Hostinger. Envia só o que mudou e nunca apaga nada no servidor.
- Servidor: `srv1896.hstgr.io` (o certificado é `*.hstgr.io`; com o IP a conferência falha). Conta FTP só de publicação: `u977135034.deploy`. Nessa conta a raiz `/` é o `public_html` do site, mas o login abre em `/public_html` (subpasta): por isso o `cd /`.
- Trava: só publica se encontrar o arquivo vazio `public_html/.pasta-do-site` no servidor. **Não apague esse arquivo.**
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

Início · Sobre ▾ (Nossa Tese, Mentoria Nexialista) · Unidades · Metodologia · Contato · Trabalhe conosco · Academia de Virtudes.
"Trabalhe conosco" (desde 26/11/2026) leva a `/trabalheconosco/`: página com as vagas abertas (desde 26/11/2026: "Tecnologia nas Forças Armadas" e "Tecnologia e marketing"), cada uma com o botão "Quero me candidatar" (`mailto:rh@gpmintegracao.com.br` com o nome da vaga no assunto). Para tirar ou trocar uma vaga, edite o `<article class="vaga">` correspondente em `trabalheconosco/index.html`. Também está no rodapé, logo depois de "Contato". Com esse item, o menu fica mais justo entre 1201 e 1366 px (espaços e letra menores; na Academia, só o logo sem o texto "GRUPO GPM" até 1320 px).
"Academia de Virtudes" no menu é só o nome, sem o símbolo, na mesma cor dos outros itens (desde 25/11/2026).
À direita do menu: o botão dourado (pequeno, cantos de 8 px) e, ao lado, o botão vazado branco "Sou colaborador", que leva a `/academiadevirtudes/colaborador/` (página que explica que a plataforma é só para colaboradores do Grupo GPM e pessoas aprovadas, com o pedido de acesso e o link para o login). No celular, o botão dourado some e o "Sou colaborador" fica ao lado do hambúrguer.
Só nas páginas da Academia (`academiadevirtudes/index.html` e `colaborador/`), "Academia de Virtudes ▾" abre "A Academia" e "Sou colaborador". As outras páginas continuam com o link simples. A página da Academia não tem mais a faixa do playbook no topo.
O menu vira hambúrguer abaixo de 1200 px (na home, o menu completo some abaixo de 1200 px e o botão "Como se tornar um Nexialista" continua até 768 px).

## Endereços

- `/academiadevirtudes/`: página pública da Academia. Inscrições do Encontro 2 encerradas em 18/11/2026, reabertas em 19/11/2026 e encerradas de novo em 19/11/2026 ("Próximo encontro: 11 de dezembro · Em breve, mais informações"; Encontro 3 em 11/12/2026); o formulário continua no HTML com `hidden`, para reabrir se for preciso.
- `/academiadevirtudes/` v2 (branch `academia-v2`, em revisão, 24/11/2026): página no estilo G4, sem CSS/JS inline (CSP numa `<meta>` da própria página, para não afetar as subpastas). Visual e comportamento em `academiadevirtudes/_publico/`; datas, local, formulário (`xoedlyqp`), depoimentos e galeria só em `_publico/academia-config.js`. Imagens em `assets/academia/` (pinturas de domínio público do Wikimedia Commons; o relógio astronômico de Praga da seção "O ponto de partida", como no slide do Encontro 1, é a foto CC0 "Prague Astronomical Clock, Prague Orloj picture-005"). A barra da capa mostra as quatro virtudes (Prudência, Justiça, Fortaleza, Temperança). A Jornada é uma linha do tempo que desliza, com as capas das aulas (`assets/academia/capa-encontro-N-*`). Os quatro perfis usam as pinturas pequenas e redondas. A galeria mostra só o Encontro 2. O formulário usa `FORM_BACKEND: "supabase"` desde 25/11/2026 (Edge Functions publicadas com a Supabase CLI 3.1.0, em `C:UsersGabierramentassupabase`; secrets IP_SALT e TURNSTILE_SECRET cadastrados). Se algo falhar no dia, volte para `"formspree"` e publique. A v1 fica em `academiadevirtudes/_academia-v1.html` (noindex, sem link). Na v2 (24/11/2026), a Área do Aluno não é mais divulgada (passa a ser só para colaboradores do Grupo GPM): o botão para `/academiadevirtudes/entrar/` se chama "Sou colaborador". Galeria: fotos em `assets/academia/galeria/` (`.jpg`, `-800.webp`, `-1600.webp`), listadas em `GALERIA` com `base`, `w`, `h`, `legenda` e `alt`.
- `/npsencontro1/`: avaliação (NPS) do Encontro 1, que termina na inscrição do Encontro 2.
- `/academiadevirtudes/presenca/?t=TOKEN`: confirmação de presença (desde o Encontro 3, branch `inscricoes-supabase`). Link individual gerado na aba Inscrições do painel e enviado pelo WhatsApp; a resposta passa pela Edge Function `confirmar-presenca` (com CAPTCHA). O token sai da barra de endereços ao ser lido. Sem CSS/JS inline (`presenca.css`, `presenca.js`, `.htaccess` próprio com CSP). Links antigos do Encontro 2 (`?c=…&n=…`) mostram "link não está mais ativo". `?teste` simula.
- `/academiadevirtudes/encontro2/`: QR code do slide final do Encontro 2. A página é noindex e fica fora do menu. A pessoa avalia (NPS), indica 1 pessoa (ou marca "Não tenho ninguém para indicar", desde 20/11/2026; antes eram 5) e baixa o e-book *O Tempo da Vida*. O link do PDF só aparece depois que as indicações chegam.
  - O aparelho guarda só a etapa e a nota, nunca nome ou telefone.
  - `?teste` simula os envios; `?zerar` recomeça o fluxo naquele aparelho.
  - O PDF fica em `academiadevirtudes/materiais/`, pasta com `X-Robots-Tag: noindex` e um `index.html` que impede a listagem. O nome do arquivo não deve aparecer em outra página nem no sitemap.
- `/academiadevirtudes/checkin/#chave=…`: check-in da equipe no dia do Encontro 2 (noindex, fora do menu). Os nomes dos inscritos ficam criptografados na página (AES-GCM) e só abrem com a chave do link; sem a chave, nenhum nome aparece. Presenças e pessoas adicionadas (nome, WhatsApp, quem convidou) ficam só no aparelho até baixar a planilha. Para gerar ou atualizar a lista: `node _notas/checkin/gerar.js` (a chave fica em `_notas/checkin/chave.txt`).
- `/academiadevirtudes/_inscricao-encontro-1.html`: página antiga guardada, sem link (noindex).
- Área do Aluno: `/academiadevirtudes/{entrar,cadastro,confirmar,redefinir-senha,aluno,admin}/`; dentro de `aluno/`: `aula/?id=`, `materiais/`, `perfil/`, `completar/` (e `encontro/`, endereço antigo que leva para a vitrine); dentro de `admin/`: `mfa/` e as abas `#alunos`, `#aulas`, `#trilhas`, `#avisos`, `#relatorios` (`#encontros` e `#conteudos` abrem `#aulas`).

## Formulários

| Página | Destino | Uso |
|---|---|---|
| `playbook.html` | Formspree `xwvdapgq` | download do playbook |
| `academiadevirtudes/index.html` | Na v2 (branch `inscricoes-supabase`): Edge Function `inscricao` (Supabase), com Formspree `xoedlyqp` como plano B (`FORM_BACKEND` em `_publico/academia-config.js`). Na v1 no ar: Formspree `xoedlyqp` (desde 19/11/2026; antes `xoeernrz`) | inscrição nos encontros |
| `npsencontro1/index.html` | Formspree `mljjeqwp` | NPS anônimo do Encontro 1 |
| `academiadevirtudes/encontro2/index.html` | Formspree `mwlooqgn` | NPS anônimo do Encontro 2 |
| `academiadevirtudes/presenca/index.html` | Edge Function `confirmar-presenca` (branch `inscricoes-supabase`). Antes: Formspree `mbgoyzga` (Encontro 2) | confirmação de presença (link individual `?t=token`) |
| `academiadevirtudes/encontro2/index.html` | Formspree `xbgooknp` | indicação (identificado: 1 pessoa ou "não tenho ninguém para indicar"). É separado do NPS para a nota continuar anônima. |
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

### Aulas e trilhas (decisão da GPM, 11/2026)

- Não existe mais "Encontro" para o aluno nem para o admin: só **Aula** (videoaula do YouTube ou material em PDF), com **Trilha** opcional e **PDFs de apoio**.
- Banco (nomes antigos mantidos para não perder dados): `public.conteudos` = aulas, `public.modulos` = trilhas, `public.anexos` = PDFs de apoio. Publicação e data de liberação valem por aula; a trilha só aparece para o aluno se tiver aula visível.
- Vídeo: o admin cola o link; guarda-se só o ID (11 caracteres) e `provedor = 'youtube'`. Player `https://www.youtube-nocookie.com/embed/<id>` sem carregar o `iframe_api` (conversa por `postMessage`, em `_app/player.js`). Vimeo e Panda continuam aceitos.
- CSP: `aluno/aula/.htaccess` libera `frame-src https://www.youtube-nocookie.com`; `aluno/`, `aluno/aula/` e `admin/` liberam `img-src https://i.ytimg.com` (capas); `admin/` libera também o `frame-src` do YouTube (prévia no formulário).
- Vitrine do aluno (decisão da GPM, 18/11/2026, no estilo COR Academia; antes, 13/11, estilo Netflix):
  - No topo, a aula em destaque: a marcada como "Destaque" no painel; senão a que o aluno está assistindo; senão a primeira não concluída. Mostra "Olá, Nome! Boas-vindas à Academia de Virtudes.", trilha, título, resumo da descrição e os botões "Começar agora"/"Continuar" e "Ver trilha completa". Imagem: capa da aula, senão a do YouTube (`maxresdefault`), senão a foto do auditório. Sem aula, fica o banner de boas-vindas do HTML.
  - Depois: "Onde você está crescendo" (um cartão por trilha, com progresso), "Continue assistindo", uma fileira por trilha, "Outras aulas" (só se houver aula sem trilha), "Mais assistidas pelos alunos" (função `aulas_mais_vistas`, migration 0008; só aparece com 2 aulas ou mais e se a função existir) e "Seu aproveitamento" (aulas concluídas, tempo de estudo, trilhas concluídas).
  - Cada cartão é uma aula, com imagem deitada (16:9) e o título por cima. Ao passar o mouse, aparecem o ▶ e "x de y min". A barra de progresso fica embaixo da imagem.
  - Capa ideal: 1280 × 720 px. Sem capa, usa a do YouTube (`hq720`, ou `hqdefault` se não houver).
- PDFs: bucket privado `materiais`, link assinado de 60 s gerado no clique (Abrir e Baixar). O envio no painel usa XHR com o token da sessão para mostrar a barra de progresso; a política do bucket continua decidindo quem grava.

### Acesso só por aprovação (decisão da GPM, 25/11/2026)

- O cadastro aberto acabou: `/academiadevirtudes/cadastro/` só leva para `/academiadevirtudes/colaborador/`, onde a pessoa pede acesso (nome, WhatsApp, e-mail, empresa e motivo; vai para o Formspree `xoedlyqp` com o assunto "Pedido de acesso"). O pedido não cria conta. A equipe aprova e convida pelo painel (aba Alunos).
- No Supabase, "Allow new users to sign up" precisa ficar **desligado** (só o convite cria conta).

### Cadastro aberto (histórico, 11/2026 a 25/11/2026)

- Plataforma gratuita, com cadastro aberto em `/academiadevirtudes/cadastro/`. O convite pelo painel continua existindo, e o admin pode desativar qualquer pessoa.
- Cadastro aberto no Supabase desde 13/11/2026 ("Allow new users to sign up" ligado), testado do cadastro à confirmação. Os e-mails saem por SMTP próprio: caixa `academiadevirtudes@gpmintegracao.com.br` da Hostinger (`smtp.hostinger.com`, porta 465), remetente "Academia de Virtudes", limite de 100 e-mails por hora. Se a senha dessa caixa mudar, atualize em Authentication → Emails → SMTP Settings, senão os e-mails de cadastro param.
- Acesso só depois de: cadastro completo (nome, sobrenome, e-mail, WhatsApp, CPF, empresa, cargo, senha), CAPTCHA, aceite da privacidade e confirmação do e-mail (`/academiadevirtudes/confirmar/`, que grava o aceite com `aceitar_privacidade()`).
- No banco, conteúdo só aparece com `is_active() and cadastro_completo()` (admin com MFA vê tudo). No site, quem está com o cadastro incompleto vai para `/aluno/completar/` antes de qualquer página.
- Regras dos campos: `_app/campos.js` no navegador e a migration 0006 no banco (as duas precisam bater). WhatsApp e CPF ficam só com dígitos; o CPF é validado, só é preenchido pelo aluno se estiver vazio e sai dos metadados da conta (não vai no token de sessão).
- Consentimento de comunicações é separado e opcional: só muda pela função `definir_comunicacoes()`, que grava a data e registra na auditoria.
- Nenhuma tela pode revelar se um e-mail já tem conta (cadastro, reenvio, login e "esqueci minha senha" respondem igual).

## Inscrições nos encontros (Supabase, branch `inscricoes-supabase`, 24/11/2026)

- Tabelas `eventos`, `cotas_doacao` e `inscricoes` (migrations 0009 e 0010): RLS sem nenhuma política para anon ou aluno; só admin com MFA. O site lê só `evento_publico(evento)` (situação e tamanhos de fralda livres, nunca números).
- Inscrição e presença só pelas Edge Functions `inscricao` e `confirmar-presenca` (CAPTCHA no servidor, limite por IP com hash e sal `IP_SALT`, logs mascarados). Vagas e cotas conferidas num gatilho com trava no evento.
- **Inscrição ≠ portal**: `inscricoes` não cria nem altera `auth.users`/`profiles`, não tem FK para a Área do Aluno, e nenhuma tela ou e-mail da inscrição tem link para cadastro, login ou "Sou colaborador". O painel só mostra, como informação, que o e-mail também tem conta no portal.
- Repetido: junta só por WhatsApp. E-mail ou nome iguais com outro WhatsApp viram linha nova com "Possível repetido".
- Encontro 3: 11/12/2026, das 9h às 17h (`data_inicio` e `data_fim`, migration 0011), Centro Empresarial Office Tower · Av. Evandro Lins e Silva, 840. 50 lugares (1 reservado); acompanhante ocupa 2. Fraldas Pampers ou Huggies, 1 pacote por pessoa, cotas P 17 · M 17 · G 16; lista de espera não reserva cota; cancelado ou "não vai" devolve lugar e cota.
- E-mail de confirmação pelo Resend (secret `RESEND_API_KEY`), remetente `Academia de Virtudes <inscricoes@academia.gpmintegracao.com.br>` (subdomínio verificado no Resend desde 25/11/2026; o domínio raiz está em outra conta do Resend e não pode ser usado), resposta para `marketing@gpmintegracao.com.br` (secrets `EMAIL_REMETENTE` e `EMAIL_RESPONDER_PARA`). Textos em `supabase/functions/_shared/modelos-email.mjs`. Sem a chave, fica "não enviado" e o painel reenvia depois. Máximo 1 e-mail a cada 10 min por inscrição (o painel pode forçar).
- Painel: aba Inscrições (`admin/inscricoes.js`). Passo a passo, segredos, DNS e testes: `supabase/PAINEL.md`, item 13.
- O DNS do domínio fica na Hostinger (`dns-parking.com`) e o e-mail do domínio (MX/SPF) também está na Hostinger.
- Testes do banco num Postgres local: binários portáteis do PostgreSQL 17 em `C:\Users\Gabi\ferramentas\pgsql` (fora do repositório; dados em `ferramentas\pgdata`, porta 54329, só localhost) com `ferramentas\supabase-shim.sql` imitando o mínimo do Supabase. Para ligar: `pgsql\bin\pg_ctl -D pgdata -o "-p 54329" start`.

## Supabase

- Projeto: `https://qfghgtrvwklzlsuawndm.supabase.co` (região São Paulo).
- SQL e migrations ficam em `supabase/` (excluída do deploy).
- O agente escreve o SQL, mas **quem executa no Supabase é a equipe GPM**. O agente nunca executa SQL nem altera configurações do painel.
- Admin exige MFA: a função `is_admin()` só é verdadeira com a sessão em `aal2`.
- CAPTCHA Cloudflare Turnstile ligado no Supabase: todo login e toda recuperação de senha precisam enviar o token (`captchaToken`).
- Ao fim de cada fase, o Security Advisor (Advisors → Security) precisa estar sem alertas.

## Pendências

- HSTS começa com `max-age=300` e **sem** `includeSubDomains`. Depois de confirmar que todas as páginas abrem normalmente, subir para `31536000` em outro commit (e só incluir subdomínios depois de confirmar quais existem).
- Limpar no servidor (`public_html`) o que ficou de envios manuais antigos: a pasta `public_html/` criada por engano em 12/11/2026, `.github/`, `.gitignore`, `._tmp_sobre_patch.txt`, `index.html.html`, os `.ps1` e o CRM antigo (`crm/`, `CRM/`, `GPM_CRM/`).

## Histórico

- Funil e CRM antigos (`GPM_CRM/`, `CRM/`) foram excluídos em 11/2026 por decisão da GPM. O novo funil será um projeto separado e deve seguir as mesmas regras de segurança da Área do Aluno.
