-- =====================================================================
-- Teste da migration 0007 (aulas, trilhas opcionais, PDFs de apoio)
-- Rodar no SQL Editor DEPOIS da 0007.
--
-- Cria usuários e aulas de teste, simula cada perfil com "set role" + JWT
-- simulado, confere as regras e APAGA tudo no fim.
-- Resultado: uma tabela em que todas as linhas devem ter ok = true.
--
-- Usuários: …71 aluno com cadastro completo · …72 admin · …73 aluno sem CPF (incompleto)
-- Trilhas:  …81 tem aula visível · …82 só tem aula agendada
-- Aulas:    …83 videoaula (YouTube) na trilha 81 · …84 PDF sem trilha
--           …85 videoaula agendada (trilha 82) · …86 rascunho (trilha 81)
-- PDFs de apoio: …87 da aula 83 · …88 da aula 86 (rascunho)
-- =====================================================================

-- Limpeza de uma execução anterior
select set_config('request.jwt.claims', '{}', false);
delete from public.conteudos where id::text like '00000000-0000-4000-8000-00000000008%';
delete from public.modulos   where id::text like '00000000-0000-4000-8000-00000000008%';
delete from public.auditoria where alvo like '00000000-0000-4000-8000-00000000007%' or alvo like '00000000-0000-4000-8000-00000000008%';
delete from auth.users where email like 'teste-rls4-%@exemplo.invalid';

drop table if exists pg_temp._r;
create temp table _r (quando timestamptz not null default clock_timestamp(), teste text, esperado text, obtido text);
grant all on _r to authenticated, anon;

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000071', 'authenticated', 'authenticated', 'teste-rls4-aluno@exemplo.invalid',
   '{"nome":"Aluno","sobrenome":"Quatro","whatsapp":"21999990000","cpf":"52998224725","empresa":"Empresa","cargo":"Cargo"}', now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000072', 'authenticated', 'authenticated', 'teste-rls4-admin@exemplo.invalid',
   '{"nome":"Admin"}', now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-000000000073', 'authenticated', 'authenticated', 'teste-rls4-incompleto@exemplo.invalid',
   '{"nome":"Sem","sobrenome":"CPF","whatsapp":"21999990000","empresa":"Empresa","cargo":"Cargo"}', now());
update public.profiles set aceite_privacidade_em = now(), aceite_privacidade_versao = '2026-11'
 where id in ('00000000-0000-4000-8000-000000000071', '00000000-0000-4000-8000-000000000073');
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-000000000072';

insert into public.modulos (id, titulo, ordem) values
  ('00000000-0000-4000-8000-000000000081', 'TESTE4 trilha com aula', 941),
  ('00000000-0000-4000-8000-000000000082', 'TESTE4 trilha só agendada', 942);
insert into public.conteudos (id, modulo_id, titulo, tipo, provedor, video_id, arquivo_path, arquivo_tamanho, ordem, publicado, liberado_em) values
  ('00000000-0000-4000-8000-000000000083', '00000000-0000-4000-8000-000000000081', 'TESTE4 videoaula', 'video', 'youtube', 'dQw4w9WgXcQ', null, null, 9410, true, null),
  ('00000000-0000-4000-8000-000000000084', null, 'TESTE4 PDF sem trilha', 'pdf', null, null, 'teste4/aula.pdf', 2411724, 9420, true, null),
  ('00000000-0000-4000-8000-000000000085', '00000000-0000-4000-8000-000000000082', 'TESTE4 agendada', 'video', 'youtube', 'aqz-KE-bpKQ', null, null, 9430, true, now() + interval '3 days'),
  ('00000000-0000-4000-8000-000000000086', '00000000-0000-4000-8000-000000000081', 'TESTE4 rascunho', 'video', 'youtube', 'eRsGyueVLvQ', null, null, 9440, false, null);
insert into public.anexos (id, conteudo_id, nome, arquivo_path, tamanho, ordem) values
  ('00000000-0000-4000-8000-000000000087', '00000000-0000-4000-8000-000000000083', 'Slides', 'teste4/apoio.pdf', 1048576, 1),
  ('00000000-0000-4000-8000-000000000088', '00000000-0000-4000-8000-000000000086', 'Rascunho', 'teste4/rascunho.pdf', 1000, 1);

-- ---------------------------------------------------------------------
-- 1) Formato e datas
-- ---------------------------------------------------------------------
do $$ begin
  begin
    insert into public.conteudos (titulo, tipo, provedor, video_id) values ('x', 'video', 'youtube', 'abc');
    insert into _r values (default, 'ID do YouTube com menos de 11 caracteres é recusado', 'erro', 'aceitou');
  exception when others then insert into _r values (default, 'ID do YouTube com menos de 11 caracteres é recusado', 'erro', 'erro'); end;
  begin
    insert into public.conteudos (titulo, tipo, provedor, video_id) values ('x', 'video', 'youtube', 'dQw4w9WgXcQ&t=1');
    insert into _r values (default, 'ID do YouTube com caracteres a mais é recusado', 'erro', 'aceitou');
  exception when others then insert into _r values (default, 'ID do YouTube com caracteres a mais é recusado', 'erro', 'erro'); end;
  begin
    insert into public.anexos (conteudo_id, nome, arquivo_path) values ('00000000-0000-4000-8000-000000000083', 'x', '../fora.pdf');
    insert into _r values (default, 'PDF de apoio: caminho sem ".."', 'erro', 'aceitou');
  exception when others then insert into _r values (default, 'PDF de apoio: caminho sem ".."', 'erro', 'erro'); end;
end $$;
insert into _r (teste, esperado, obtido)
select 'publicar grava a data de publicação (rascunho fica sem)', 'sim/não',
       (select case when publicado_em is not null then 'sim' else 'não' end from public.conteudos where id = '00000000-0000-4000-8000-000000000083') || '/' ||
       (select case when publicado_em is not null then 'sim' else 'não' end from public.conteudos where id = '00000000-0000-4000-8000-000000000086');

-- ---------------------------------------------------------------------
-- 2) Aluno com cadastro completo
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000071","role":"authenticated","aal":"aal1"}', false);
set role authenticated;
insert into _r (teste, esperado, obtido)
select 'aluno vê só a trilha com aula visível', '81', string_agg(right(id::text, 2), ',' order by id) from public.modulos where id::text like '00000000-0000-4000-8000-00000000008%';
insert into _r (teste, esperado, obtido)
select 'aluno vê a videoaula e a aula sem trilha (não vê agendada nem rascunho)', '83,84', string_agg(right(id::text, 2), ',' order by id) from public.conteudos where id::text like '00000000-0000-4000-8000-00000000008%';
insert into _r (teste, esperado, obtido)
select 'aluno vê só o PDF de apoio de aula visível', '87', string_agg(right(id::text, 2), ',' order by id) from public.anexos where id::text like '00000000-0000-4000-8000-00000000008%';
insert into _r (teste, esperado, obtido) select 'PDF principal de aula visível: liberado', 'true', privado.material_visivel('teste4/aula.pdf')::text;
insert into _r (teste, esperado, obtido) select 'PDF de apoio de aula visível: liberado', 'true', privado.material_visivel('teste4/apoio.pdf')::text;
insert into _r (teste, esperado, obtido) select 'PDF de apoio de rascunho: bloqueado', 'false', privado.material_visivel('teste4/rascunho.pdf')::text;
insert into _r (teste, esperado, obtido) select 'aluno: admin_uso_storage() não devolve nada', '0', count(*)::text from public.admin_uso_storage();
do $$ declare n int; begin
  insert into public.progresso (aluno_id, conteudo_id, posicao_seg) values ('00000000-0000-4000-8000-000000000071', '00000000-0000-4000-8000-000000000084', 0);
  insert into _r values (default, 'aluno grava progresso em aula sem trilha', 'ok', 'ok');
  begin
    insert into public.progresso (aluno_id, conteudo_id) values ('00000000-0000-4000-8000-000000000071', '00000000-0000-4000-8000-000000000085');
    insert into _r values (default, 'aluno NÃO grava progresso em aula agendada', 'erro', 'gravou');
  exception when others then insert into _r values (default, 'aluno NÃO grava progresso em aula agendada', 'erro', 'erro'); end;
  begin
    insert into public.anexos (conteudo_id, nome, arquivo_path) values ('00000000-0000-4000-8000-000000000083', 'invasor', 'teste4/invasor.pdf');
    insert into _r values (default, 'aluno NÃO anexa PDF', 'erro', 'anexou');
  exception when others then insert into _r values (default, 'aluno NÃO anexa PDF', 'erro', 'erro'); end;
  delete from public.anexos where id = '00000000-0000-4000-8000-000000000087';
  get diagnostics n = row_count;
  insert into _r values (default, 'aluno NÃO apaga PDF de apoio', '0', n::text);
  update public.conteudos set destaque = true where id = '00000000-0000-4000-8000-000000000083';
  get diagnostics n = row_count;
  insert into _r values (default, 'aluno NÃO destaca aula', '0', n::text);
  begin
    insert into public.modulos (titulo) values ('invasor');
    insert into _r values (default, 'aluno NÃO cria trilha', 'erro', 'criou');
  exception when others then insert into _r values (default, 'aluno NÃO cria trilha', 'erro', 'erro'); end;
end $$;
reset role;

-- ---------------------------------------------------------------------
-- 3) Aluno com cadastro incompleto: não vê nada
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000073","role":"authenticated","aal":"aal1"}', false);
set role authenticated;
insert into _r (teste, esperado, obtido)
select 'incompleto NÃO vê trilhas, aulas nem PDFs de apoio', '0/0/0',
       (select count(*) from public.modulos where id::text like '00000000-0000-4000-8000-00000000008%')::text || '/' ||
       (select count(*) from public.conteudos where id::text like '00000000-0000-4000-8000-00000000008%')::text || '/' ||
       (select count(*) from public.anexos where id::text like '00000000-0000-4000-8000-00000000008%')::text;
reset role;

-- ---------------------------------------------------------------------
-- 4) anon
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"anon"}', false);
set role anon;
do $$ begin
  begin perform count(*) from public.anexos; insert into _r values (default, 'anon não lê PDFs de apoio', 'erro', 'leu');
  exception when others then insert into _r values (default, 'anon não lê PDFs de apoio', 'erro', 'erro'); end;
  begin perform count(*) from public.admin_uso_storage(); insert into _r values (default, 'anon não executa admin_uso_storage()', 'erro', 'executou');
  exception when others then insert into _r values (default, 'anon não executa admin_uso_storage()', 'erro', 'erro'); end;
end $$;
reset role;

-- ---------------------------------------------------------------------
-- 5) Admin sem MFA: age como aluno (e não tem cadastro completo: não vê nada)
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000072","role":"authenticated","aal":"aal1"}', false);
set role authenticated;
insert into _r (teste, esperado, obtido)
select 'admin sem MFA NÃO vê rascunho', '0', count(*)::text from public.conteudos where id = '00000000-0000-4000-8000-000000000086';
do $$ begin
  insert into public.anexos (conteudo_id, nome, arquivo_path) values ('00000000-0000-4000-8000-000000000083', 'sem mfa', 'teste4/sem-mfa.pdf');
  insert into _r values (default, 'admin sem MFA NÃO anexa PDF', 'erro', 'anexou');
exception when others then insert into _r values (default, 'admin sem MFA NÃO anexa PDF', 'erro', 'erro'); end $$;
reset role;

-- ---------------------------------------------------------------------
-- 6) Admin com MFA
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000072","role":"authenticated","aal":"aal2"}', false);
set role authenticated;
insert into _r (teste, esperado, obtido)
select 'admin vê todas as trilhas, aulas e PDFs de apoio de teste', '2/4/2',
       (select count(*) from public.modulos where id::text like '00000000-0000-4000-8000-00000000008%')::text || '/' ||
       (select count(*) from public.conteudos where id::text like '00000000-0000-4000-8000-00000000008%')::text || '/' ||
       (select count(*) from public.anexos where id::text like '00000000-0000-4000-8000-00000000008%')::text;
insert into _r (teste, esperado, obtido)
select 'admin: admin_uso_storage() responde', 'ok', case when count(*) >= 0 then 'ok' end from public.admin_uso_storage();
do $$ declare n int; begin
  insert into public.anexos (id, conteudo_id, nome, arquivo_path, tamanho, ordem)
  values ('00000000-0000-4000-8000-000000000089', '00000000-0000-4000-8000-000000000084', 'Exercícios', 'teste4/exercicios.pdf', 2048, 1);
  insert into _r values (default, 'admin anexa PDF de apoio', 'ok', 'ok');
  delete from public.anexos where id = '00000000-0000-4000-8000-000000000089';
  get diagnostics n = row_count;
  insert into _r values (default, 'admin remove PDF de apoio', '1', n::text);
  update public.conteudos set publicado = true, destaque = true where id = '00000000-0000-4000-8000-000000000086';
  get diagnostics n = row_count;
  insert into _r values (default, 'admin publica e destaca aula', '1', n::text);
  insert into public.conteudos (id, titulo, tipo, provedor, video_id, ordem, publicado)
  values ('00000000-0000-4000-8000-00000000008a', 'TESTE4 nova sem trilha', 'video', 'youtube', 'R6MlUcmOul8', 9450, false);
  insert into _r values (default, 'admin cria aula sem trilha (rascunho)', 'ok', 'ok');
end $$;
reset role;
insert into _r (teste, esperado, obtido)
select 'publicar depois grava a data de publicação', 'sim', case when publicado_em is not null then 'sim' else 'não' end
  from public.conteudos where id = '00000000-0000-4000-8000-000000000086';

-- ---------------------------------------------------------------------
-- 7) Excluir trilha não apaga as aulas
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000072","role":"authenticated","aal":"aal2"}', false);
set role authenticated;
delete from public.modulos where id = '00000000-0000-4000-8000-000000000081';
reset role;
insert into _r (teste, esperado, obtido)
select 'excluir trilha: as aulas ficam, sem trilha', '83:sem,86:sem', string_agg(right(id::text, 2) || ':' || coalesce(modulo_id::text, 'sem'), ',' order by id)
  from public.conteudos where id in ('00000000-0000-4000-8000-000000000083', '00000000-0000-4000-8000-000000000086');

-- ---------------------------------------------------------------------
-- 8) Auditoria
-- ---------------------------------------------------------------------
insert into _r (teste, esperado, obtido)
select 'auditoria: anexar, remover PDF, publicar aula, criar aula e excluir trilha (pelo admin)',
       'anexar_pdf,criar_aula,excluir_trilha,publicar_aula,remover_pdf',
       string_agg(distinct acao, ',' order by acao)
  from public.auditoria
 where quem = '00000000-0000-4000-8000-000000000072'
   and alvo like '00000000-0000-4000-8000-00000000008%';

-- ---------------------------------------------------------------------
-- 9) Dados que já existiam (valem para o banco real depois da 0007)
-- ---------------------------------------------------------------------
insert into _r (teste, esperado, obtido)
select 'migração de dados da 0007 registrada', '1', count(*)::text from privado.migracoes where nome = '0007_aulas';
insert into _r (teste, esperado, obtido)
select 'nenhum vídeo/texto com PDF principal (viraram PDFs de apoio)', '0', count(*)::text
  from public.conteudos where tipo <> 'pdf' and arquivo_path is not null;
insert into _r (teste, esperado, obtido)
select 'toda aula publicada tem data de publicação', '0', count(*)::text
  from public.conteudos where publicado and publicado_em is null;

-- ---------------------------------------------------------------------
-- Limpeza e resultado
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{}', false);
delete from public.conteudos where id::text like '00000000-0000-4000-8000-00000000008%';
delete from public.modulos   where id::text like '00000000-0000-4000-8000-00000000008%';
delete from public.auditoria where alvo like '00000000-0000-4000-8000-00000000007%' or alvo like '00000000-0000-4000-8000-00000000008%';
delete from auth.users where email like 'teste-rls4-%@exemplo.invalid';

select teste, esperado, obtido, (esperado = obtido) as ok
  from _r
 order by quando;
