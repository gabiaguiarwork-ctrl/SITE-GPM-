-- =====================================================================
-- Teste das migrations 0002 e 0003 · rodar no SQL Editor DEPOIS delas
--
-- Cria usuários e conteúdos de teste, simula cada perfil, confere as regras
-- e APAGA tudo no fim. Resultado: todas as linhas com ok = true.
-- =====================================================================

-- Limpeza de uma execução anterior
delete from public.modulos where id::text like '00000000-0000-4000-8000-0000000000f%';
delete from public.avisos  where id::text like '00000000-0000-4000-8000-0000000000f%';
delete from public.auditoria where alvo like '00000000-0000-4000-8000-0000000000f%' or alvo like '00000000-0000-4000-8000-0000000000b%';
delete from auth.users where email like 'teste-rls2-%@exemplo.invalid';

drop table if exists pg_temp._r;
create temp table _r (quando timestamptz not null default clock_timestamp(), teste text, esperado text, obtido text);
grant all on _r to authenticated, anon;

-- Usuários: b1 aluno, b2 outro aluno, b3 inativo, b4 admin
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-0000000000b1','authenticated','authenticated','teste-rls2-aluno@exemplo.invalid',   '{"nome":"Aluno"}'),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-0000000000b2','authenticated','authenticated','teste-rls2-aluno2@exemplo.invalid',  '{"nome":"Outro"}'),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-0000000000b3','authenticated','authenticated','teste-rls2-inativo@exemplo.invalid', '{"nome":"Inativo"}'),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-0000000000b4','authenticated','authenticated','teste-rls2-admin@exemplo.invalid',   '{"nome":"Admin"}');
update public.profiles set ativo = false   where id = '00000000-0000-4000-8000-0000000000b3';
update public.profiles set role  = 'admin' where id = '00000000-0000-4000-8000-0000000000b4';

-- Encontros: f1 publicado e liberado, f2 publicado mas só no futuro, f3 rascunho
insert into public.modulos (id, titulo, ordem, publicado, liberado_em) values
  ('00000000-0000-4000-8000-0000000000f1', 'TESTE liberado', 901, true,  null),
  ('00000000-0000-4000-8000-0000000000f2', 'TESTE futuro',   902, true,  now() + interval '7 days'),
  ('00000000-0000-4000-8000-0000000000f3', 'TESTE rascunho', 903, false, null);
-- Conteúdos: fa visível; fb rascunho; fc em encontro futuro; fd em encontro rascunho
insert into public.conteudos (id, modulo_id, titulo, tipo, texto, arquivo_path, ordem, publicado) values
  ('00000000-0000-4000-8000-0000000000fa', '00000000-0000-4000-8000-0000000000f1', 'TESTE visível',  'pdf',   null, 'teste/visivel.pdf',  1, true),
  ('00000000-0000-4000-8000-0000000000fb', '00000000-0000-4000-8000-0000000000f1', 'TESTE rascunho', 'pdf',   null, 'teste/rascunho.pdf', 2, false),
  ('00000000-0000-4000-8000-0000000000fc', '00000000-0000-4000-8000-0000000000f2', 'TESTE futuro',   'texto', 'x',  null,                 1, true),
  ('00000000-0000-4000-8000-0000000000fd', '00000000-0000-4000-8000-0000000000f3', 'TESTE oculto',   'texto', 'x',  null,                 1, true);
insert into public.avisos (id, titulo, publicado) values
  ('00000000-0000-4000-8000-0000000000fe', 'TESTE aviso publicado', true),
  ('00000000-0000-4000-8000-0000000000ff', 'TESTE aviso rascunho',  false);
-- Progresso do outro aluno (b2) para conferir isolamento
insert into public.progresso (aluno_id, conteudo_id, concluido, posicao_seg)
values ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000fa', true, 30);

-- Restrições de formato
do $$ begin
  begin
    insert into public.conteudos (modulo_id, titulo, tipo, url) values ('00000000-0000-4000-8000-0000000000f1', 'x', 'link', 'javascript:alert(1)');
    insert into _r (teste, esperado, obtido) values ('link só aceita https', 'erro', 'aceitou');
  exception when others then insert into _r (teste, esperado, obtido) values ('link só aceita https', 'erro', 'erro'); end;
  begin
    insert into public.conteudos (modulo_id, titulo, tipo, arquivo_path) values ('00000000-0000-4000-8000-0000000000f1', 'x', 'pdf', '../segredo.pdf');
    insert into _r (teste, esperado, obtido) values ('caminho de arquivo sem ".."', 'erro', 'aceitou');
  exception when others then insert into _r (teste, esperado, obtido) values ('caminho de arquivo sem ".."', 'erro', 'erro'); end;
  begin
    insert into public.conteudos (modulo_id, titulo, tipo, provedor, video_id) values ('00000000-0000-4000-8000-0000000000f1', 'x', 'video', 'youtube', 'abc');
    insert into _r (teste, esperado, obtido) values ('vídeo só Panda ou Vimeo', 'erro', 'aceitou');
  exception when others then insert into _r (teste, esperado, obtido) values ('vídeo só Panda ou Vimeo', 'erro', 'erro'); end;
end $$;

-- ---------------------------------------------------------------------
-- 1) anon
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"anon"}', false);
set role anon;
do $$ begin
  begin perform count(*) from public.modulos;   insert into _r values (default, 'anon não lê modulos',   'erro', 'leu');
  exception when others then insert into _r values (default, 'anon não lê modulos',   'erro', 'erro'); end;
  begin perform count(*) from public.conteudos; insert into _r values (default, 'anon não lê conteudos', 'erro', 'leu');
  exception when others then insert into _r values (default, 'anon não lê conteudos', 'erro', 'erro'); end;
  begin perform count(*) from public.progresso; insert into _r values (default, 'anon não lê progresso', 'erro', 'leu');
  exception when others then insert into _r values (default, 'anon não lê progresso', 'erro', 'erro'); end;
  begin perform count(*) from public.avisos;    insert into _r values (default, 'anon não lê avisos',    'erro', 'leu');
  exception when others then insert into _r values (default, 'anon não lê avisos',    'erro', 'erro'); end;
end $$;
reset role;

-- ---------------------------------------------------------------------
-- 2) Aluno ativo
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated","aal":"aal1"}', false);
set role authenticated;
insert into _r (teste, esperado, obtido) select 'aluno vê encontros publicados (liberado + futuro)', '2', count(*)::text from public.modulos where id::text like '00000000-0000-4000-8000-0000000000f%';
insert into _r (teste, esperado, obtido) select 'aluno NÃO vê encontro rascunho', '0', count(*)::text from public.modulos where id = '00000000-0000-4000-8000-0000000000f3';
insert into _r (teste, esperado, obtido) select 'aluno vê só o conteúdo publicado e liberado', '00000000-0000-4000-8000-0000000000fa', string_agg(id::text, ',') from public.conteudos where id::text like '00000000-0000-4000-8000-0000000000f%';
insert into _r (teste, esperado, obtido) select 'aluno vê só aviso publicado', '1', count(*)::text from public.avisos where id::text like '00000000-0000-4000-8000-0000000000f%';
insert into _r (teste, esperado, obtido) select 'aluno NÃO vê progresso de outro aluno', '0', count(*)::text from public.progresso where aluno_id = '00000000-0000-4000-8000-0000000000b2';
insert into _r (teste, esperado, obtido) select 'material de conteúdo visível: liberado', 'true', privado.material_visivel('teste/visivel.pdf')::text;
insert into _r (teste, esperado, obtido) select 'material de rascunho: bloqueado', 'false', privado.material_visivel('teste/rascunho.pdf')::text;
do $$ declare n int; begin
  insert into public.progresso (aluno_id, conteudo_id, posicao_seg) values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000fa', 15);
  insert into _r values (default, 'aluno grava o próprio progresso', 'ok', 'ok');

  insert into public.progresso (aluno_id, conteudo_id, concluido, posicao_seg) values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000fa', true, 40)
  on conflict (aluno_id, conteudo_id) do update set aluno_id = excluded.aluno_id, conteudo_id = excluded.conteudo_id, concluido = excluded.concluido, posicao_seg = excluded.posicao_seg;
  insert into _r values (default, 'aluno faz upsert do próprio progresso', 'ok', 'ok');

  begin
    insert into public.progresso (aluno_id, conteudo_id) values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000fb');
    insert into _r values (default, 'aluno NÃO grava progresso em rascunho', 'erro', 'gravou');
  exception when others then insert into _r values (default, 'aluno NÃO grava progresso em rascunho', 'erro', 'erro'); end;
  begin
    insert into public.progresso (aluno_id, conteudo_id) values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000fc');
    insert into _r values (default, 'aluno NÃO grava progresso em encontro não liberado', 'erro', 'gravou');
  exception when others then insert into _r values (default, 'aluno NÃO grava progresso em encontro não liberado', 'erro', 'erro'); end;
  begin
    insert into public.progresso (aluno_id, conteudo_id) values ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000fa')
    on conflict (aluno_id, conteudo_id) do update set posicao_seg = 0;
    insert into _r values (default, 'aluno NÃO grava progresso de outro aluno', 'erro', 'gravou');
  exception when others then insert into _r values (default, 'aluno NÃO grava progresso de outro aluno', 'erro', 'erro'); end;
  begin
    update public.progresso set aluno_id = '00000000-0000-4000-8000-0000000000b2' where aluno_id = '00000000-0000-4000-8000-0000000000b1';
    insert into _r values (default, 'aluno NÃO transfere progresso para outro', 'erro', 'alterou');
  exception when others then insert into _r values (default, 'aluno NÃO transfere progresso para outro', 'erro', 'erro'); end;
  begin
    delete from public.progresso where aluno_id = '00000000-0000-4000-8000-0000000000b1';
    insert into _r values (default, 'aluno NÃO apaga progresso', 'erro', 'apagou');
  exception when others then insert into _r values (default, 'aluno NÃO apaga progresso', 'erro', 'erro'); end;
  begin
    insert into public.modulos (titulo) values ('invasor');
    insert into _r values (default, 'aluno NÃO cria encontro', 'erro', 'criou');
  exception when others then insert into _r values (default, 'aluno NÃO cria encontro', 'erro', 'erro'); end;
  update public.conteudos set publicado = true where id = '00000000-0000-4000-8000-0000000000fb';
  get diagnostics n = row_count;
  insert into _r values (default, 'aluno NÃO publica conteúdo', '0', n::text);
  delete from public.avisos where id = '00000000-0000-4000-8000-0000000000fe';
  get diagnostics n = row_count;
  insert into _r values (default, 'aluno NÃO apaga aviso', '0', n::text);
end $$;
reset role;
insert into _r (teste, esperado, obtido)
select 'upsert gravou concluído e posição', 'true/40', concluido::text || '/' || posicao_seg from public.progresso
 where aluno_id = '00000000-0000-4000-8000-0000000000b1' and conteudo_id = '00000000-0000-4000-8000-0000000000fa';

-- ---------------------------------------------------------------------
-- 3) Aluno inativo
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b3","role":"authenticated","aal":"aal1"}', false);
set role authenticated;
insert into _r (teste, esperado, obtido) select 'inativo NÃO vê encontros', '0', count(*)::text from public.modulos;
insert into _r (teste, esperado, obtido) select 'inativo NÃO vê conteúdos', '0', count(*)::text from public.conteudos;
insert into _r (teste, esperado, obtido) select 'inativo NÃO vê avisos', '0', count(*)::text from public.avisos;
insert into _r (teste, esperado, obtido) select 'inativo: material bloqueado', 'false', privado.material_visivel('teste/visivel.pdf')::text;
do $$ begin
  insert into public.progresso (aluno_id, conteudo_id) values ('00000000-0000-4000-8000-0000000000b3', '00000000-0000-4000-8000-0000000000fa');
  insert into _r values (default, 'inativo NÃO grava progresso', 'erro', 'gravou');
exception when others then insert into _r values (default, 'inativo NÃO grava progresso', 'erro', 'erro'); end $$;
reset role;

-- ---------------------------------------------------------------------
-- 4) Admin sem MFA (aal1): age como aluno
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b4","role":"authenticated","aal":"aal1"}', false);
set role authenticated;
insert into _r (teste, esperado, obtido) select 'admin sem MFA NÃO vê rascunhos', '0', count(*)::text from public.conteudos where id = '00000000-0000-4000-8000-0000000000fb';
do $$ begin
  insert into public.modulos (titulo) values ('sem mfa');
  insert into _r values (default, 'admin sem MFA NÃO cria encontro', 'erro', 'criou');
exception when others then insert into _r values (default, 'admin sem MFA NÃO cria encontro', 'erro', 'erro'); end $$;
reset role;

-- ---------------------------------------------------------------------
-- 5) Admin com MFA (aal2)
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000b4","role":"authenticated","aal":"aal2"}', false);
set role authenticated;
insert into _r (teste, esperado, obtido) select 'admin vê todos os encontros de teste', '3', count(*)::text from public.modulos where id::text like '00000000-0000-4000-8000-0000000000f%';
insert into _r (teste, esperado, obtido) select 'admin vê todos os conteúdos de teste', '4', count(*)::text from public.conteudos where id::text like '00000000-0000-4000-8000-0000000000f%';
insert into _r (teste, esperado, obtido) select 'admin vê progresso dos alunos', '2', count(*)::text from public.progresso where conteudo_id = '00000000-0000-4000-8000-0000000000fa';
insert into _r (teste, esperado, obtido) select 'admin: material de rascunho liberado (pré-visualização)', 'true', (privado.is_admin() or privado.material_visivel('teste/rascunho.pdf'))::text;
do $$ declare n int; begin
  update public.conteudos set publicado = true where id = '00000000-0000-4000-8000-0000000000fb';
  get diagnostics n = row_count;
  insert into _r values (default, 'admin publica conteúdo', '1', n::text);
  insert into public.avisos (id, titulo, publicado) values ('00000000-0000-4000-8000-0000000000f9', 'TESTE criado pelo admin', false);
  delete from public.avisos where id = '00000000-0000-4000-8000-0000000000f9';
  get diagnostics n = row_count;
  insert into _r values (default, 'admin cria e apaga aviso', '1', n::text);
end $$;
reset role;
insert into _r (teste, esperado, obtido)
select 'auditoria: publicar, criar e excluir pelo admin', '3', count(*)::text from public.auditoria
 where quem = '00000000-0000-4000-8000-0000000000b4'
   and ((acao = 'publicar_conteudo' and alvo = '00000000-0000-4000-8000-0000000000fb')
     or (acao in ('criar_aviso', 'excluir_aviso') and alvo = '00000000-0000-4000-8000-0000000000f9'));

-- ---------------------------------------------------------------------
-- 6) Buckets
-- ---------------------------------------------------------------------
insert into _r (teste, esperado, obtido)
select 'bucket materiais: privado, só PDF, 20 MB', 'false/{application/pdf}/20971520', public::text || '/' || allowed_mime_types::text || '/' || file_size_limit
  from storage.buckets where id = 'materiais';
insert into _r (teste, esperado, obtido)
select 'bucket capas: público, só imagens, 2 MB', 'true/{image/jpeg,image/png,image/webp}/2097152', public::text || '/' || allowed_mime_types::text || '/' || file_size_limit
  from storage.buckets where id = 'capas';

-- ---------------------------------------------------------------------
-- Limpeza e resultado
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{}', false);
delete from public.modulos where id::text like '00000000-0000-4000-8000-0000000000f%';
delete from public.avisos  where id::text like '00000000-0000-4000-8000-0000000000f%';
delete from public.auditoria where alvo like '00000000-0000-4000-8000-0000000000f%' or alvo like '00000000-0000-4000-8000-0000000000b%';
delete from auth.users where email like 'teste-rls2-%@exemplo.invalid';

select teste, esperado, obtido, (esperado = obtido) as ok
  from _r
 order by quando;
