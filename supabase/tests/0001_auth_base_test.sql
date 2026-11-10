-- =====================================================================
-- Teste da migration 0001 · rodar no SQL Editor DEPOIS da 0001
--
-- Cria 4 usuários de teste (e-mails @exemplo.invalid), simula cada perfil
-- com "set role" + JWT simulado, confere as regras e APAGA tudo no fim.
-- O resultado é uma tabela: todas as linhas devem ter ok = true.
-- =====================================================================

-- Limpeza de uma execução anterior que tenha parado no meio
delete from public.auditoria where alvo in (
  '00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000a2',
  '00000000-0000-4000-8000-0000000000a3','00000000-0000-4000-8000-0000000000a4');
delete from auth.users where email like 'teste-rls-%@exemplo.invalid';

drop table if exists pg_temp._r;
create temp table _r (quando timestamptz not null default clock_timestamp(), teste text, esperado text, obtido text);
grant all on _r to authenticated, anon;

-- Usuários de teste: a1 aluno, a2 outro aluno, a3 aluno inativo, a4 admin
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-0000000000a1','authenticated','authenticated','teste-rls-aluno@exemplo.invalid',   '{"nome":"Aluno Teste","role":"admin"}'),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-0000000000a2','authenticated','authenticated','teste-rls-aluno2@exemplo.invalid',  '{"nome":"Outro Aluno"}'),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-0000000000a3','authenticated','authenticated','teste-rls-inativo@exemplo.invalid', '{"nome":"Aluno Inativo"}'),
  ('00000000-0000-0000-0000-000000000000','00000000-0000-4000-8000-0000000000a4','authenticated','authenticated','teste-rls-admin@exemplo.invalid',   '{"nome":"Admin Teste"}');

insert into _r (teste, esperado, obtido)
select 'trigger criou os 4 perfis', '4', count(*)::text from public.profiles where email like 'teste-rls-%@exemplo.invalid';
insert into _r (teste, esperado, obtido)
select 'papel vindo dos metadados é ignorado (sempre aluno)', 'aluno', role from public.profiles where id = '00000000-0000-4000-8000-0000000000a1';

update public.profiles set ativo = false   where id = '00000000-0000-4000-8000-0000000000a3';
update public.profiles set role  = 'admin' where id = '00000000-0000-4000-8000-0000000000a4';

-- ---------------------------------------------------------------------
-- 1) Sem login (anon)
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"anon"}', false);
set role anon;
do $$ begin
  begin
    perform count(*) from public.profiles;
    insert into _r (teste, esperado, obtido) values ('anon não lê profiles', 'erro', 'leu');
  exception when others then
    insert into _r (teste, esperado, obtido) values ('anon não lê profiles', 'erro', 'erro');
  end;
  begin
    perform public.is_active();
    insert into _r (teste, esperado, obtido) values ('anon não executa is_active()', 'erro', 'executou');
  exception when others then
    insert into _r (teste, esperado, obtido) values ('anon não executa is_active()', 'erro', 'erro');
  end;
  begin
    perform count(*) from public.auditoria;
    insert into _r (teste, esperado, obtido) values ('anon não lê auditoria', 'erro', 'leu');
  exception when others then
    insert into _r (teste, esperado, obtido) values ('anon não lê auditoria', 'erro', 'erro');
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------
-- 2) Aluno ativo (aal1)
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated","aal":"aal1"}', false);
set role authenticated;
insert into _r (teste, esperado, obtido) select 'aluno lê o próprio perfil', '1', count(*)::text from public.profiles where id = '00000000-0000-4000-8000-0000000000a1';
insert into _r (teste, esperado, obtido) select 'aluno NÃO lê perfil de outro aluno', '0', count(*)::text from public.profiles where id = '00000000-0000-4000-8000-0000000000a2';
insert into _r (teste, esperado, obtido) select 'aluno vê só 1 perfil no total', '1', count(*)::text from public.profiles;
insert into _r (teste, esperado, obtido) select 'aluno: is_active()', 'true', public.is_active()::text;
insert into _r (teste, esperado, obtido) select 'aluno: is_admin()', 'false', public.is_admin()::text;
insert into _r (teste, esperado, obtido) select 'aluno: tem_papel_admin()', 'false', public.tem_papel_admin()::text;
insert into _r (teste, esperado, obtido) select 'aluno NÃO lê auditoria', '0', count(*)::text from public.auditoria;
do $$ declare n int; begin
  update public.profiles set nome = 'Aluno Teste Editado', whatsapp = '(21) 99999-0000' where id = '00000000-0000-4000-8000-0000000000a1';
  get diagnostics n = row_count;
  insert into _r (teste, esperado, obtido) values ('aluno edita o próprio nome e WhatsApp', '1', n::text);

  update public.profiles set nome = 'Invadido' where id = '00000000-0000-4000-8000-0000000000a2';
  get diagnostics n = row_count;
  insert into _r (teste, esperado, obtido) values ('aluno NÃO edita perfil de outro', '0', n::text);

  begin
    update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-0000000000a1';
    insert into _r (teste, esperado, obtido) values ('aluno NÃO se promove a admin', 'erro', 'alterou');
  exception when others then
    insert into _r (teste, esperado, obtido) values ('aluno NÃO se promove a admin', 'erro', 'erro');
  end;
  begin
    update public.profiles set ativo = false where id = '00000000-0000-4000-8000-0000000000a1';
    insert into _r (teste, esperado, obtido) values ('aluno NÃO altera o próprio status', 'erro', 'alterou');
  exception when others then
    insert into _r (teste, esperado, obtido) values ('aluno NÃO altera o próprio status', 'erro', 'erro');
  end;
  begin
    update public.profiles set email = 'outro@exemplo.invalid' where id = '00000000-0000-4000-8000-0000000000a1';
    insert into _r (teste, esperado, obtido) values ('aluno NÃO altera o e-mail pelo perfil', 'erro', 'alterou');
  exception when others then
    insert into _r (teste, esperado, obtido) values ('aluno NÃO altera o e-mail pelo perfil', 'erro', 'erro');
  end;
  begin
    update public.profiles set aceite_privacidade_versao = '2099-01' where id = '00000000-0000-4000-8000-0000000000a1';
    insert into _r (teste, esperado, obtido) values ('aluno NÃO forja o aceite direto na tabela', 'erro', 'alterou');
  exception when others then
    insert into _r (teste, esperado, obtido) values ('aluno NÃO forja o aceite direto na tabela', 'erro', 'erro');
  end;
  begin
    delete from public.profiles where id = '00000000-0000-4000-8000-0000000000a1';
    insert into _r (teste, esperado, obtido) values ('aluno NÃO apaga perfil', 'erro', 'apagou');
  exception when others then
    insert into _r (teste, esperado, obtido) values ('aluno NÃO apaga perfil', 'erro', 'erro');
  end;
  begin
    insert into public.auditoria (acao) values ('forjado');
    insert into _r (teste, esperado, obtido) values ('aluno NÃO escreve na auditoria', 'erro', 'escreveu');
  exception when others then
    insert into _r (teste, esperado, obtido) values ('aluno NÃO escreve na auditoria', 'erro', 'erro');
  end;
  begin
    perform public.aceitar_privacidade('xyz');
    insert into _r (teste, esperado, obtido) values ('aceite com versão inválida é recusado', 'erro', 'aceitou');
  exception when others then
    insert into _r (teste, esperado, obtido) values ('aceite com versão inválida é recusado', 'erro', 'erro');
  end;
end $$;
select public.aceitar_privacidade('2026-11');
select public.registrar_acesso();
reset role;
insert into _r (teste, esperado, obtido)
select 'aceite e último acesso gravados pelas funções', '2026-11 / sim',
       aceite_privacidade_versao || ' / ' || case when ultimo_acesso is not null and aceite_privacidade_em is not null then 'sim' else 'não' end
  from public.profiles where id = '00000000-0000-4000-8000-0000000000a1';

-- ---------------------------------------------------------------------
-- 3) Aluno INATIVO (sessão ainda aberta)
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a3","role":"authenticated","aal":"aal1"}', false);
set role authenticated;
insert into _r (teste, esperado, obtido) select 'inativo: is_active()', 'false', public.is_active()::text;
insert into _r (teste, esperado, obtido) select 'inativo NÃO lê nem o próprio perfil', '0', count(*)::text from public.profiles;
do $$ declare n int; begin
  update public.profiles set nome = 'x' where id = '00000000-0000-4000-8000-0000000000a3';
  get diagnostics n = row_count;
  insert into _r (teste, esperado, obtido) values ('inativo NÃO edita o próprio perfil', '0', n::text);
end $$;
select public.registrar_acesso();
reset role;
insert into _r (teste, esperado, obtido)
select 'inativo não registra acesso', 'vazio', coalesce(ultimo_acesso::text, 'vazio') from public.profiles where id = '00000000-0000-4000-8000-0000000000a3';

-- ---------------------------------------------------------------------
-- 4) Admin SEM MFA (aal1)
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a4","role":"authenticated","aal":"aal1"}', false);
set role authenticated;
insert into _r (teste, esperado, obtido) select 'admin sem MFA: is_admin()', 'false', public.is_admin()::text;
insert into _r (teste, esperado, obtido) select 'admin sem MFA: tem_papel_admin()', 'true', public.tem_papel_admin()::text;
insert into _r (teste, esperado, obtido) select 'admin sem MFA vê só o próprio perfil', '1', count(*)::text from public.profiles;
insert into _r (teste, esperado, obtido) select 'admin sem MFA NÃO lê auditoria', '0', count(*)::text from public.auditoria;
reset role;

-- ---------------------------------------------------------------------
-- 5) Admin COM MFA (aal2)
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a4","role":"authenticated","aal":"aal2"}', false);
set role authenticated;
insert into _r (teste, esperado, obtido) select 'admin com MFA: is_admin()', 'true', public.is_admin()::text;
insert into _r (teste, esperado, obtido) select 'admin com MFA lê os 4 perfis de teste', '4', count(*)::text from public.profiles where email like 'teste-rls-%@exemplo.invalid';
insert into _r (teste, esperado, obtido) select 'admin com MFA lê a auditoria', 'sim', case when count(*) > 0 then 'sim' else 'não' end from public.auditoria;
do $$ declare n int; begin
  update public.profiles set empresa = 'Empresa Teste' where id = '00000000-0000-4000-8000-0000000000a2';
  get diagnostics n = row_count;
  insert into _r (teste, esperado, obtido) values ('admin com MFA edita dados de um aluno', '1', n::text);
  begin
    update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-0000000000a2';
    insert into _r (teste, esperado, obtido) values ('nem o admin muda papel pelo front (só Edge Function)', 'erro', 'alterou');
  exception when others then
    insert into _r (teste, esperado, obtido) values ('nem o admin muda papel pelo front (só Edge Function)', 'erro', 'erro');
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------
-- 6) Auditoria das mudanças feitas acima (como postgres, com ator informado)
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{}', false);
select set_config('app.ator', '00000000-0000-4000-8000-0000000000a4', false);
update public.profiles set ativo = true where id = '00000000-0000-4000-8000-0000000000a3';
select set_config('app.ator', '', false);
insert into _r (teste, esperado, obtido)
select 'auditoria registra quem reativou (app.ator)', '00000000-0000-4000-8000-0000000000a4', coalesce(quem::text, 'vazio')
  from public.auditoria where alvo = '00000000-0000-4000-8000-0000000000a3' and acao = 'reativar_aluno'
 order by quando desc limit 1;

-- ---------------------------------------------------------------------
-- Limpeza e resultado
-- ---------------------------------------------------------------------
delete from public.auditoria where alvo in (
  '00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000a2',
  '00000000-0000-4000-8000-0000000000a3','00000000-0000-4000-8000-0000000000a4');
delete from auth.users where email like 'teste-rls-%@exemplo.invalid';

select teste, esperado, obtido, (esperado = obtido) as ok
  from _r
 order by quando;
