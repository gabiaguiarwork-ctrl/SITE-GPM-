-- =====================================================================
-- Academia de Virtudes · 0009 · Inscrições e confirmação de presença
-- (sai o Formspree; 24/11/2026)
--
-- Rodar no SQL Editor DEPOIS da 0008. Idempotente.
--
-- Desenho de segurança
-- - eventos, cotas_doacao e inscricoes: RLS ligado e NENHUMA política para
--   anon ou aluno. Só admin com MFA (is_admin() = aal2) lê e altera.
-- - O público nunca fala direto com estas tabelas:
--     · o site lê só public.evento_publico(slug): situação e tamanhos de fralda
--       disponíveis, sem nenhum número;
--     · inscrição e confirmação de presença passam pelas Edge Functions
--       "inscricao" e "confirmar-presenca" (chave do servidor), que chamam
--       public.inscricao_registrar / public.presenca_* (executáveis só por service_role).
-- - Vagas e cotas de fralda são conferidas num gatilho que trava a linha do
--   evento (FOR UPDATE): duas inscrições ao mesmo tempo não estouram o limite,
--   venham do site, do painel ou de SQL manual.
-- - Repetido: junta só por WhatsApp (mesmo evento). E-mail ou nome iguais com
--   WhatsApp diferente viram linha nova, com o aviso "Possível repetido" no painel.
-- - Auditoria: alteração e exclusão feitas pelo painel, reenvio do formulário
--   e exportação. A auditoria guarda só os NOMES dos campos alterados, nunca os
--   valores, para que "Excluir inscrição" apague os dados de verdade.
-- =====================================================================

-- O site (anon) só executa as funções do esquema privado liberadas uma a uma.
-- As novas funções continuam sem EXECUTE por padrão (alter default privileges da 0001).
grant usage on schema privado to anon;

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------
create table if not exists public.eventos (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 60),
  titulo              text not null check (char_length(titulo) between 3 and 120),
  data_inicio         timestamptz not null,
  local               text check (local is null or char_length(local) <= 200),
  capacidade          integer not null default 0 check (capacidade between 0 and 5000),
  reservados          integer not null default 0 check (reservados between 0 and 5000),
  inscricoes_abertas  boolean not null default false,
  lista_espera        boolean not null default true,
  doacao_marca        text not null default 'Pampers ou Huggies' check (char_length(doacao_marca) between 2 and 80),
  mensagem_whatsapp   text check (mensagem_whatsapp is null or char_length(mensagem_whatsapp) <= 1000),
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);
comment on table public.eventos is 'Encontros da Academia. Só admin com MFA lê e altera; o site vê só public.evento_publico().';
comment on column public.eventos.capacidade is 'Lugares no total, contando titulares e acompanhantes.';
comment on column public.eventos.reservados is 'Lugares da organização (ex.: palestrante), descontados das vagas.';
comment on column public.eventos.mensagem_whatsapp is 'Mensagem do pedido de confirmação. {nome} e {link} são trocados no painel.';

-- Cotas de fralda por evento e tamanho (contadas por pessoa: titular e acompanhante).
create table if not exists public.cotas_doacao (
  evento_id  uuid not null references public.eventos (id) on delete cascade,
  tamanho    text not null check (tamanho in ('P', 'M', 'G')),
  cota       integer not null check (cota between 0 and 5000),
  primary key (evento_id, tamanho)
);
comment on table public.cotas_doacao is 'Quantos pacotes de cada tamanho o evento recebe. Só admin com MFA.';

create table if not exists public.inscricoes (
  id                           uuid primary key default gen_random_uuid(),
  evento_id                    uuid not null references public.eventos (id) on delete restrict,
  criado_em                    timestamptz not null default now(),
  atualizado_em                timestamptz not null default now(),
  nome                         text not null check (char_length(nome) between 3 and 120),
  whatsapp                     text not null check (whatsapp ~ '^[1-9][1-9]([0-9]{8}|9[0-9]{8})$'),
  email                        text not null check (char_length(email) <= 254 and email = lower(email)
                                                    and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  empresa                      text not null check (char_length(empresa) between 1 and 120),
  cargo                        text not null check (char_length(cargo) between 1 and 120),
  equipe_gpm                   boolean not null default false,
  convidado_por                text check (convidado_por is null or char_length(convidado_por) between 1 and 120),
  participou                   text[] not null default '{}'
                               check (array_to_string(participou, ',') ~ '^(encontro-[0-9]{1,2}(,encontro-[0-9]{1,2})*)?$'),
  perfil_ia                    text check (perfil_ia in ('Reativo', 'Usuário Google', 'Especialista', 'Nexialista', 'Ainda não sei')),
  doacao_tamanho               text check (doacao_tamanho in ('P', 'M', 'G')),
  acompanhante                 boolean not null default false,
  acompanhante_nome            text check (acompanhante_nome is null or char_length(acompanhante_nome) between 3 and 120),
  acompanhante_whatsapp        text check (acompanhante_whatsapp is null or acompanhante_whatsapp ~ '^[1-9][1-9]([0-9]{8}|9[0-9]{8})$'),
  acompanhante_doacao_tamanho  text check (acompanhante_doacao_tamanho in ('P', 'M', 'G')),
  pessoas                      integer generated always as (case when acompanhante then 2 else 1 end) stored,
  consentimento_dados_em       timestamptz not null default now(),
  aceite_comunicacoes          boolean not null default false,
  aceite_comunicacoes_em       timestamptz,
  origem                       text not null default 'site-academia-v2' check (char_length(origem) between 2 and 40),
  status                       text not null default 'inscrito' check (status in ('inscrito', 'lista_espera', 'cancelado')),
  confirmacao                  text not null default 'aguardando' check (confirmacao in ('aguardando', 'sim', 'nao_vai')),
  confirmado_em                timestamptz,
  checkin_em                   timestamptz,
  acompanhante_checkin_em      timestamptz,
  token_confirmacao            text not null unique
                               default translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_')
                               check (token_confirmacao ~ '^[A-Za-z0-9_-]{32,}$'),
  envios                       integer not null default 1 check (envios >= 1),
  observacoes                  text check (observacoes is null or char_length(observacoes) <= 2000),
  constraint inscricoes_evento_whatsapp_unico unique (evento_id, whatsapp),
  constraint inscricoes_acompanhante_completo check (
    (acompanhante and acompanhante_nome is not null and acompanhante_whatsapp is not null)
    or (not acompanhante and acompanhante_nome is null and acompanhante_whatsapp is null
        and acompanhante_doacao_tamanho is null and acompanhante_checkin_em is null)
  )
);
comment on table public.inscricoes is 'Inscrições nos encontros. Sem acesso para anon/aluno; só admin com MFA e as Edge Functions.';
comment on column public.inscricoes.token_confirmacao is 'Aleatório (24 bytes, base64url). Vai só no link individual de presença.';

create index if not exists inscricoes_evento_idx on public.inscricoes (evento_id, status);
create index if not exists inscricoes_email_idx  on public.inscricoes (evento_id, email);

alter table public.eventos      enable row level security;
alter table public.cotas_doacao enable row level security;
alter table public.inscricoes   enable row level security;

-- Limite de envios por origem (IP guardado só como hash com sal secreto). Só o servidor usa.
create table if not exists privado.limites_envio (
  id     bigint generated always as identity primary key,
  chave  text not null check (char_length(chave) between 16 and 128),
  acao   text not null check (acao in ('inscricao', 'presenca')),
  quando timestamptz not null default now()
);
create index if not exists limites_envio_idx on privado.limites_envio (acao, chave, quando desc);
revoke all on table privado.limites_envio from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Vagas e cotas
-- ---------------------------------------------------------------------

-- Ocupa lugar e cota: inscrito que não disse "não vai".
create or replace function privado.inscricao_conta(status text, confirmacao text)
returns boolean
language sql immutable set search_path = ''
as $$ select status = 'inscrito' and confirmacao <> 'nao_vai'; $$;

-- Lugares livres no evento (pode ficar negativo se o admin baixar a capacidade).
create or replace function privado.vagas_restantes(evento uuid)
returns integer
language sql stable security definer set search_path = ''
as $$
  select e.capacidade - e.reservados - coalesce((
           select sum(i.pessoas) from public.inscricoes i
            where i.evento_id = e.id and privado.inscricao_conta(i.status, i.confirmacao)), 0)::integer
    from public.eventos e where e.id = evento;
$$;

-- Pacotes de cada tamanho já reservados (titulares + acompanhantes que contam).
create or replace function privado.cotas_usadas(evento uuid)
returns table (tamanho text, usados integer)
language sql stable security definer set search_path = ''
as $$
  select t.tamanho, count(*)::integer
    from public.inscricoes i
   cross join lateral (values (i.doacao_tamanho), (case when i.acompanhante then i.acompanhante_doacao_tamanho end)) t (tamanho)
   where i.evento_id = evento and privado.inscricao_conta(i.status, i.confirmacao) and t.tamanho is not null
   group by t.tamanho;
$$;

-- Tamanhos com pelo menos 1 pacote livre, em ordem P, M, G.
create or replace function privado.tamanhos_disponiveis(evento uuid)
returns text[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(c.tamanho order by position(c.tamanho in 'PMG')), '{}')
    from public.cotas_doacao c
    left join privado.cotas_usadas(evento) u on u.tamanho = c.tamanho
   where c.evento_id = evento and c.cota > coalesce(u.usados, 0);
$$;

-- Gatilho: nenhuma gravação (site, painel ou SQL) passa da capacidade nem das cotas.
-- Trava a linha do evento, então duas inscrições simultâneas são conferidas uma depois da outra.
create or replace function privado.conferir_vagas()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  ev        public.eventos;
  livres    integer;
  tam       text;
  pedido    integer;
  usados    integer;
  limite    integer;
begin
  if not privado.inscricao_conta(new.status, new.confirmacao) then
    return new;
  end if;
  -- Edição que não muda lugares nem tamanhos (ex.: corrigir o nome) não é barrada.
  if tg_op = 'UPDATE' and privado.inscricao_conta(old.status, old.confirmacao)
     and old.evento_id = new.evento_id and old.acompanhante = new.acompanhante
     and old.doacao_tamanho is not distinct from new.doacao_tamanho
     and old.acompanhante_doacao_tamanho is not distinct from new.acompanhante_doacao_tamanho then
    return new;
  end if;

  select * into ev from public.eventos where id = new.evento_id for update;

  select ev.capacidade - ev.reservados - coalesce(sum(i.pessoas), 0) into livres
    from public.inscricoes i
   where i.evento_id = new.evento_id and i.id <> new.id and privado.inscricao_conta(i.status, i.confirmacao);
  if livres < new.pessoas then
    raise exception 'sem_vaga' using errcode = 'P0001', hint = 'Não há lugares para esta inscrição.';
  end if;

  foreach tam in array array['P', 'M', 'G'] loop
    pedido := (case when new.doacao_tamanho = tam then 1 else 0 end)
            + (case when new.acompanhante and new.acompanhante_doacao_tamanho = tam then 1 else 0 end);
    continue when pedido = 0;
    select c.cota into limite from public.cotas_doacao c where c.evento_id = new.evento_id and c.tamanho = tam;
    if limite is null then
      continue;  -- evento sem cota cadastrada para este tamanho: sem limite
    end if;
    select count(*) into usados
      from public.inscricoes i
     cross join lateral (values (i.doacao_tamanho), (case when i.acompanhante then i.acompanhante_doacao_tamanho end)) t (tamanho)
     where i.evento_id = new.evento_id and i.id <> new.id and privado.inscricao_conta(i.status, i.confirmacao)
       and t.tamanho = tam;
    if usados + pedido > limite then
      raise exception 'tamanho_esgotado' using errcode = 'P0001', detail = tam, hint = 'A cota deste tamanho de fralda acabou.';
    end if;
  end loop;
  return new;
end;
$$;

-- Normaliza o que vem de qualquer lugar (painel ou SQL): e-mail minúsculo, WhatsApp só com dígitos,
-- espaços repetidos. Também grava as datas de confirmação e do consentimento de comunicações.
create or replace function privado.normalizar_inscricao()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.nome          := privado.texto_limpo(new.nome, 0, 200);
  new.email         := lower(btrim(new.email));
  new.whatsapp      := coalesce(privado.whatsapp_limpo(new.whatsapp), privado.so_digitos(new.whatsapp));
  new.empresa       := privado.texto_limpo(new.empresa, 0, 200);
  new.cargo         := privado.texto_limpo(new.cargo, 0, 200);
  new.convidado_por := privado.texto_limpo(new.convidado_por, 1, 200);
  if new.acompanhante then
    new.acompanhante_nome     := privado.texto_limpo(new.acompanhante_nome, 0, 200);
    new.acompanhante_whatsapp := coalesce(privado.whatsapp_limpo(new.acompanhante_whatsapp), privado.so_digitos(new.acompanhante_whatsapp));
  else
    new.acompanhante_nome := null; new.acompanhante_whatsapp := null;
    new.acompanhante_doacao_tamanho := null; new.acompanhante_checkin_em := null;
  end if;
  if tg_op = 'INSERT' or new.confirmacao is distinct from old.confirmacao then
    new.confirmado_em := case when new.confirmacao <> 'aguardando' then now() end;
  end if;
  if tg_op = 'INSERT' or new.aceite_comunicacoes is distinct from old.aceite_comunicacoes then
    new.aceite_comunicacoes_em := case when new.aceite_comunicacoes then now() end;
  end if;
  if tg_op = 'UPDATE' then
    new.token_confirmacao := old.token_confirmacao;   -- o link individual nunca muda
    new.criado_em := old.criado_em;
    new.consentimento_dados_em := old.consentimento_dados_em;
    new.atualizado_em := now();
  end if;
  return new;
end;
$$;

-- Auditoria das ações do painel (admin identificado). Guarda só os nomes dos campos.
create or replace function privado.auditar_inscricao()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  quem    uuid := privado.ator();
  campos  text[];
begin
  if quem is null then
    return null;  -- site e Edge Functions registram o que precisam por conta própria
  end if;
  if tg_op = 'DELETE' then
    insert into public.auditoria (quem, acao, alvo, detalhes)
    values (quem, 'excluir_inscricao', old.id::text, jsonb_build_object('evento', old.evento_id));
    return null;
  end if;
  if tg_op = 'INSERT' then
    insert into public.auditoria (quem, acao, alvo, detalhes)
    values (quem, 'criar_inscricao', new.id::text, jsonb_build_object('evento', new.evento_id, 'origem', new.origem));
    return null;
  end if;
  select array_agg(n.key order by n.key) into campos
    from jsonb_each(to_jsonb(new)) n
   where n.key not in ('atualizado_em', 'confirmado_em', 'aceite_comunicacoes_em', 'pessoas')
     and n.value is distinct from (to_jsonb(old) -> n.key);
  if campos is not null then
    insert into public.auditoria (quem, acao, alvo, detalhes)
    values (quem, 'alterar_inscricao', new.id::text,
            jsonb_build_object('evento', new.evento_id, 'campos', campos,
                               'status', new.status, 'confirmacao', new.confirmacao));
  end if;
  return null;
end;
$$;

create or replace function privado.auditar_evento()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.auditoria (quem, acao, alvo, detalhes)
  values (privado.ator(), case tg_op when 'INSERT' then 'criar_evento' when 'DELETE' then 'excluir_evento' else 'alterar_evento' end,
          coalesce(new.id, old.id)::text, jsonb_build_object('slug', coalesce(new.slug, old.slug)));
  return null;
end;
$$;

drop trigger if exists eventos_atualizado on public.eventos;
create trigger eventos_atualizado before update on public.eventos
  for each row execute function privado.tocar_atualizado_em();
drop trigger if exists eventos_auditar on public.eventos;
create trigger eventos_auditar after insert or update or delete on public.eventos
  for each row execute function privado.auditar_evento();

drop trigger if exists inscricoes_normalizar on public.inscricoes;
create trigger inscricoes_normalizar before insert or update on public.inscricoes
  for each row execute function privado.normalizar_inscricao();
-- "z" no nome: roda depois da normalização (os gatilhos BEFORE rodam em ordem alfabética).
drop trigger if exists inscricoes_z_vagas on public.inscricoes;
create trigger inscricoes_z_vagas before insert or update on public.inscricoes
  for each row execute function privado.conferir_vagas();
drop trigger if exists inscricoes_auditar on public.inscricoes;
create trigger inscricoes_auditar after insert or update or delete on public.inscricoes
  for each row execute function privado.auditar_inscricao();

-- ---------------------------------------------------------------------
-- Situação pública (site, sem login)
-- ---------------------------------------------------------------------
-- abertas · ultimas_vagas (4 lugares ou menos) · lista_espera · encerradas.
-- "acompanhante" = ainda cabem 2 pessoas (com 1 lugar só, o site avisa na etapa do acompanhante).
-- Nenhum número sai daqui.
create or replace function privado.evento_publico(evento text)
returns table (slug text, titulo text, data_inicio timestamptz, local text, inscricoes_abertas boolean,
               situacao text, tamanhos text[], acompanhante boolean, doacao_marca text)
language plpgsql stable security definer set search_path = ''
as $$
declare
  ev     public.eventos;
  livres integer;
  tams   text[];
  sit    text;
begin
  select * into ev from public.eventos e where e.slug = evento_publico.evento;
  if not found then
    return;
  end if;
  livres := privado.vagas_restantes(ev.id);
  tams := privado.tamanhos_disponiveis(ev.id);
  sit := case
           when not ev.inscricoes_abertas or ev.data_inicio < now() then 'encerradas'
           when livres <= 0 or cardinality(tams) = 0 then case when ev.lista_espera then 'lista_espera' else 'encerradas' end
           when livres <= 4 then 'ultimas_vagas'
           else 'abertas'
         end;
  return query select ev.slug, ev.titulo, ev.data_inicio, ev.local, ev.inscricoes_abertas, sit,
                      case when sit in ('abertas', 'ultimas_vagas') then tams else '{}'::text[] end,
                      livres >= 2 or sit = 'lista_espera', ev.doacao_marca;
end;
$$;

create or replace function public.evento_publico(evento text)
returns table (slug text, titulo text, data_inicio timestamptz, local text, inscricoes_abertas boolean,
               situacao text, tamanhos text[], acompanhante boolean, doacao_marca text)
language sql stable security invoker set search_path = ''
as $$ select * from privado.evento_publico(evento); $$;

-- ---------------------------------------------------------------------
-- Inscrição (só pela Edge Function "inscricao", com a chave do servidor)
-- ---------------------------------------------------------------------
-- Recebe os campos já conferidos pela Edge Function; o banco confere de novo.
-- Devolve só {ok, situacao} ou {ok:false, erro, tamanhos}. Nunca devolve dados de inscritos.
create or replace function privado.gravar_inscricao(dados jsonb, origem_padrao text, exigir_aberto boolean)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  ev         public.eventos;
  antiga     public.inscricoes;
  nova       public.inscricoes;
  zap        text := privado.whatsapp_limpo(dados ->> 'whatsapp');
  acomp      boolean := coalesce((dados ->> 'acompanhante')::boolean, false);
  n_pessoas  integer;
  livres     integer;
  livres_tam jsonb;       -- {"P": 3, "M": 0, ...} sem contar o que a própria pessoa já tinha
  tams       text[];      -- tamanhos com pelo menos 1 pacote livre
  pedidos    text[];
  situacao   text;
  campos     text[];
begin
  if jsonb_typeof(dados) is distinct from 'object' then
    return jsonb_build_object('ok', false, 'erro', 'dados');
  end if;
  if coalesce((dados ->> 'consentimento')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'erro', 'consentimento');
  end if;
  if zap is null then
    return jsonb_build_object('ok', false, 'erro', 'dados');
  end if;

  -- Trava o evento: vagas, cotas e repetido decididos numa fila só.
  select * into ev from public.eventos e where e.slug = dados ->> 'evento' for update;
  if not found or (exigir_aberto and (not ev.inscricoes_abertas or ev.data_inicio < now())) then
    return jsonb_build_object('ok', false, 'erro', 'encerradas');
  end if;

  -- Repetido: mesmo WhatsApp no mesmo evento.
  select * into antiga from public.inscricoes i where i.evento_id = ev.id and i.whatsapp = zap for update;

  n_pessoas := case when acomp then 2 else 1 end;
  select ev.capacidade - ev.reservados - coalesce(sum(i.pessoas), 0) into livres
    from public.inscricoes i
   where i.evento_id = ev.id and i.id is distinct from antiga.id and privado.inscricao_conta(i.status, i.confirmacao);

  select coalesce(jsonb_object_agg(c.tamanho, c.cota - coalesce(u.usados, 0)), '{}') into livres_tam
    from public.cotas_doacao c
    left join (select t.tamanho, count(*)::integer as usados
                 from public.inscricoes i
                cross join lateral (values (i.doacao_tamanho), (case when i.acompanhante then i.acompanhante_doacao_tamanho end)) t (tamanho)
                where i.evento_id = ev.id and i.id is distinct from antiga.id
                  and privado.inscricao_conta(i.status, i.confirmacao) and t.tamanho is not null
                group by t.tamanho) u on u.tamanho = c.tamanho
   where c.evento_id = ev.id;
  select coalesce(array_agg(x.k order by position(x.k in 'PMG')), '{}') into tams
    from jsonb_each_text(livres_tam) x (k, v) where x.v::integer > 0;

  pedidos := array_remove(array[dados ->> 'doacao_tamanho', case when acomp then dados ->> 'acompanhante_doacao_tamanho' end], null);

  if livres < n_pessoas or (livres_tam <> '{}' and cardinality(tams) = 0) then
    -- Lotado (lugares ou fraldas): lista de espera, que não reserva cota.
    if not ev.lista_espera then
      return jsonb_build_object('ok', false, 'erro', 'encerradas');
    end if;
    situacao := 'lista_espera';
  else
    situacao := 'inscrito';
    -- Cada tamanho pedido precisa caber (titular e acompanhante podem pedir o mesmo).
    if livres_tam <> '{}' and exists (
         select 1 from unnest(pedidos) p group by p
         having count(*) > coalesce((livres_tam ->> p)::integer, 0)) then
      return jsonb_build_object('ok', false, 'erro', 'tamanho_esgotado', 'tamanhos', to_jsonb(tams));
    end if;
  end if;

  if antiga.id is null then
    insert into public.inscricoes (evento_id, nome, whatsapp, email, empresa, cargo, equipe_gpm, convidado_por, participou,
                                   perfil_ia, doacao_tamanho, acompanhante, acompanhante_nome, acompanhante_whatsapp,
                                   acompanhante_doacao_tamanho, aceite_comunicacoes, origem, status)
    values (ev.id,
            privado.texto_validado(dados ->> 'nome', 3, 120, 'nome'),
            zap,
            lower(btrim(dados ->> 'email')),
            privado.texto_validado(dados ->> 'empresa', 1, 120, 'empresa'),
            privado.texto_validado(dados ->> 'cargo', 1, 120, 'cargo'),
            coalesce((dados ->> 'equipe_gpm')::boolean, false),
            privado.texto_validado(dados ->> 'convidado_por', 1, 120, 'convidado_por'),
            coalesce((select array_agg(distinct x order by x) from jsonb_array_elements_text(coalesce(dados -> 'participou', '[]')) x), '{}'),
            nullif(dados ->> 'perfil_ia', ''),
            dados ->> 'doacao_tamanho',
            acomp,
            case when acomp then privado.texto_validado(dados ->> 'acompanhante_nome', 3, 120, 'acompanhante_nome') end,
            case when acomp then privado.whatsapp_limpo(dados ->> 'acompanhante_whatsapp') end,
            case when acomp then dados ->> 'acompanhante_doacao_tamanho' end,
            coalesce((dados ->> 'aceite_comunicacoes')::boolean, false),
            coalesce(nullif(dados ->> 'origem', ''), origem_padrao),
            situacao)
    returning * into nova;
  else
    update public.inscricoes i set
      nome                        = privado.texto_validado(dados ->> 'nome', 3, 120, 'nome'),
      email                       = lower(btrim(dados ->> 'email')),
      empresa                     = privado.texto_validado(dados ->> 'empresa', 1, 120, 'empresa'),
      cargo                       = privado.texto_validado(dados ->> 'cargo', 1, 120, 'cargo'),
      equipe_gpm                  = coalesce((dados ->> 'equipe_gpm')::boolean, false),
      convidado_por               = privado.texto_validado(dados ->> 'convidado_por', 1, 120, 'convidado_por'),
      participou                  = coalesce((select array_agg(distinct x order by x) from jsonb_array_elements_text(coalesce(dados -> 'participou', '[]')) x), '{}'),
      perfil_ia                   = nullif(dados ->> 'perfil_ia', ''),
      doacao_tamanho              = dados ->> 'doacao_tamanho',
      acompanhante                = acomp,
      acompanhante_nome           = case when acomp then privado.texto_validado(dados ->> 'acompanhante_nome', 3, 120, 'acompanhante_nome') end,
      acompanhante_whatsapp       = case when acomp then privado.whatsapp_limpo(dados ->> 'acompanhante_whatsapp') end,
      acompanhante_doacao_tamanho = case when acomp then dados ->> 'acompanhante_doacao_tamanho' end,
      acompanhante_checkin_em     = case when acomp then i.acompanhante_checkin_em end,
      aceite_comunicacoes         = coalesce((dados ->> 'aceite_comunicacoes')::boolean, false),
      status                      = situacao,
      -- quem tinha dito "não vai" e se inscreveu de novo volta para "aguardando"
      confirmacao                 = case when i.confirmacao = 'nao_vai' then 'aguardando' else i.confirmacao end,
      envios                      = i.envios + 1
     where i.id = antiga.id
    returning * into nova;

    select array_agg(n.key order by n.key) into campos
      from jsonb_each(to_jsonb(nova)) n
     where n.key not in ('atualizado_em', 'envios', 'confirmado_em', 'aceite_comunicacoes_em', 'pessoas')
       and n.value is distinct from (to_jsonb(antiga) -> n.key);
    insert into public.auditoria (quem, acao, alvo, detalhes)
    values (null, 'inscricao_reenviada', nova.id::text,
            jsonb_build_object('evento', ev.id, 'envio', nova.envios, 'campos_alterados', coalesce(campos, '{}'),
                               'envio_anterior_em', antiga.atualizado_em));
  end if;

  return jsonb_build_object('ok', true, 'situacao', nova.status);
exception
  when check_violation or not_null_violation or invalid_text_representation then
    return jsonb_build_object('ok', false, 'erro', 'dados');
  when raise_exception then
    if sqlerrm = 'tamanho_esgotado' then
      return jsonb_build_object('ok', false, 'erro', 'tamanho_esgotado', 'tamanhos', to_jsonb(privado.tamanhos_disponiveis(ev.id)));
    elsif sqlerrm = 'sem_vaga' then
      return jsonb_build_object('ok', false, 'erro', 'encerradas');
    end if;
    raise;
end;
$$;

create or replace function privado.inscricao_registrar(dados jsonb)
returns jsonb
language sql volatile security definer set search_path = ''
as $$ select privado.gravar_inscricao(dados, 'site-academia-v2', true); $$;

create or replace function public.inscricao_registrar(dados jsonb)
returns jsonb
language sql volatile security invoker set search_path = ''
as $$ select privado.inscricao_registrar(dados); $$;

-- Limite de envios: devolve true se ainda pode enviar (e registra o envio).
create or replace function privado.permitir_envio(chave text, acao text, maximo integer, janela_segundos integer)
returns boolean
language plpgsql volatile security definer set search_path = ''
as $$
declare
  n integer;
begin
  delete from privado.limites_envio l where l.quando < now() - interval '1 day';
  select count(*) into n from privado.limites_envio l
   where l.acao = permitir_envio.acao and l.chave = permitir_envio.chave
     and l.quando > now() - make_interval(secs => janela_segundos);
  if n >= maximo then
    return false;
  end if;
  insert into privado.limites_envio (chave, acao) values (permitir_envio.chave, permitir_envio.acao);
  return true;
end;
$$;

create or replace function public.permitir_envio(chave text, acao text, maximo integer, janela_segundos integer)
returns boolean
language sql volatile security invoker set search_path = ''
as $$ select privado.permitir_envio(chave, acao, maximo, janela_segundos); $$;

-- ---------------------------------------------------------------------
-- Confirmação de presença (só pela Edge Function "confirmar-presenca")
-- ---------------------------------------------------------------------
-- Token inválido, inscrição cancelada ou evento já realizado: {ok:false} (mensagem neutra no site).
create or replace function privado.presenca_consultar(token text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object(
             'ok', true,
             'primeiro_nome', split_part(i.nome, ' ', 1),
             'titulo', e.titulo, 'data_inicio', e.data_inicio, 'local', e.local,
             'resposta', i.confirmacao,
             'doacao_marca', e.doacao_marca,
             'tamanhos', to_jsonb(array_remove(array[i.doacao_tamanho, case when i.acompanhante then i.acompanhante_doacao_tamanho end], null)))
      from public.inscricoes i
      join public.eventos e on e.id = i.evento_id
     where token ~ '^[A-Za-z0-9_-]{32,64}$'
       and i.token_confirmacao = token
       and i.status <> 'cancelado'
       and e.data_inicio > now() - interval '12 hours'
  ), jsonb_build_object('ok', false));
$$;

create or replace function privado.presenca_confirmar(token text, resposta text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  alvo uuid;
begin
  if resposta not in ('sim', 'nao_vai') then
    return jsonb_build_object('ok', false);
  end if;
  select i.id into alvo
    from public.inscricoes i join public.eventos e on e.id = i.evento_id
   where token ~ '^[A-Za-z0-9_-]{32,64}$' and i.token_confirmacao = token
     and i.status <> 'cancelado' and e.data_inicio > now() - interval '12 hours';
  if alvo is null then
    return jsonb_build_object('ok', false);
  end if;
  begin
    update public.inscricoes set confirmacao = resposta where id = alvo;
  exception when raise_exception then
    -- disse "não vai", a vaga foi para outra pessoa e agora quer voltar
    return jsonb_build_object('ok', false, 'erro', 'sem_vaga');
  end;
  return privado.presenca_consultar(token);
end;
$$;

create or replace function public.presenca_consultar(token text)
returns jsonb
language sql stable security invoker set search_path = ''
as $$ select privado.presenca_consultar(token); $$;

create or replace function public.presenca_confirmar(token text, resposta text)
returns jsonb
language sql volatile security invoker set search_path = ''
as $$ select privado.presenca_confirmar(token, resposta); $$;

-- ---------------------------------------------------------------------
-- Painel (admin com MFA)
-- ---------------------------------------------------------------------
-- Lista do painel: as colunas da tabela + aviso de possível repetido
-- (mesmo e-mail ou mesmo nome, com WhatsApp diferente, no mesmo evento).
create or replace view public.inscricoes_painel
with (security_invoker = true)
as
select i.*,
       exists (select 1 from public.inscricoes o
                where o.evento_id = i.evento_id and o.id <> i.id and o.whatsapp <> i.whatsapp
                  and (o.email = i.email or lower(o.nome) = lower(i.nome))) as possivel_repetido
  from public.inscricoes i;

-- Indicadores do topo da aba (números só para o admin).
create or replace function privado.admin_resumo_evento(evento uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not privado.is_admin() then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'inscritos',    count(*) filter (where i.status = 'inscrito'),
      'pessoas',      coalesce(sum(i.pessoas) filter (where privado.inscricao_conta(i.status, i.confirmacao)), 0),
      'vagas',        privado.vagas_restantes(evento),
      'lista_espera', count(*) filter (where i.status = 'lista_espera'),
      'confirmaram',  count(*) filter (where i.status = 'inscrito' and i.confirmacao = 'sim'),
      'aguardando',   count(*) filter (where i.status = 'inscrito' and i.confirmacao = 'aguardando'),
      'nao_vao',      count(*) filter (where i.status = 'inscrito' and i.confirmacao = 'nao_vai'),
      'presentes',    count(i.checkin_em) + count(i.acompanhante_checkin_em),
      'cotas',        coalesce((select jsonb_agg(jsonb_build_object('tamanho', c.tamanho, 'cota', c.cota,
                                                                    'reservados', coalesce(u.usados, 0))
                                                 order by position(c.tamanho in 'PMG'))
                                  from public.cotas_doacao c
                                  left join privado.cotas_usadas(evento) u on u.tamanho = c.tamanho
                                 where c.evento_id = evento), '[]'))
      from public.inscricoes i where i.evento_id = evento);
end;
$$;

create or replace function public.admin_resumo_evento(evento uuid)
returns jsonb
language sql stable security invoker set search_path = ''
as $$ select privado.admin_resumo_evento(evento); $$;

-- Exportação de CSV: o arquivo é montado no navegador; aqui só fica o registro.
create or replace function privado.admin_registrar_exportacao(evento uuid, modelo text, linhas integer)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not privado.is_admin() then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  if modelo not in ('completo', 'nome_whatsapp') then
    raise exception 'modelo inválido' using errcode = '22023';
  end if;
  insert into public.auditoria (quem, acao, alvo, detalhes)
  values (privado.ator(), 'exportar_inscricoes', evento::text, jsonb_build_object('modelo', modelo, 'linhas', linhas));
end;
$$;

create or replace function public.admin_registrar_exportacao(evento uuid, modelo text, linhas integer)
returns void
language sql volatile security invoker set search_path = ''
as $$ select privado.admin_registrar_exportacao(evento, modelo, linhas); $$;

-- Importação (uso futuro): uma linha por chamada, mesma regra de repetidos e vagas.
create or replace function privado.admin_importar_inscricao(evento uuid, dados jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  ev public.eventos;
  r  jsonb;
begin
  if not privado.is_admin() then
    raise exception 'acesso negado' using errcode = '42501';
  end if;
  select * into ev from public.eventos where id = evento;
  if not found then
    raise exception 'evento inexistente' using errcode = '22023';
  end if;
  -- A importação vale mesmo com as inscrições fechadas no site.
  r := privado.gravar_inscricao(dados || jsonb_build_object('evento', ev.slug, 'origem', 'importacao-planilha', 'consentimento', true),
                                'importacao-planilha', false);
  insert into public.auditoria (quem, acao, alvo, detalhes)
  values (privado.ator(), 'importar_inscricao', evento::text, jsonb_build_object('resultado', r -> 'situacao', 'erro', r -> 'erro'));
  return r;
end;
$$;

create or replace function public.admin_importar_inscricao(evento uuid, dados jsonb)
returns jsonb
language sql volatile security invoker set search_path = ''
as $$ select privado.admin_importar_inscricao(evento, dados); $$;

-- ---------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------
revoke execute on all functions in schema privado from public, anon;

-- Site (sem login)
grant execute on function privado.evento_publico(text)  to anon, authenticated, service_role;
revoke execute on function public.evento_publico(text) from public;
grant  execute on function public.evento_publico(text)  to anon, authenticated, service_role;

-- Só o servidor (Edge Functions)
revoke execute on function privado.inscricao_registrar(jsonb)                  from authenticated;
revoke execute on function privado.gravar_inscricao(jsonb, text, boolean)      from authenticated;
revoke execute on function privado.permitir_envio(text, text, integer, integer) from authenticated;
revoke execute on function privado.presenca_consultar(text)                    from authenticated;
revoke execute on function privado.presenca_confirmar(text, text)              from authenticated;
grant  execute on function privado.inscricao_registrar(jsonb)                  to service_role;
grant  execute on function privado.permitir_envio(text, text, integer, integer) to service_role;
grant  execute on function privado.presenca_consultar(text)                    to service_role;
grant  execute on function privado.presenca_confirmar(text, text)              to service_role;
revoke execute on function public.inscricao_registrar(jsonb)                   from public, anon, authenticated;
revoke execute on function public.permitir_envio(text, text, integer, integer)  from public, anon, authenticated;
revoke execute on function public.presenca_consultar(text)                     from public, anon, authenticated;
revoke execute on function public.presenca_confirmar(text, text)               from public, anon, authenticated;
grant  execute on function public.inscricao_registrar(jsonb)                   to service_role;
grant  execute on function public.permitir_envio(text, text, integer, integer)  to service_role;
grant  execute on function public.presenca_consultar(text)                     to service_role;
grant  execute on function public.presenca_confirmar(text, text)               to service_role;

-- Painel (a própria função confere is_admin())
grant  execute on function privado.admin_resumo_evento(uuid)                     to authenticated;
grant  execute on function privado.admin_registrar_exportacao(uuid, text, integer) to authenticated;
grant  execute on function privado.admin_importar_inscricao(uuid, jsonb)        to authenticated;
revoke execute on function public.admin_resumo_evento(uuid)                      from public, anon;
revoke execute on function public.admin_registrar_exportacao(uuid, text, integer) from public, anon;
revoke execute on function public.admin_importar_inscricao(uuid, jsonb)         from public, anon;
grant  execute on function public.admin_resumo_evento(uuid)                      to authenticated;
grant  execute on function public.admin_registrar_exportacao(uuid, text, integer) to authenticated;
grant  execute on function public.admin_importar_inscricao(uuid, jsonb)         to authenticated;

-- Funções usadas dentro das políticas e gatilhos
grant execute on function privado.inscricao_conta(text, text) to authenticated, service_role;
grant execute on function privado.vagas_restantes(uuid)       to authenticated, service_role;
grant execute on function privado.cotas_usadas(uuid)          to authenticated, service_role;
grant execute on function privado.tamanhos_disponiveis(uuid)  to authenticated, service_role;

revoke all on table public.eventos, public.cotas_doacao, public.inscricoes, public.inscricoes_painel from public, anon, authenticated;
grant select, insert, update, delete on table public.eventos      to authenticated;
grant select, insert, update, delete on table public.cotas_doacao to authenticated;
grant select, insert, update, delete on table public.inscricoes   to authenticated;
grant select on table public.inscricoes_painel to authenticated;
grant all on table public.eventos, public.cotas_doacao, public.inscricoes to service_role;
grant select on table public.inscricoes_painel to service_role;

-- Políticas: só admin com MFA
drop policy if exists eventos_admin on public.eventos;
create policy eventos_admin on public.eventos for all to authenticated
  using ((select privado.is_admin())) with check ((select privado.is_admin()));
drop policy if exists cotas_admin on public.cotas_doacao;
create policy cotas_admin on public.cotas_doacao for all to authenticated
  using ((select privado.is_admin())) with check ((select privado.is_admin()));
drop policy if exists inscricoes_admin on public.inscricoes;
create policy inscricoes_admin on public.inscricoes for all to authenticated
  using ((select privado.is_admin())) with check ((select privado.is_admin()));

-- ---------------------------------------------------------------------
-- Encontro 3 (dados iniciais)
-- ---------------------------------------------------------------------
-- 50 lugares, 1 reservado (Eduardo) = 49 para inscritos e acompanhantes.
-- [CONFIRMAR] horário e local. As inscrições começam FECHADAS: abra no painel (aba Inscrições).
insert into public.eventos (slug, titulo, data_inicio, local, capacidade, reservados, inscricoes_abertas, lista_espera, mensagem_whatsapp)
values ('encontro-3', 'Encontro 3 · Potencial Artificial', '2026-12-11 09:00:00-03', 'Rio de Janeiro · local em breve', 50, 1, false, true,
        'Olá, {nome}! Aqui é da Academia de Virtudes, do Grupo GPM. Você confirma sua presença no Encontro 3? É só tocar no link: {link}')
on conflict (slug) do nothing;

insert into public.cotas_doacao (evento_id, tamanho, cota)
select e.id, t.tamanho, t.cota
  from public.eventos e, (values ('P', 17), ('M', 17), ('G', 16)) t (tamanho, cota)
 where e.slug = 'encontro-3'
on conflict (evento_id, tamanho) do nothing;

-- Conferência:
-- select * from public.evento_publico('encontro-3');
