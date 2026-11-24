-- =====================================================================
-- Teste da migration 0010 (e-mail de confirmação, travas das cotas, separação do portal)
-- Rodar no SQL Editor DEPOIS da 0010.
--
-- Cria um evento de teste (slug "teste-email"), um admin de teste e inscrições
-- de teste, confere as regras e APAGA tudo no fim. Não toca no "encontro-3".
-- Resultado: uma tabela em que todas as linhas devem ter ok = true.
-- =====================================================================

reset role;
select set_config('request.jwt.claims', '{}', false);
delete from public.auditoria where alvo in (select id::text from public.inscricoes where evento_id = '00000000-0000-4000-8000-0000000000f0')
                                 or alvo = '00000000-0000-4000-8000-0000000000f0';
delete from public.inscricoes where evento_id = '00000000-0000-4000-8000-0000000000f0';
delete from public.eventos where id = '00000000-0000-4000-8000-0000000000f0';
delete from public.auditoria where alvo in ('00000000-0000-4000-8000-0000000000f0', '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000f2');
delete from auth.users where email like 'teste-email-%@exemplo.invalid';

drop table if exists pg_temp._r;
create temp table _r (quando timestamptz not null default clock_timestamp(), teste text, esperado text, obtido text);
grant all on _r to authenticated, anon, service_role;
drop table if exists pg_temp._v;
create temp table _v (nome text primary key, valor text);
grant all on _v to authenticated, anon, service_role;

-- Admin de teste e uma conta do portal com o mesmo e-mail de um inscrito (só para o aviso)
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000000f1', 'authenticated', 'authenticated', 'teste-email-admin@exemplo.invalid', '{"nome":"Admin"}', now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000000f2', 'authenticated', 'authenticated', 'teste-email-portal@exemplo.invalid', '{"nome":"Portal"}', now());
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-0000000000f1';

insert into public.eventos (id, slug, titulo, data_inicio, local, capacidade, reservados, inscricoes_abertas, lista_espera)
values ('00000000-0000-4000-8000-0000000000f0', 'teste-email', 'TESTE E-mail', now() + interval '10 days', 'Auditório X, Rua Y, 100', 3, 0, true, true);
insert into public.cotas_doacao (evento_id, tamanho, cota) values
  ('00000000-0000-4000-8000-0000000000f0', 'P', 1), ('00000000-0000-4000-8000-0000000000f0', 'M', 2), ('00000000-0000-4000-8000-0000000000f0', 'G', 1);

create or replace function pg_temp.ficha(extra jsonb) returns jsonb language sql as $$
  select jsonb_build_object('evento', 'teste-email', 'nome', 'Pessoa Teste', 'email', 'pessoa@exemplo.invalid',
                            'empresa', 'Empresa', 'cargo', 'Gestor', 'doacao_tamanho', 'M', 'acompanhante', false,
                            'consentimento', true) || extra;
$$;
grant execute on function pg_temp.ficha(jsonb) to service_role;

-- Retrato do portal ANTES (separação: nada em inscricoes pode mexer aqui)
insert into _v select 'portal_antes',
  (select md5(coalesce(string_agg(u::text, '|' order by u.id), '')) from auth.users u) || '/' ||
  (select md5(coalesce(string_agg(p::text, '|' order by p.id), '')) from public.profiles p);

-- ---------------------------------------------------------------------
-- 1) Inscrição devolve o id (só para a Edge Function) e começa "nao_enviado"
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
set role service_role;
insert into _v select 'r_ana', public.inscricao_registrar(pg_temp.ficha(
  '{"nome":"Ana Teste","whatsapp":"21966660001","email":"teste-email-portal@exemplo.invalid","doacao_tamanho":"M","acompanhante":true,"acompanhante_nome":"Beto Teste","acompanhante_whatsapp":"21955550001","acompanhante_doacao_tamanho":"G"}'))::text;
insert into _v select 'r_caio', public.inscricao_registrar(pg_temp.ficha('{"nome":"Caio Teste","whatsapp":"21966660002","email":"caio@exemplo.invalid","doacao_tamanho":"P"}'))::text;
insert into _v select 'r_duda', public.inscricao_registrar(pg_temp.ficha('{"nome":"Duda Teste","whatsapp":"21966660003","email":"duda@exemplo.invalid","doacao_tamanho":"M"}'))::text;
reset role;
insert into _r (teste, esperado, obtido)
select 'registrar devolve o id da inscrição', 'true/inscrito/true',
       ((valor::jsonb ->> 'id') ~ '^[0-9a-f-]{36}$')::text || '/' || (valor::jsonb ->> 'situacao') || '/' ||
       ((valor::jsonb ->> 'id')::uuid = (select id from public.inscricoes where whatsapp = '21966660001' and evento_id = '00000000-0000-4000-8000-0000000000f0'))::text
  from _v where nome = 'r_ana';
insert into _r (teste, esperado, obtido)
select 'Duda: evento lotado vai para a lista de espera', 'lista_espera', valor::jsonb ->> 'situacao' from _v where nome = 'r_duda';
insert into _r (teste, esperado, obtido)
select 'toda inscrição nova começa "nao_enviado"', 'nao_enviado', string_agg(distinct email_confirmacao_status, ',')
  from public.inscricoes where evento_id = '00000000-0000-4000-8000-0000000000f0';

-- ---------------------------------------------------------------------
-- 2) Reserva do envio: 1 a cada 10 minutos, só os dados do próprio e-mail
-- ---------------------------------------------------------------------
set role service_role;
insert into _v select 'mail1', public.email_confirmacao_reservar((select (valor::jsonb ->> 'id')::uuid from _v where nome = 'r_ana'), false)::text;
insert into _v select 'mail2', coalesce(public.email_confirmacao_reservar((select (valor::jsonb ->> 'id')::uuid from _v where nome = 'r_ana'), false)::text, 'null');
insert into _v select 'mail3', coalesce(public.email_confirmacao_reservar((select (valor::jsonb ->> 'id')::uuid from _v where nome = 'r_ana'), true)::text, 'null');
insert into _v select 'mail_duda', public.email_confirmacao_reservar((select (valor::jsonb ->> 'id')::uuid from _v where nome = 'r_duda'), false)::text;
select public.email_confirmacao_resultado((select (valor::jsonb ->> 'id')::uuid from _v where nome = 'r_ana'), 'enviado', null);
select public.email_confirmacao_resultado((select (valor::jsonb ->> 'id')::uuid from _v where nome = 'r_caio'), 'falhou', null);
reset role;
insert into _r (teste, esperado, obtido)
select 'dados do e-mail: nome, evento, acompanhante e as 2 fraldas', 'Ana/TESTE E-mail/Beto Teste/["M", "G"]/inscrito',
       (valor::jsonb ->> 'primeiro_nome') || '/' || (valor::jsonb -> 'evento' ->> 'titulo') || '/' || (valor::jsonb ->> 'acompanhante_nome') || '/' ||
       (valor::jsonb -> 'tamanhos')::text || '/' || (valor::jsonb ->> 'situacao')
  from _v where nome = 'mail1';
insert into _r (teste, esperado, obtido)
select 'dados do e-mail não trazem WhatsApp, token nem o sobrenome do titular', 'false', (valor ~ '2196666|2195555|token|Ana Teste')::text from _v where nome = 'mail1';
insert into _r (teste, esperado, obtido)
select 'segundo envio em menos de 10 minutos: barrado', 'null', valor from _v where nome = 'mail2';
insert into _r (teste, esperado, obtido)
select 'reenvio forçado (painel): liberado', 'true', (valor <> 'null')::text from _v where nome = 'mail3';
insert into _r (teste, esperado, obtido)
select 'lista de espera: e-mail sem tamanho de fralda', 'lista_espera/[]', (valor::jsonb ->> 'situacao') || '/' || (valor::jsonb -> 'tamanhos')::text from _v where nome = 'mail_duda';
insert into _r (teste, esperado, obtido)
select 'resultado gravado (enviado / falhou)', 'enviado/falhou',
       (select email_confirmacao_status from public.inscricoes where whatsapp = '21966660001' and evento_id = '00000000-0000-4000-8000-0000000000f0') || '/' ||
       (select email_confirmacao_status from public.inscricoes where whatsapp = '21966660002' and evento_id = '00000000-0000-4000-8000-0000000000f0');

-- Reenvio pelo painel (com o admin como ator) vai para a auditoria
set role service_role;
select public.email_confirmacao_resultado((select (valor::jsonb ->> 'id')::uuid from _v where nome = 'r_caio'), 'enviado', '00000000-0000-4000-8000-0000000000f1');
reset role;
insert into _r (teste, esperado, obtido)
select 'reenvio do painel registrado na auditoria', '1', count(*)::text
  from public.auditoria where acao = 'reenviar_confirmacao' and quem = '00000000-0000-4000-8000-0000000000f1';

-- ---------------------------------------------------------------------
-- 3) Painel: status do e-mail só muda pelo servidor; aviso de conta no portal
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f1","role":"authenticated","aal":"aal2"}', false);
set role authenticated;
update public.inscricoes set email_confirmacao_status = 'enviado', observacoes = 'mexi'
 where whatsapp = '21966660003' and evento_id = '00000000-0000-4000-8000-0000000000f0';
insert into _r (teste, esperado, obtido)
select 'admin não marca "enviado" à mão (o resto da edição vale)', 'nao_enviado/mexi', email_confirmacao_status || '/' || observacoes
  from public.inscricoes where whatsapp = '21966660003' and evento_id = '00000000-0000-4000-8000-0000000000f0';
insert into _r (teste, esperado, obtido)
select 'painel mostra "tem conta no portal" (só informação)', 'Ana Teste', string_agg(nome, ',')
  from public.inscricoes_painel where evento_id = '00000000-0000-4000-8000-0000000000f0' and tem_conta_portal;
insert into _r (teste, esperado, obtido)
select 'resumo conta e-mails com falha e não enviados', '0/1',
       (r ->> 'email_falhou') || '/' || (r ->> 'email_pendente')
  from (select public.admin_resumo_evento('00000000-0000-4000-8000-0000000000f0') r) x;

-- ---------------------------------------------------------------------
-- 4) Cotas: não ficam abaixo do reservado
-- ---------------------------------------------------------------------
-- Reservados: P 1 (Caio) · M 1 (Ana) · G 1 (Beto, acompanhante). Duda está na lista de espera (não conta).
do $$ begin
  begin
    update public.cotas_doacao set cota = 0 where evento_id = '00000000-0000-4000-8000-0000000000f0' and tamanho = 'P';
    insert into _r values (default, 'cota abaixo do reservado: recusada', 'erro', 'gravou');
  exception when raise_exception then
    insert into _r values (default, 'cota abaixo do reservado: recusada', 'erro', 'erro');
    insert into _r values (default, 'mensagem clara ao recusar a cota', 'true', (sqlerrm like 'A cota do tamanho P não pode ficar em 0: já há 1 pacote(s) reservado(s).')::text);
  end;
  begin
    delete from public.cotas_doacao where evento_id = '00000000-0000-4000-8000-0000000000f0' and tamanho = 'G';
    insert into _r values (default, 'remover tamanho com reserva: recusado', 'erro', 'removeu');
  exception when raise_exception then insert into _r values (default, 'remover tamanho com reserva: recusado', 'erro', 'erro'); end;
end $$;
update public.cotas_doacao set cota = 5 where evento_id = '00000000-0000-4000-8000-0000000000f0' and tamanho = 'M';
update public.cotas_doacao set cota = 1 where evento_id = '00000000-0000-4000-8000-0000000000f0' and tamanho = 'M';
insert into _r (teste, esperado, obtido)
select 'aumentar e baixar até o reservado: aceito', '1', cota::text from public.cotas_doacao where evento_id = '00000000-0000-4000-8000-0000000000f0' and tamanho = 'M';
insert into _r (teste, esperado, obtido)
select 'mudança de cota na auditoria (com de/para e o admin)', '5→1',
       (select string_agg((detalhes ->> 'de') || '→' || (detalhes ->> 'para'), ',' order by id) from public.auditoria
         where acao = 'alterar_cota' and alvo = '00000000-0000-4000-8000-0000000000f0' and quem = '00000000-0000-4000-8000-0000000000f1'
           and detalhes ->> 'para' = '1');
update public.eventos set doacao_marca = 'Pampers' where id = '00000000-0000-4000-8000-0000000000f0';
insert into _r (teste, esperado, obtido)
select 'mudança da marca na auditoria (só o nome do campo)', '["doacao_marca"]', (detalhes -> 'campos')::text
  from public.auditoria where acao = 'alterar_evento' and alvo = '00000000-0000-4000-8000-0000000000f0' and quem = '00000000-0000-4000-8000-0000000000f1'
 order by id desc limit 1;
-- Excluir (apaga de verdade) e cancelar
update public.inscricoes set status = 'cancelado' where whatsapp = '21966660002' and evento_id = '00000000-0000-4000-8000-0000000000f0';
delete from public.inscricoes where whatsapp = '21966660003' and evento_id = '00000000-0000-4000-8000-0000000000f0';
reset role;

-- ---------------------------------------------------------------------
-- 5) Separação: inscrição ≠ portal
-- ---------------------------------------------------------------------
insert into _r (teste, esperado, obtido)
select 'nada em inscricoes mexeu em auth.users nem em profiles', valor,
  (select md5(coalesce(string_agg(u::text, '|' order by u.id), '')) from auth.users u) || '/' ||
  (select md5(coalesce(string_agg(p::text, '|' order by p.id), '')) from public.profiles p)
  from _v where nome = 'portal_antes';
insert into _r (teste, esperado, obtido)
select 'nenhuma chave estrangeira liga inscrições/eventos ao portal', '0', count(*)::text
  from pg_constraint c
 where c.contype = 'f'
   and c.conrelid in ('public.inscricoes'::regclass, 'public.eventos'::regclass, 'public.cotas_doacao'::regclass)
   and c.confrelid not in ('public.inscricoes'::regclass, 'public.eventos'::regclass, 'public.cotas_doacao'::regclass);
insert into _r (teste, esperado, obtido)
select 'nenhum gatilho de inscricoes grava em auth ou profiles', '0', count(*)::text
  from pg_trigger t join pg_proc p on p.oid = t.tgfoid
 where t.tgrelid = 'public.inscricoes'::regclass and not t.tgisinternal
   and (p.prosrc ~* 'auth\.users|public\.profiles');

-- Permissões das funções novas
insert into _r (teste, esperado, obtido)
select 'anon/aluno sem EXECUTE nas funções de e-mail', 'false', bool_or(has_function_privilege(r, f, 'EXECUTE'))::text
  from unnest(array['anon', 'authenticated']) r,
       unnest(array['public.email_confirmacao_reservar(uuid,boolean)', 'public.email_confirmacao_resultado(uuid,text,uuid)']) f;

-- ---------------------------------------------------------------------
-- Limpeza e resultado
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{}', false);
delete from public.auditoria where alvo in (select id::text from public.inscricoes where evento_id = '00000000-0000-4000-8000-0000000000f0')
                                 or alvo in ('00000000-0000-4000-8000-0000000000f0', '00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000f2')
                                 or quem = '00000000-0000-4000-8000-0000000000f1'
                                 or (acao = 'inscricao_reenviada' and detalhes ->> 'evento' = '00000000-0000-4000-8000-0000000000f0');
delete from public.inscricoes where evento_id = '00000000-0000-4000-8000-0000000000f0';
delete from public.eventos where id = '00000000-0000-4000-8000-0000000000f0';
delete from public.auditoria where alvo = '00000000-0000-4000-8000-0000000000f0';
delete from auth.users where email like 'teste-email-%@exemplo.invalid';

select teste, esperado, obtido, (esperado = obtido) as ok
  from _r
 order by quando;
