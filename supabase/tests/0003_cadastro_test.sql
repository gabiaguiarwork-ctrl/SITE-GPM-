-- =====================================================================
-- Teste da migration 0006 (cadastro aberto) · rodar no SQL Editor DEPOIS da 0006
--
-- Cria usuários e conteúdo de teste, simula cada perfil com "set role" + JWT
-- simulado, confere as regras e APAGA tudo no fim.
-- Resultado: uma tabela em que todas as linhas devem ter ok = true.
--
-- Usuários (e-mails @exemplo.invalid):
--   c1 cadastro próprio completo (com "role":"admin" nos metadados, que deve ser ignorado)
--   c2 convidado pelo painel, só com o nome (cadastro incompleto)
--   c3 cadastro com dados inválidos (não pode derrubar o cadastro)
--   c4 cadastro ainda sem e-mail confirmado (refaz o cadastro)
--   c5 admin
-- =====================================================================

-- Limpeza de uma execução anterior que tenha parado no meio
select set_config('request.jwt.claims', '{}', false);
delete from public.conteudos where id = '00000000-0000-4000-8000-0000000000d2';
delete from public.modulos where id = '00000000-0000-4000-8000-0000000000d1';
delete from public.avisos  where id = '00000000-0000-4000-8000-0000000000d3';
delete from public.auditoria where alvo like '00000000-0000-4000-8000-0000000000c%' or alvo like '00000000-0000-4000-8000-0000000000d%';
delete from auth.users where email like 'teste-rls3-%@exemplo.invalid';

drop table if exists pg_temp._r;
create temp table _r (quando timestamptz not null default clock_timestamp(), teste text, esperado text, obtido text);
grant all on _r to authenticated, anon;

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, invited_at, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000000c1', 'authenticated', 'authenticated', 'teste-rls3-c1@exemplo.invalid',
   '{"nome":"  Maria  ","sobrenome":"Souza   Lima","whatsapp":"(21) 99876-5432","cpf":"529.982.247-25","empresa":"Empresa X","cargo":"Gerente","aceite_comunicacoes":true,"role":"admin"}',
   null, now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000000c2', 'authenticated', 'authenticated', 'teste-rls3-c2@exemplo.invalid',
   '{"nome":"Convidado da Silva"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated', 'teste-rls3-c3@exemplo.invalid',
   jsonb_build_object('nome', 'X', 'sobrenome', 'Y', 'whatsapp', '123', 'cpf', '111.111.111-11', 'empresa', '   ',
                      'cargo', repeat('a', 300), 'aceite_comunicacoes', 'sim', 'role', 'admin'),
   null, now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000000c4', 'authenticated', 'authenticated', 'teste-rls3-c4@exemplo.invalid',
   '{"nome":"Pendente","whatsapp":"(11) 98888-7777","cpf":"123.456.789-09"}', null, null),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000000c5', 'authenticated', 'authenticated', 'teste-rls3-c5@exemplo.invalid',
   '{"nome":"Admin Tres"}', null, now());

update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-0000000000c5';

-- ---------------------------------------------------------------------
-- 1) Perfil criado a partir dos metadados
-- ---------------------------------------------------------------------
insert into _r (teste, esperado, obtido)
select 'cadastro: "role":"admin" nos metadados é ignorado', 'aluno', role from public.profiles where id = '00000000-0000-4000-8000-0000000000c1';
insert into _r (teste, esperado, obtido)
select 'cadastro: dados limpos (espaços, WhatsApp e CPF só com dígitos)', 'Maria|Souza Lima|21998765432|52998224725|Empresa X|Gerente',
       concat_ws('|', nome, sobrenome, whatsapp, cpf, empresa, cargo)
  from public.profiles where id = '00000000-0000-4000-8000-0000000000c1';
insert into _r (teste, esperado, obtido)
select 'cadastro: aceite de comunicações gravado com data', 'true/sim',
       aceite_comunicacoes::text || '/' || case when aceite_comunicacoes_em is not null then 'sim' else 'não' end
  from public.profiles where id = '00000000-0000-4000-8000-0000000000c1';
insert into _r (teste, esperado, obtido)
select 'cadastro: aceite de comunicações registrado na auditoria', '1', count(*)::text
  from public.auditoria where alvo = '00000000-0000-4000-8000-0000000000c1' and acao = 'aceitar_comunicacoes';
insert into _r (teste, esperado, obtido)
select 'cadastro: aceite da privacidade NÃO vem dos metadados', 'vazio', coalesce(aceite_privacidade_em::text, 'vazio')
  from public.profiles where id = '00000000-0000-4000-8000-0000000000c1';
insert into _r (teste, esperado, obtido)
select 'CPF e WhatsApp saem dos metadados da conta (não vão no token)', 'false/Maria',
       (raw_user_meta_data ? 'cpf' or raw_user_meta_data ? 'whatsapp')::text || '/' || btrim(raw_user_meta_data ->> 'nome')
  from auth.users where id = '00000000-0000-4000-8000-0000000000c1';
insert into _r (teste, esperado, obtido)
select 'dados inválidos não derrubam o cadastro e ficam vazios', 'aluno|-|-|-|-|-|120|false',
       concat_ws('|', role, coalesce(nome, '-'), coalesce(sobrenome, '-'), coalesce(whatsapp, '-'), coalesce(cpf, '-'),
                 coalesce(empresa, '-'), char_length(cargo)::text, aceite_comunicacoes::text)
  from public.profiles where id = '00000000-0000-4000-8000-0000000000c3';
insert into _r (teste, esperado, obtido)
select 'convite: perfil criado só com o nome', 'Convidado da Silva|-', nome || '|' || coalesce(cpf, '-')
  from public.profiles where id = '00000000-0000-4000-8000-0000000000c2';

-- Conteúdo de teste (d1 encontro liberado, d2 PDF publicado, d3 aviso publicado)
insert into public.modulos (id, titulo, ordem, publicado, liberado_em)
values ('00000000-0000-4000-8000-0000000000d1', 'TESTE3 encontro', 931, true, null);
insert into public.conteudos (id, modulo_id, titulo, tipo, arquivo_path, ordem, publicado)
values ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000d1', 'TESTE3 material', 'pdf', 'teste3/material.pdf', 1, true);
insert into public.avisos (id, titulo, publicado)
values ('00000000-0000-4000-8000-0000000000d3', 'TESTE3 aviso', true);

-- ---------------------------------------------------------------------
-- 2) c1: cadastro próprio, ANTES e DEPOIS do aceite da privacidade
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated","aal":"aal1"}', false);
set role authenticated;
insert into _r (teste, esperado, obtido) select 'sem aceite da privacidade: cadastro_completo()', 'false', public.cadastro_completo()::text;
insert into _r (teste, esperado, obtido) select 'sem aceite: NÃO vê encontro', '0', count(*)::text from public.modulos where id = '00000000-0000-4000-8000-0000000000d1';
insert into _r (teste, esperado, obtido) select 'sem aceite: NÃO vê conteúdo', '0', count(*)::text from public.conteudos where id = '00000000-0000-4000-8000-0000000000d2';
select public.aceitar_privacidade('2026-11');
insert into _r (teste, esperado, obtido) select 'completo: cadastro_completo()', 'true', public.cadastro_completo()::text;
insert into _r (teste, esperado, obtido) select 'completo: vê encontro', '1', count(*)::text from public.modulos where id = '00000000-0000-4000-8000-0000000000d1';
insert into _r (teste, esperado, obtido) select 'completo: vê conteúdo', '1', count(*)::text from public.conteudos where id = '00000000-0000-4000-8000-0000000000d2';
insert into _r (teste, esperado, obtido) select 'completo: vê aviso', '1', count(*)::text from public.avisos where id = '00000000-0000-4000-8000-0000000000d3';
insert into _r (teste, esperado, obtido) select 'completo: material liberado', 'true', privado.material_visivel('teste3/material.pdf')::text;
do $$ declare n int; begin
  insert into public.progresso (aluno_id, conteudo_id, posicao_seg) values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000d2', 10);
  insert into _r values (default, 'completo: grava progresso', 'ok', 'ok');

  update public.profiles set sobrenome = 'Souza Lima Neto' where id = '00000000-0000-4000-8000-0000000000c1';
  get diagnostics n = row_count;
  insert into _r values (default, 'aluno edita o próprio sobrenome', '1', n::text);

  begin
    update public.profiles set aceite_comunicacoes_em = '2000-01-01' where id = '00000000-0000-4000-8000-0000000000c1';
    insert into _r values (default, 'aluno NÃO forja a data do aceite de comunicações', 'erro', 'alterou');
  exception when others then insert into _r values (default, 'aluno NÃO forja a data do aceite de comunicações', 'erro', 'erro'); end;
  begin
    update public.profiles set aceite_comunicacoes = false where id = '00000000-0000-4000-8000-0000000000c1';
    insert into _r values (default, 'aluno NÃO muda o aceite de comunicações direto na tabela', 'erro', 'alterou');
  exception when others then insert into _r values (default, 'aluno NÃO muda o aceite de comunicações direto na tabela', 'erro', 'erro'); end;
  begin
    update public.profiles set cpf = '11144477735' where id = '00000000-0000-4000-8000-0000000000c1';
    insert into _r values (default, 'aluno NÃO troca um CPF já preenchido', 'erro', 'alterou');
  exception when others then insert into _r values (default, 'aluno NÃO troca um CPF já preenchido', 'erro', 'erro'); end;
  begin
    update public.profiles set whatsapp = '123' where id = '00000000-0000-4000-8000-0000000000c1';
    insert into _r values (default, 'banco recusa WhatsApp inválido', 'erro', 'alterou');
  exception when others then insert into _r values (default, 'banco recusa WhatsApp inválido', 'erro', 'erro'); end;
  begin
    update public.profiles set nome = 'A' where id = '00000000-0000-4000-8000-0000000000c1';
    insert into _r values (default, 'banco recusa nome com menos de 2 letras', 'erro', 'alterou');
  exception when others then insert into _r values (default, 'banco recusa nome com menos de 2 letras', 'erro', 'erro'); end;
  begin
    update public.profiles set sobrenome = repeat('b', 81) where id = '00000000-0000-4000-8000-0000000000c1';
    insert into _r values (default, 'banco recusa sobrenome com mais de 80 letras', 'erro', 'alterou');
  exception when others then insert into _r values (default, 'banco recusa sobrenome com mais de 80 letras', 'erro', 'erro'); end;
end $$;
insert into _r (teste, esperado, obtido)
select 'aluno retira o consentimento de comunicações (devolve a data)', 'sim', case when public.definir_comunicacoes(false) is not null then 'sim' else 'não' end;
reset role;
insert into _r (teste, esperado, obtido)
select 'consentimento retirado, com data nova', 'false/sim', aceite_comunicacoes::text || '/' || case when aceite_comunicacoes_em > now() - interval '1 minute' then 'sim' else 'não' end
  from public.profiles where id = '00000000-0000-4000-8000-0000000000c1';
insert into _r (teste, esperado, obtido)
select 'retirada registrada na auditoria (pelo próprio aluno)', '1', count(*)::text
  from public.auditoria where alvo = '00000000-0000-4000-8000-0000000000c1' and acao = 'retirar_comunicacoes' and quem = '00000000-0000-4000-8000-0000000000c1';

-- ---------------------------------------------------------------------
-- 2b) O trigger protege a data do consentimento sozinho, mesmo com GRANT por engano.
--     O GRANT é feito numa subtransação desfeita no fim (nada fica gravado).
-- ---------------------------------------------------------------------
do $$
declare
  resultado text;
begin
  begin
    grant update (aceite_comunicacoes, aceite_comunicacoes_em) on public.profiles to authenticated;
    perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated","aal":"aal1"}', true);
    perform set_config('role', 'authenticated', true);
    begin
      update public.profiles set aceite_comunicacoes = true, aceite_comunicacoes_em = '2000-01-01'
       where id = '00000000-0000-4000-8000-0000000000c1';
      resultado := 'alterou';
    exception when others then
      resultado := sqlerrm;
    end;
    raise exception 'desfazer_teste';
  exception when others then
    if sqlerrm <> 'desfazer_teste' then
      resultado := coalesce(resultado, '') || ' / falha na preparação: ' || sqlerrm;
    end if;
  end;
  insert into _r (teste, esperado, obtido)
  values ('trigger bloqueia o aluno forjar o consentimento mesmo com GRANT', 'alteração não permitida', resultado);
end $$;
insert into _r (teste, esperado, obtido)
select 'GRANT temporário foi desfeito', 'false', has_column_privilege('authenticated', 'public.profiles', 'aceite_comunicacoes_em', 'UPDATE')::text;

-- ---------------------------------------------------------------------
-- 3) c2: convidado com cadastro incompleto
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c2","role":"authenticated","aal":"aal1"}', false);
set role authenticated;
select public.aceitar_privacidade('2026-11');
insert into _r (teste, esperado, obtido) select 'incompleto: cadastro_completo()', 'false', public.cadastro_completo()::text;
insert into _r (teste, esperado, obtido) select 'incompleto: lê o próprio perfil (para completar)', '1', count(*)::text from public.profiles;
insert into _r (teste, esperado, obtido) select 'incompleto: NÃO vê encontro', '0', count(*)::text from public.modulos where id = '00000000-0000-4000-8000-0000000000d1';
insert into _r (teste, esperado, obtido) select 'incompleto: NÃO vê conteúdo', '0', count(*)::text from public.conteudos where id = '00000000-0000-4000-8000-0000000000d2';
insert into _r (teste, esperado, obtido) select 'incompleto: NÃO vê aviso', '0', count(*)::text from public.avisos where id = '00000000-0000-4000-8000-0000000000d3';
insert into _r (teste, esperado, obtido) select 'incompleto: material bloqueado', 'false', privado.material_visivel('teste3/material.pdf')::text;
do $$ declare n int; begin
  begin
    insert into public.progresso (aluno_id, conteudo_id) values ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000d2');
    insert into _r values (default, 'incompleto: NÃO grava progresso', 'erro', 'gravou');
  exception when others then insert into _r values (default, 'incompleto: NÃO grava progresso', 'erro', 'erro'); end;

  update public.profiles
     set nome = 'Convidado', sobrenome = 'da Silva', whatsapp = '(31) 3333-4444', cpf = '123.456.789-09',
         empresa = 'Empresa Y', cargo = 'Analista'
   where id = '00000000-0000-4000-8000-0000000000c2';
  get diagnostics n = row_count;
  insert into _r values (default, 'convidado completa o cadastro (CPF vazio pode ser preenchido)', '1', n::text);
end $$;
insert into _r (teste, esperado, obtido) select 'depois de completar: cadastro_completo()', 'true', public.cadastro_completo()::text;
insert into _r (teste, esperado, obtido) select 'depois de completar: vê encontro', '1', count(*)::text from public.modulos where id = '00000000-0000-4000-8000-0000000000d1';
do $$ begin
  update public.profiles set cpf = '52998224725' where id = '00000000-0000-4000-8000-0000000000c2';
  insert into _r values (default, 'depois de preenchido, o CPF não muda pelo front', 'erro', 'alterou');
exception when others then insert into _r values (default, 'depois de preenchido, o CPF não muda pelo front', 'erro', 'erro'); end $$;
reset role;
insert into _r (teste, esperado, obtido)
select 'telefone fixo e CPF gravados só com dígitos', '3133334444|12345678909', whatsapp || '|' || cpf
  from public.profiles where id = '00000000-0000-4000-8000-0000000000c2';

-- ---------------------------------------------------------------------
-- 4) Ativo + completo, mas desativado pelo admin: não vê nada
-- ---------------------------------------------------------------------
update public.profiles set ativo = false where id = '00000000-0000-4000-8000-0000000000c2';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c2","role":"authenticated","aal":"aal1"}', false);
set role authenticated;
insert into _r (teste, esperado, obtido) select 'completo mas inativo: NÃO vê encontro', '0', count(*)::text from public.modulos where id = '00000000-0000-4000-8000-0000000000d1';
reset role;

-- ---------------------------------------------------------------------
-- 5) Cadastro repetido antes de confirmar o e-mail (o Supabase regrava os metadados)
-- ---------------------------------------------------------------------
insert into _r (teste, esperado, obtido)
select 'pendente: perfil do primeiro cadastro', 'Pendente|11988887777|12345678909', concat_ws('|', nome, whatsapp, cpf)
  from public.profiles where id = '00000000-0000-4000-8000-0000000000c4';
update auth.users
   set raw_user_meta_data = raw_user_meta_data
       || '{"nome":"Pendente Novo","cpf":"987.654.321-00","whatsapp":"(11) 97777-6666","aceite_comunicacoes":true}'::jsonb
 where id = '00000000-0000-4000-8000-0000000000c4';
insert into _r (teste, esperado, obtido)
select 'pendente: perfil atualizado com o novo cadastro', 'Pendente Novo|11977776666|98765432100|true', concat_ws('|', nome, whatsapp, cpf, aceite_comunicacoes::text)
  from public.profiles where id = '00000000-0000-4000-8000-0000000000c4';
insert into _r (teste, esperado, obtido)
select 'pendente: CPF e WhatsApp saem dos metadados de novo', 'false', (raw_user_meta_data ? 'cpf' or raw_user_meta_data ? 'whatsapp')::text
  from auth.users where id = '00000000-0000-4000-8000-0000000000c4';
update auth.users
   set raw_user_meta_data = raw_user_meta_data || '{"cpf":"111.444.777-35"}'::jsonb
 where id = '00000000-0000-4000-8000-0000000000c1';
insert into _r (teste, esperado, obtido)
select 'e-mail já confirmado: metadados não mexem no perfil', '52998224725', cpf
  from public.profiles where id = '00000000-0000-4000-8000-0000000000c1';

-- ---------------------------------------------------------------------
-- 6) Painel: admin_contas() (e-mail confirmado, convite, cadastro completo)
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated","aal":"aal1"}', false);
set role authenticated;
insert into _r (teste, esperado, obtido) select 'aluno: admin_contas() não devolve nada', '0', count(*)::text from public.admin_contas();
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c5","role":"authenticated","aal":"aal1"}', false);
set role authenticated;
insert into _r (teste, esperado, obtido) select 'admin sem MFA: admin_contas() não devolve nada', '0', count(*)::text from public.admin_contas();
reset role;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c5","role":"authenticated","aal":"aal2"}', false);
set role authenticated;
insert into _r (teste, esperado, obtido)
select 'admin com MFA: admin_contas() lista as 5 contas de teste', '5', count(*)::text
  from public.admin_contas() where id::text like '00000000-0000-4000-8000-0000000000c%';
insert into _r (teste, esperado, obtido)
select 'admin_contas(): convite, e-mail confirmado e cadastro completo', 'c1:cadastro/sim/true c2:convite/sim/true c4:cadastro/não/false',
       string_agg(right(id::text, 2) || ':' || case when convidado_em is not null then 'convite' else 'cadastro' end
                  || '/' || case when email_confirmado_em is not null then 'sim' else 'não' end
                  || '/' || cadastro_completo::text, ' ' order by id)
  from public.admin_contas()
 where id in ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000c4');
insert into _r (teste, esperado, obtido)
select 'admin com MFA vê o conteúdo mesmo sem cadastro completo', '1', count(*)::text from public.modulos where id = '00000000-0000-4000-8000-0000000000d1';
reset role;

-- ---------------------------------------------------------------------
-- 7) anon não executa nada do cadastro
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"anon"}', false);
set role anon;
do $$ begin
  begin perform public.cadastro_completo(); insert into _r values (default, 'anon não executa cadastro_completo()', 'erro', 'executou');
  exception when others then insert into _r values (default, 'anon não executa cadastro_completo()', 'erro', 'erro'); end;
  begin perform public.definir_comunicacoes(true); insert into _r values (default, 'anon não executa definir_comunicacoes()', 'erro', 'executou');
  exception when others then insert into _r values (default, 'anon não executa definir_comunicacoes()', 'erro', 'erro'); end;
  begin perform count(*) from public.admin_contas(); insert into _r values (default, 'anon não executa admin_contas()', 'erro', 'executou');
  exception when others then insert into _r values (default, 'anon não executa admin_contas()', 'erro', 'erro'); end;
end $$;
reset role;

-- ---------------------------------------------------------------------
-- Limpeza e resultado
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{}', false);
delete from public.conteudos where id = '00000000-0000-4000-8000-0000000000d2';
delete from public.modulos where id = '00000000-0000-4000-8000-0000000000d1';
delete from public.avisos  where id = '00000000-0000-4000-8000-0000000000d3';
delete from public.auditoria where alvo like '00000000-0000-4000-8000-0000000000c%' or alvo like '00000000-0000-4000-8000-0000000000d%';
delete from auth.users where email like 'teste-rls3-%@exemplo.invalid';

select teste, esperado, obtido, (esperado = obtido) as ok
  from _r
 order by quando;
