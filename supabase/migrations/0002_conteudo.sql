-- =====================================================================
-- Área do Aluno · Academia de Virtudes
-- 0002 · Conteúdo: encontros (módulos), conteúdos, progresso e avisos
--
-- Rodar no SQL Editor DEPOIS da 0001. Idempotente.
--
-- Regras
-- - Aluno ATIVO lê encontros publicados (mesmo os ainda não liberados,
--   para mostrar o selo "em breve") e lê conteúdos publicados de encontros
--   publicados E já liberados.
-- - Aluno lê e grava só o próprio progresso, e só de conteúdo que ele pode ver.
-- - Aluno inativo e anon não leem nada. Aluno não apaga nada.
-- - Admin (com MFA, aal2) lê e grava tudo. Criação, publicação e exclusão
--   ficam registradas na auditoria.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------
create table if not exists public.modulos (
  id            uuid primary key default gen_random_uuid(),
  titulo        text not null check (char_length(titulo) between 1 and 160),
  subtitulo     text check (subtitulo is null or char_length(subtitulo) <= 240),
  descricao     text check (descricao is null or char_length(descricao) <= 4000),
  -- Caminho da imagem no bucket público "capas" (nunca uma URL livre)
  capa_path     text check (capa_path is null or capa_path ~ '^[a-z0-9][a-z0-9/_.-]{0,200}\.(jpg|jpeg|png|webp)$'),
  ordem         integer not null default 0,
  publicado     boolean not null default false,
  liberado_em   timestamptz,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
comment on table public.modulos is 'Encontros da Academia (cada um é um módulo com conteúdos).';
create index if not exists modulos_ordem_idx on public.modulos (ordem);

create table if not exists public.conteudos (
  id            uuid primary key default gen_random_uuid(),
  modulo_id     uuid not null references public.modulos (id) on delete cascade,
  titulo        text not null check (char_length(titulo) between 1 and 160),
  tipo          text not null check (tipo in ('video', 'pdf', 'texto', 'link')),
  descricao     text check (descricao is null or char_length(descricao) <= 4000),
  -- Vídeo: provedor + ID do vídeo no player (sem URL livre)
  provedor      text check (provedor is null or provedor in ('panda', 'vimeo')),
  video_id      text check (video_id is null or video_id ~ '^[A-Za-z0-9_:-]{1,100}$'),
  duracao_min   integer check (duracao_min is null or duracao_min between 0 and 1440),
  -- Material para baixar: caminho no bucket privado "materiais" (só PDF)
  arquivo_path  text check (arquivo_path is null or arquivo_path ~ '^[a-z0-9][a-z0-9/_.-]{0,200}\.pdf$'),
  arquivo_nome  text check (arquivo_nome is null or char_length(arquivo_nome) <= 160),
  -- Link externo (só https)
  url           text check (url is null or (url ~ '^https://[^\s/]+' and char_length(url) <= 600)),
  -- Texto de apoio em markdown simples (renderizado no navegador sem HTML)
  texto         text check (texto is null or char_length(texto) <= 20000),
  ordem         integer not null default 0,
  publicado     boolean not null default false,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint conteudos_video_ok check (tipo <> 'video' or (provedor is not null and video_id is not null)),
  constraint conteudos_pdf_ok   check (tipo <> 'pdf'   or arquivo_path is not null),
  constraint conteudos_link_ok  check (tipo <> 'link'  or url is not null)
);
comment on table public.conteudos is 'Aulas e materiais de cada encontro.';
create index if not exists conteudos_modulo_idx on public.conteudos (modulo_id, ordem);

create table if not exists public.progresso (
  aluno_id      uuid not null references public.profiles (id) on delete cascade,
  conteudo_id   uuid not null references public.conteudos (id) on delete cascade,
  concluido     boolean not null default false,
  posicao_seg   integer not null default 0 check (posicao_seg between 0 and 86400),
  atualizado_em timestamptz not null default now(),
  primary key (aluno_id, conteudo_id)
);
comment on table public.progresso is 'Progresso de cada aluno em cada conteúdo.';
create index if not exists progresso_conteudo_idx on public.progresso (conteudo_id);

create table if not exists public.avisos (
  id            uuid primary key default gen_random_uuid(),
  titulo        text not null check (char_length(titulo) between 1 and 160),
  texto         text check (texto is null or char_length(texto) <= 2000),
  publicado     boolean not null default false,
  criado_em     timestamptz not null default now()
);
comment on table public.avisos is 'Avisos exibidos no topo da vitrine.';

alter table public.modulos   enable row level security;
alter table public.conteudos enable row level security;
alter table public.progresso enable row level security;
alter table public.avisos    enable row level security;

-- ---------------------------------------------------------------------
-- Funções privadas
-- ---------------------------------------------------------------------

-- O conteúdo pode ser visto pelo aluno logado (ativo, conteúdo e encontro publicados, encontro liberado)?
create or replace function privado.conteudo_visivel(conteudo uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (select privado.is_active()) and exists (
    select 1
      from public.conteudos c
      join public.modulos m on m.id = c.modulo_id
     where c.id = conteudo
       and c.publicado and m.publicado
       and (m.liberado_em is null or m.liberado_em <= now())
  );
$$;

-- O arquivo do bucket "materiais" pertence a um conteúdo que o aluno pode ver?
create or replace function privado.material_visivel(caminho text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (select privado.is_active()) and exists (
    select 1
      from public.conteudos c
      join public.modulos m on m.id = c.modulo_id
     where c.arquivo_path = caminho
       and c.publicado and m.publicado
       and (m.liberado_em is null or m.liberado_em <= now())
  );
$$;

create or replace function privado.tocar_atualizado_em()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

-- No progresso, o aluno nunca troca o dono nem o conteúdo de uma linha existente.
create or replace function privado.proteger_progresso()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (new.aluno_id is distinct from old.aluno_id or new.conteudo_id is distinct from old.conteudo_id) then
    raise exception 'alteração não permitida' using errcode = '42501';
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;

-- Auditoria de criação, publicação e exclusão de encontros, conteúdos e avisos.
create or replace function privado.auditar_conteudo()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  tipo text := case tg_table_name when 'modulos' then 'encontro' when 'conteudos' then 'conteudo' else 'aviso' end;
begin
  if tg_op = 'INSERT' then
    insert into public.auditoria (quem, acao, alvo, detalhes)
    values (privado.ator(), 'criar_' || tipo, new.id::text, jsonb_build_object('titulo', new.titulo, 'publicado', new.publicado));
    return new;
  elsif tg_op = 'UPDATE' then
    if new.publicado is distinct from old.publicado then
      insert into public.auditoria (quem, acao, alvo, detalhes)
      values (privado.ator(), case when new.publicado then 'publicar_' else 'despublicar_' end || tipo,
              new.id::text, jsonb_build_object('titulo', new.titulo));
    end if;
    return new;
  else
    insert into public.auditoria (quem, acao, alvo, detalhes)
    values (privado.ator(), 'excluir_' || tipo, old.id::text, jsonb_build_object('titulo', old.titulo));
    return old;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------
drop trigger if exists modulos_atualizado on public.modulos;
create trigger modulos_atualizado before update on public.modulos
  for each row execute function privado.tocar_atualizado_em();
drop trigger if exists conteudos_atualizado on public.conteudos;
create trigger conteudos_atualizado before update on public.conteudos
  for each row execute function privado.tocar_atualizado_em();
drop trigger if exists progresso_proteger on public.progresso;
create trigger progresso_proteger before insert or update on public.progresso
  for each row execute function privado.proteger_progresso();

drop trigger if exists modulos_auditar on public.modulos;
create trigger modulos_auditar after insert or update or delete on public.modulos
  for each row execute function privado.auditar_conteudo();
drop trigger if exists conteudos_auditar on public.conteudos;
create trigger conteudos_auditar after insert or update or delete on public.conteudos
  for each row execute function privado.auditar_conteudo();
drop trigger if exists avisos_auditar on public.avisos;
create trigger avisos_auditar after insert or update or delete on public.avisos
  for each row execute function privado.auditar_conteudo();

-- ---------------------------------------------------------------------
-- Privilégios de execução
-- ---------------------------------------------------------------------
revoke execute on function privado.conteudo_visivel(uuid)  from public, anon;
revoke execute on function privado.material_visivel(text)  from public, anon;
revoke execute on function privado.tocar_atualizado_em()   from public, anon, authenticated;
revoke execute on function privado.proteger_progresso()    from public, anon, authenticated;
revoke execute on function privado.auditar_conteudo()      from public, anon, authenticated;
grant execute on function privado.conteudo_visivel(uuid)   to authenticated, service_role;
grant execute on function privado.material_visivel(text)   to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Privilégios nas tabelas (a RLS decide o que cada um vê)
-- ---------------------------------------------------------------------
revoke all on table public.modulos   from public, anon, authenticated;
revoke all on table public.conteudos from public, anon, authenticated;
revoke all on table public.progresso from public, anon, authenticated;
revoke all on table public.avisos    from public, anon, authenticated;

-- Escrita em modulos/conteudos/avisos: as políticas só liberam para admin (aal2).
grant select, insert, update, delete on table public.modulos   to authenticated;
grant select, insert, update, delete on table public.conteudos to authenticated;
grant select, insert, update, delete on table public.avisos    to authenticated;
-- Progresso: sem DELETE para ninguém pelo front; só as colunas necessárias.
grant select on table public.progresso to authenticated;
grant insert (aluno_id, conteudo_id, concluido, posicao_seg) on table public.progresso to authenticated;
-- O upsert do supabase-js regrava também as colunas da chave; o trigger proteger_progresso
-- impede que elas mudem de fato.
grant update (aluno_id, conteudo_id, concluido, posicao_seg) on table public.progresso to authenticated;

grant all on table public.modulos, public.conteudos, public.progresso, public.avisos to service_role;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
-- Encontros
drop policy if exists modulos_select on public.modulos;
create policy modulos_select on public.modulos for select to authenticated
  using ((publicado and (select privado.is_active())) or (select privado.is_admin()));
drop policy if exists modulos_insert on public.modulos;
create policy modulos_insert on public.modulos for insert to authenticated
  with check ((select privado.is_admin()));
drop policy if exists modulos_update on public.modulos;
create policy modulos_update on public.modulos for update to authenticated
  using ((select privado.is_admin())) with check ((select privado.is_admin()));
drop policy if exists modulos_delete on public.modulos;
create policy modulos_delete on public.modulos for delete to authenticated
  using ((select privado.is_admin()));

-- Conteúdos
drop policy if exists conteudos_select on public.conteudos;
create policy conteudos_select on public.conteudos for select to authenticated
  using ((select privado.conteudo_visivel(id)) or (select privado.is_admin()));
drop policy if exists conteudos_insert on public.conteudos;
create policy conteudos_insert on public.conteudos for insert to authenticated
  with check ((select privado.is_admin()));
drop policy if exists conteudos_update on public.conteudos;
create policy conteudos_update on public.conteudos for update to authenticated
  using ((select privado.is_admin())) with check ((select privado.is_admin()));
drop policy if exists conteudos_delete on public.conteudos;
create policy conteudos_delete on public.conteudos for delete to authenticated
  using ((select privado.is_admin()));

-- Progresso
drop policy if exists progresso_select on public.progresso;
create policy progresso_select on public.progresso for select to authenticated
  using ((aluno_id = (select auth.uid()) and (select privado.is_active())) or (select privado.is_admin()));
drop policy if exists progresso_insert on public.progresso;
create policy progresso_insert on public.progresso for insert to authenticated
  with check (aluno_id = (select auth.uid()) and (select privado.conteudo_visivel(conteudo_id)));
drop policy if exists progresso_update on public.progresso;
create policy progresso_update on public.progresso for update to authenticated
  using      (aluno_id = (select auth.uid()) and (select privado.conteudo_visivel(conteudo_id)))
  with check (aluno_id = (select auth.uid()) and (select privado.conteudo_visivel(conteudo_id)));
-- DELETE em progresso: nenhuma política e nenhum GRANT.

-- Avisos
drop policy if exists avisos_select on public.avisos;
create policy avisos_select on public.avisos for select to authenticated
  using ((publicado and (select privado.is_active())) or (select privado.is_admin()));
drop policy if exists avisos_insert on public.avisos;
create policy avisos_insert on public.avisos for insert to authenticated
  with check ((select privado.is_admin()));
drop policy if exists avisos_update on public.avisos;
create policy avisos_update on public.avisos for update to authenticated
  using ((select privado.is_admin())) with check ((select privado.is_admin()));
drop policy if exists avisos_delete on public.avisos;
create policy avisos_delete on public.avisos for delete to authenticated
  using ((select privado.is_admin()));
