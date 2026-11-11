-- =====================================================================
-- Área do Aluno · Academia de Virtudes
-- 0007 · Aulas (videoaula do YouTube ou PDF), Trilhas opcionais e PDFs de apoio
--
-- Rodar no SQL Editor DEPOIS da 0006. Idempotente.
-- IMPORTANTE: substitui funções e políticas da 0002/0006. Se alguma migration
-- anterior for rodada de novo, rode a 0007 em seguida.
--
-- Mapa (os nomes das tabelas continuam os mesmos, para não perder dados,
-- progresso, chaves e políticas):
--   public.modulos   = Trilhas (agrupamento OPCIONAL das aulas)
--   public.conteudos = Aulas   (tipo 'video' = videoaula; 'pdf' = material em PDF)
--   public.anexos    = PDFs de apoio de cada aula (novo)
--
-- Regras
-- - Publicação e data de liberação passam a valer POR AULA.
-- - Aula pode não ter trilha. Excluir uma trilha NÃO apaga as aulas (ficam sem trilha).
-- - O aluno vê uma trilha só se ela tiver ao menos uma aula visível para ele.
-- - Continuam valendo: ativo + cadastro completo para ver qualquer conteúdo;
--   admin com MFA vê e grava tudo; auditoria de criar/publicar/excluir.
-- - Vídeo novo: YouTube (provedor 'youtube', ID de 11 caracteres). Vimeo e Panda
--   continuam aceitos.
--
-- Dados que já existem (feito UMA vez, marcado em privado.migracoes):
-- - A data de liberação da trilha (antigo "encontro") passa para cada aula dela.
-- - Aula de trilha em rascunho vira rascunho (para continuar escondida).
-- - O PDF anexado a um vídeo/texto vira "PDF de apoio" da aula.
-- - A ordem passa a ser uma ordem única de aulas (trilha por trilha, como era).
-- Nada é apagado: as colunas antigas da trilha (publicado, liberado_em) ficam,
-- só deixam de ser usadas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Registro de migrações de dados (feitas uma vez só)
-- ---------------------------------------------------------------------
create table if not exists privado.migracoes (
  nome   text primary key,
  quando timestamptz not null default now()
);
alter table privado.migracoes enable row level security;
revoke all on table privado.migracoes from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Aulas (public.conteudos): colunas novas
-- ---------------------------------------------------------------------
alter table public.conteudos add column if not exists liberado_em     timestamptz;
alter table public.conteudos add column if not exists publicado_em    timestamptz;
alter table public.conteudos add column if not exists destaque        boolean not null default false;
alter table public.conteudos add column if not exists arquivo_tamanho bigint;
alter table public.conteudos add column if not exists capa_path       text;

alter table public.conteudos drop constraint if exists conteudos_capa_path_check;
alter table public.conteudos add constraint conteudos_capa_path_check
  check (capa_path is null or capa_path ~ '^[a-z0-9][a-z0-9/_.-]{0,200}\.(jpg|jpeg|png|webp)$');
alter table public.conteudos drop constraint if exists conteudos_arquivo_tamanho_check;
alter table public.conteudos add constraint conteudos_arquivo_tamanho_check
  check (arquivo_tamanho is null or arquivo_tamanho between 0 and 52428800);

-- Trilha opcional: aula pode ficar sem trilha; excluir a trilha não apaga a aula.
alter table public.conteudos alter column modulo_id drop not null;
alter table public.conteudos drop constraint if exists conteudos_modulo_id_fkey;
alter table public.conteudos add constraint conteudos_modulo_id_fkey
  foreign key (modulo_id) references public.modulos (id) on delete set null;

-- YouTube como provedor; o ID do YouTube tem exatamente 11 caracteres.
alter table public.conteudos drop constraint if exists conteudos_provedor_check;
alter table public.conteudos add constraint conteudos_provedor_check
  check (provedor is null or provedor in ('youtube', 'vimeo', 'panda'));
alter table public.conteudos drop constraint if exists conteudos_youtube_ok;
alter table public.conteudos add constraint conteudos_youtube_ok
  check (provedor is distinct from 'youtube' or video_id ~ '^[A-Za-z0-9_-]{11}$');

comment on table public.conteudos is 'Aulas: videoaula (tipo video) ou material em PDF (tipo pdf). Trilha opcional (modulo_id).';
comment on table public.modulos is 'Trilhas: agrupamento opcional das aulas na vitrine. publicado/liberado_em não são mais usados.';
comment on column public.conteudos.liberado_em is 'Aula publicada só aparece para o aluno a partir desta data (null = já).';
comment on column public.conteudos.publicado_em is 'Quando a aula foi publicada pela última vez (para o selo "Novo").';
comment on column public.conteudos.destaque is 'Destacar na vitrine (banner do topo).';
comment on column public.conteudos.arquivo_tamanho is 'Tamanho do PDF principal em bytes.';

create index if not exists conteudos_ordem_idx on public.conteudos (ordem);

-- ---------------------------------------------------------------------
-- PDFs de apoio (novo)
-- ---------------------------------------------------------------------
create table if not exists public.anexos (
  id           uuid primary key default gen_random_uuid(),
  conteudo_id  uuid not null references public.conteudos (id) on delete cascade,
  nome         text not null check (char_length(nome) between 1 and 160),
  arquivo_path text not null check (arquivo_path ~ '^[a-z0-9][a-z0-9/_.-]{0,200}\.pdf$'),
  tamanho      bigint check (tamanho is null or tamanho between 0 and 52428800),
  ordem        integer not null default 0,
  criado_em    timestamptz not null default now()
);
comment on table public.anexos is 'PDFs de apoio de uma aula (bucket privado "materiais").';
create index if not exists anexos_conteudo_idx on public.anexos (conteudo_id, ordem);
alter table public.anexos enable row level security;

-- ---------------------------------------------------------------------
-- Funções de visibilidade (substituem as da 0006)
-- ---------------------------------------------------------------------
-- A aula pode ser vista pelo aluno logado? (ativo + cadastro completo + aula publicada e liberada)
create or replace function privado.conteudo_visivel(conteudo uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (select privado.pode_ver_conteudo()) and exists (
    select 1
      from public.conteudos c
     where c.id = conteudo
       and c.publicado
       and (c.liberado_em is null or c.liberado_em <= now())
  );
$$;

-- A trilha aparece para o aluno se tiver ao menos uma aula visível.
create or replace function privado.trilha_visivel(trilha uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (select privado.pode_ver_conteudo()) and exists (
    select 1
      from public.conteudos c
     where c.modulo_id = trilha
       and c.publicado
       and (c.liberado_em is null or c.liberado_em <= now())
  );
$$;

-- O arquivo do bucket "materiais" é o PDF de uma aula visível ou um PDF de apoio dela?
create or replace function privado.material_visivel(caminho text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (select privado.pode_ver_conteudo()) and (
    exists (
      select 1 from public.conteudos c
       where c.arquivo_path = caminho
         and c.publicado and (c.liberado_em is null or c.liberado_em <= now())
    )
    or exists (
      select 1 from public.anexos a
        join public.conteudos c on c.id = a.conteudo_id
       where a.arquivo_path = caminho
         and c.publicado and (c.liberado_em is null or c.liberado_em <= now())
    )
  );
$$;

-- ---------------------------------------------------------------------
-- Publicação: data da última publicação (selo "Novo" na vitrine)
-- ---------------------------------------------------------------------
create or replace function privado.marcar_publicacao()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.publicado then
    if tg_op = 'INSERT' then
      new.publicado_em := now();
    elsif not old.publicado then
      new.publicado_em := now();
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Auditoria (substitui a da 0002: "encontro"/"conteudo" passam a "trilha"/"aula")
-- ---------------------------------------------------------------------
create or replace function privado.auditar_conteudo()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  tipo text := case tg_table_name when 'modulos' then 'trilha' when 'conteudos' then 'aula' else 'aviso' end;
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

create or replace function privado.auditar_anexo()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.auditoria (quem, acao, alvo, detalhes)
    values (privado.ator(), 'anexar_pdf', new.conteudo_id::text, jsonb_build_object('titulo', new.nome));
    return new;
  else
    insert into public.auditoria (quem, acao, alvo, detalhes)
    values (privado.ator(), 'remover_pdf', old.conteudo_id::text, jsonb_build_object('titulo', old.nome));
    return old;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Painel: espaço usado no Storage (só admin com MFA)
-- ---------------------------------------------------------------------
create or replace function privado.admin_uso_storage()
returns table (bucket text, bytes bigint, arquivos bigint)
language sql stable security definer set search_path = ''
as $$
  select o.bucket_id::text,
         coalesce(sum(case when (o.metadata ->> 'size') ~ '^[0-9]{1,15}$' then (o.metadata ->> 'size')::bigint else 0 end), 0)::bigint,
         count(*)::bigint
    from storage.objects o
   where (select privado.is_admin())
   group by o.bucket_id;
$$;

create or replace function public.admin_uso_storage()
returns table (bucket text, bytes bigint, arquivos bigint)
language sql stable security invoker set search_path = ''
as $$ select * from privado.admin_uso_storage(); $$;

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------
drop trigger if exists conteudos_publicacao on public.conteudos;
create trigger conteudos_publicacao before insert or update on public.conteudos
  for each row execute function privado.marcar_publicacao();

drop trigger if exists anexos_auditar on public.anexos;
create trigger anexos_auditar after insert or delete on public.anexos
  for each row execute function privado.auditar_anexo();

-- ---------------------------------------------------------------------
-- Privilégios
-- ---------------------------------------------------------------------
revoke execute on all functions in schema privado from public, anon;
revoke execute on function privado.marcar_publicacao()   from authenticated;
revoke execute on function privado.auditar_conteudo()    from authenticated;
revoke execute on function privado.auditar_anexo()       from authenticated;
grant execute on function privado.conteudo_visivel(uuid) to authenticated, service_role;
grant execute on function privado.trilha_visivel(uuid)   to authenticated, service_role;
grant execute on function privado.material_visivel(text) to authenticated, service_role;
grant execute on function privado.admin_uso_storage()    to authenticated;

revoke execute on function public.admin_uso_storage() from public, anon;
grant execute on function public.admin_uso_storage()  to authenticated;

revoke all on table public.anexos from public, anon, authenticated;
-- Escrita: as políticas só liberam para admin (aal2).
grant select, insert, update, delete on table public.anexos to authenticated;
grant all on table public.anexos to service_role;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
-- Trilhas: o aluno vê só as que têm aula visível; admin vê todas.
drop policy if exists modulos_select on public.modulos;
create policy modulos_select on public.modulos for select to authenticated
  using ((select privado.is_admin()) or privado.trilha_visivel(id));

-- Aulas: conteudos_select (0002) já usa conteudo_visivel(id), agora por aula.

-- PDFs de apoio
drop policy if exists anexos_select on public.anexos;
create policy anexos_select on public.anexos for select to authenticated
  using ((select privado.is_admin()) or privado.conteudo_visivel(conteudo_id));
drop policy if exists anexos_insert on public.anexos;
create policy anexos_insert on public.anexos for insert to authenticated
  with check ((select privado.is_admin()));
drop policy if exists anexos_update on public.anexos;
create policy anexos_update on public.anexos for update to authenticated
  using ((select privado.is_admin())) with check ((select privado.is_admin()));
drop policy if exists anexos_delete on public.anexos;
create policy anexos_delete on public.anexos for delete to authenticated
  using ((select privado.is_admin()));

-- ---------------------------------------------------------------------
-- Dados que já existem (uma vez só)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from privado.migracoes where nome = '0007_aulas') then
    return;
  end if;

  -- 1) Liberação da trilha → cada aula dela (só onde a aula ainda não tem data)
  update public.conteudos c
     set liberado_em = m.liberado_em
    from public.modulos m
   where m.id = c.modulo_id
     and m.liberado_em is not null
     and c.liberado_em is null;

  -- 2) Aula publicada em trilha rascunho vira rascunho (continua escondida, como era)
  update public.conteudos c
     set publicado = false
    from public.modulos m
   where m.id = c.modulo_id
     and not m.publicado
     and c.publicado;

  -- 3) PDF anexado a vídeo/texto/link vira PDF de apoio da aula
  insert into public.anexos (conteudo_id, nome, arquivo_path, ordem)
  select c.id, left(coalesce(nullif(btrim(c.arquivo_nome), ''), 'Material de apoio'), 160), c.arquivo_path, 10
    from public.conteudos c
   where c.tipo <> 'pdf' and c.arquivo_path is not null;
  update public.conteudos
     set arquivo_path = null, arquivo_nome = null
   where tipo <> 'pdf' and arquivo_path is not null;

  -- 4) Ordem única das aulas, trilha por trilha (como aparecia antes)
  with o as (
    select c.id, (row_number() over (order by m.ordem nulls last, c.ordem, c.criado_em)) * 10 as n
      from public.conteudos c
      left join public.modulos m on m.id = c.modulo_id
  )
  update public.conteudos c set ordem = o.n from o where o.id = c.id and c.ordem is distinct from o.n;

  insert into privado.migracoes (nome) values ('0007_aulas');
end $$;

-- Sempre (idempotente): data de publicação das aulas já publicadas e tamanho dos PDFs já enviados.
update public.conteudos
   set publicado_em = criado_em   -- aulas antigas: data de criação (não ganham o selo "Novo" por causa da migração)
 where publicado and publicado_em is null;

update public.conteudos c
   set arquivo_tamanho = (o.metadata ->> 'size')::bigint
  from storage.objects o
 where o.bucket_id = 'materiais' and o.name = c.arquivo_path
   and c.arquivo_tamanho is null
   and (o.metadata ->> 'size') ~ '^[0-9]{1,15}$';

update public.anexos a
   set tamanho = (o.metadata ->> 'size')::bigint
  from storage.objects o
 where o.bucket_id = 'materiais' and o.name = a.arquivo_path
   and a.tamanho is null
   and (o.metadata ->> 'size') ~ '^[0-9]{1,15}$';
