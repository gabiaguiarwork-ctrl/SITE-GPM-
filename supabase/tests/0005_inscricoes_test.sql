-- =====================================================================
-- Teste da migration 0009 (inscrições e confirmação de presença)
-- Rodar no SQL Editor DEPOIS da 0009.
--
-- Cria um evento de teste (slug "teste-inscricoes"), dois usuários e inscrições
-- de teste, simula cada perfil com "set role" + JWT simulado, confere as regras
-- e APAGA tudo no fim. Não toca no evento "encontro-3".
-- Resultado: uma tabela em que todas as linhas devem ter ok = true.
--
-- Evento de teste: 5 lugares, 1 reservado (= 4 livres); fraldas P 1 · M 2 · G 1.
-- Usuários: …e1 aluno · …e2 admin
-- WhatsApps de teste: 2199999000x
-- =====================================================================

-- Limpeza de uma execução anterior
reset role;
select set_config('request.jwt.claims', '{}', false);
delete from public.auditoria where alvo in (select id::text from public.inscricoes where evento_id = '00000000-0000-4000-8000-0000000000e0')
                                 or alvo = '00000000-0000-4000-8000-0000000000e0';
delete from public.inscricoes where evento_id = '00000000-0000-4000-8000-0000000000e0';
delete from public.eventos where id = '00000000-0000-4000-8000-0000000000e0';
delete from public.auditoria where alvo = '00000000-0000-4000-8000-0000000000e0';
delete from privado.limites_envio where chave = 'teste-limite-0000000000000001';
delete from public.auditoria where alvo in ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000e2');
delete from auth.users where email like 'teste-insc-%@exemplo.invalid';

drop table if exists pg_temp._r;
create temp table _r (quando timestamptz not null default clock_timestamp(), teste text, esperado text, obtido text);
grant all on _r to authenticated, anon, service_role;
drop table if exists pg_temp._v;
create temp table _v (nome text primary key, valor text);
grant all on _v to authenticated, anon, service_role;

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, email_confirmed_at) values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000000e1', 'authenticated', 'authenticated', 'teste-insc-aluno@exemplo.invalid', '{"nome":"Aluno"}', now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-8000-0000000000e2', 'authenticated', 'authenticated', 'teste-insc-admin@exemplo.invalid', '{"nome":"Admin"}', now());
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-0000000000e2';

insert into public.eventos (id, slug, titulo, data_inicio, local, capacidade, reservados, inscricoes_abertas, lista_espera)
values ('00000000-0000-4000-8000-0000000000e0', 'teste-inscricoes', 'TESTE Encontro', now() + interval '10 days', 'Auditório de teste', 5, 1, true, true);
insert into public.cotas_doacao (evento_id, tamanho, cota) values
  ('00000000-0000-4000-8000-0000000000e0', 'P', 1), ('00000000-0000-4000-8000-0000000000e0', 'M', 2), ('00000000-0000-4000-8000-0000000000e0', 'G', 1);

-- Ficha padrão de inscrição (o teste troca só o que precisa)
create or replace function pg_temp.ficha(extra jsonb) returns jsonb language sql as $$
  select jsonb_build_object('evento', 'teste-inscricoes', 'nome', 'Pessoa Teste', 'email', 'pessoa@exemplo.invalid',
                            'empresa', 'Empresa', 'cargo', 'Gestor', 'equipe_gpm', false, 'participou', '[]'::jsonb,
                            'perfil_ia', 'Especialista', 'doacao_tamanho', 'M', 'acompanhante', false,
                            'consentimento', true, 'aceite_comunicacoes', false) || extra;
$$;
grant execute on function pg_temp.ficha(jsonb) to service_role;

-- ---------------------------------------------------------------------
-- 1) Público (anon): só a situação, sem números
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"anon"}', false);
set role anon;
do $$ begin
  begin perform 1 from public.inscricoes limit 1;
    insert into _r values (default, 'anon não lê inscricoes', 'erro', 'leu');
  exception when insufficient_privilege then insert into _r values (default, 'anon não lê inscricoes', 'erro', 'erro'); end;
  begin perform 1 from public.eventos limit 1;
    insert into _r values (default, 'anon não lê eventos', 'erro', 'leu');
  exception when insufficient_privilege then insert into _r values (default, 'anon não lê eventos', 'erro', 'erro'); end;
  begin insert into public.inscricoes (evento_id, nome, whatsapp, email, empresa, cargo)
        values ('00000000-0000-4000-8000-0000000000e0', 'Intruso', '21999990009', 'x@exemplo.invalid', 'E', 'C');
    insert into _r values (default, 'anon não grava inscricoes', 'erro', 'gravou');
  exception when insufficient_privilege then insert into _r values (default, 'anon não grava inscricoes', 'erro', 'erro'); end;
  begin perform public.inscricao_registrar(pg_temp.ficha('{"whatsapp":"21999990009"}'));
    insert into _r values (default, 'anon não chama inscricao_registrar (só a Edge Function)', 'erro', 'chamou');
  exception when insufficient_privilege then insert into _r values (default, 'anon não chama inscricao_registrar (só a Edge Function)', 'erro', 'erro'); end;
  begin perform public.presenca_consultar(repeat('a', 32));
    insert into _r values (default, 'anon não chama presenca_consultar (só a Edge Function)', 'erro', 'chamou');
  exception when insufficient_privilege then insert into _r values (default, 'anon não chama presenca_consultar (só a Edge Function)', 'erro', 'erro'); end;
  begin perform public.admin_resumo_evento('00000000-0000-4000-8000-0000000000e0');
    insert into _r values (default, 'anon não chama admin_resumo_evento', 'erro', 'chamou');
  exception when insufficient_privilege then insert into _r values (default, 'anon não chama admin_resumo_evento', 'erro', 'erro'); end;
end $$;
insert into _r (teste, esperado, obtido)
select 'anon: evento aberto com 4 lugares ou menos = últimas vagas, com os 3 tamanhos', 'ultimas_vagas/{P,M,G}/true', situacao || '/' || tamanhos::text || '/' || acompanhante
  from public.evento_publico('teste-inscricoes');
insert into _r (teste, esperado, obtido)
select 'anon: a função pública não devolve nenhum número', 'acompanhante,data_inicio,doacao_marca,inscricoes_abertas,local,situacao,slug,tamanhos,titulo',
       string_agg(k, ',' order by k) from jsonb_object_keys((select to_jsonb(x) from public.evento_publico('teste-inscricoes') x)) k;
insert into _r (teste, esperado, obtido)
select 'anon: evento inexistente não devolve nada', '0', count(*)::text from public.evento_publico('nao-existe');
reset role;

-- ---------------------------------------------------------------------
-- 2) Inscrições pelo servidor (Edge Function = service_role)
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
set role service_role;

-- A: titular, fralda P
insert into _r (teste, esperado, obtido)
select 'A: inscrição nova', 'true/inscrito', (r ->> 'ok') || '/' || (r ->> 'situacao')
  from (select public.inscricao_registrar(pg_temp.ficha('{"nome":"Ana  Teste","whatsapp":"21999990001","email":"ANA@Exemplo.invalid","doacao_tamanho":"P"}')) r) x;
insert into _r (teste, esperado, obtido)
select 'A: resposta não traz dados de inscritos (depois da 0010 vem também o id, que a Edge Function não repassa)', 'ok,situacao', string_agg(k, ',' order by k) filter (where k <> 'id')
  from jsonb_object_keys(public.inscricao_registrar(pg_temp.ficha('{"nome":"Ana Teste","whatsapp":"(21) 99999-0001","email":"ana@exemplo.invalid","doacao_tamanho":"P"}'))) k;
-- (a linha acima é o 2º envio da Ana, com máscara no WhatsApp)

-- B: e-mail igual ao da Ana, WhatsApp diferente, fralda G → linha nova
insert into _r (teste, esperado, obtido)
select 'B: mesmo e-mail, outro WhatsApp vira linha nova', 'inscrito', r ->> 'situacao'
  from (select public.inscricao_registrar(pg_temp.ficha('{"nome":"Bruno Teste","whatsapp":"21999990002","email":"ana@exemplo.invalid","doacao_tamanho":"G"}')) r) x;

-- C: pede P, que acabou → erro com os tamanhos que restam
insert into _r (teste, esperado, obtido)
select 'C: tamanho esgotado devolve os que restam', 'tamanho_esgotado/["M"]', (r ->> 'erro') || '/' || (r -> 'tamanhos')::text
  from (select public.inscricao_registrar(pg_temp.ficha('{"nome":"Carla Teste","whatsapp":"21999990003","email":"carla@exemplo.invalid","doacao_tamanho":"P"}')) r) x;

-- Erros de dados
insert into _r (teste, esperado, obtido)
select 'sem concordância: recusado', 'consentimento', r ->> 'erro'
  from (select public.inscricao_registrar(pg_temp.ficha('{"whatsapp":"21999990008","consentimento":false}')) r) x;
insert into _r (teste, esperado, obtido)
select 'e-mail inválido: recusado', 'dados', r ->> 'erro'
  from (select public.inscricao_registrar(pg_temp.ficha('{"whatsapp":"21999990008","email":"sem-arroba"}')) r) x;
insert into _r (teste, esperado, obtido)
select 'WhatsApp inválido: recusado', 'dados', r ->> 'erro'
  from (select public.inscricao_registrar(pg_temp.ficha('{"whatsapp":"123"}')) r) x;
insert into _r (teste, esperado, obtido)
select 'acompanhante sem nome: recusado', 'dados', r ->> 'erro'
  from (select public.inscricao_registrar(pg_temp.ficha('{"whatsapp":"21999990008","acompanhante":true,"acompanhante_whatsapp":"21988880008","acompanhante_doacao_tamanho":"M"}')) r) x;
insert into _r (teste, esperado, obtido)
select 'perfil fora da lista: recusado', 'dados', r ->> 'erro'
  from (select public.inscricao_registrar(pg_temp.ficha('{"whatsapp":"21999990008","perfil_ia":"Hacker"}')) r) x;
insert into _r (teste, esperado, obtido)
select 'evento inexistente: encerradas', 'encerradas', r ->> 'erro'
  from (select public.inscricao_registrar(pg_temp.ficha('{"whatsapp":"21999990008","evento":"nao-existe"}')) r) x;

-- D: com acompanhante, os dois com M → ocupa 2 lugares e 2 pacotes M (lota o evento)
insert into _r (teste, esperado, obtido)
select 'D: com acompanhante (2 lugares, 2 pacotes M)', 'inscrito', r ->> 'situacao'
  from (select public.inscricao_registrar(pg_temp.ficha('{"nome":"Davi Teste","whatsapp":"21999990004","email":"davi@exemplo.invalid","acompanhante":true,"acompanhante_nome":"Duda Teste","acompanhante_whatsapp":"21988880004","acompanhante_doacao_tamanho":"M"}')) r) x;

-- E: evento lotado → lista de espera (não reserva cota)
insert into _r (teste, esperado, obtido)
select 'E: lotado vai para a lista de espera', 'lista_espera', r ->> 'situacao'
  from (select public.inscricao_registrar(pg_temp.ficha('{"nome":"Eva Teste","whatsapp":"21999990005","email":"eva@exemplo.invalid","doacao_tamanho":"M"}')) r) x;
reset role;

insert into _r (teste, esperado, obtido)
select 'repetido por WhatsApp: 1 linha só, envios = 2, dados atualizados', '1/2/Ana Teste/ana@exemplo.invalid/21999990001',
       count(*) || '/' || max(envios) || '/' || max(nome) || '/' || max(email) || '/' || max(whatsapp)
  from public.inscricoes where evento_id = '00000000-0000-4000-8000-0000000000e0' and whatsapp = '21999990001';
insert into _r (teste, esperado, obtido)
select 'reenvio registrado na auditoria, sem os valores', 'inscricao_reenviada/false',
       acao || '/' || (detalhes::text like '%Ana%')
  from public.auditoria
 where alvo = (select id::text from public.inscricoes where whatsapp = '21999990001' and evento_id = '00000000-0000-4000-8000-0000000000e0');
insert into _r (teste, esperado, obtido)
select 'token aleatório com 32 caracteres, um por inscrição', '4/4/32',
       count(*) || '/' || count(distinct token_confirmacao) || '/' || min(char_length(token_confirmacao))
  from public.inscricoes where evento_id = '00000000-0000-4000-8000-0000000000e0';
insert into _r (teste, esperado, obtido)
select 'consentimento gravado pelo servidor', '0', count(*)::text
  from public.inscricoes where evento_id = '00000000-0000-4000-8000-0000000000e0' and consentimento_dados_em is null;

set role anon;
insert into _r (teste, esperado, obtido)
select 'anon: lotado aparece como lista de espera, sem tamanhos', 'lista_espera/{}', situacao || '/' || tamanhos::text
  from public.evento_publico('teste-inscricoes');
reset role;

-- Gatilho: nem o SQL manual passa do limite
do $$ begin
  begin
    insert into public.inscricoes (evento_id, nome, whatsapp, email, empresa, cargo, doacao_tamanho)
    values ('00000000-0000-4000-8000-0000000000e0', 'Furando Fila', '21999990007', 'f@exemplo.invalid', 'E', 'C', 'G');
    insert into _r values (default, 'gravação direta não passa da capacidade', 'erro', 'gravou');
  exception when raise_exception then insert into _r values (default, 'gravação direta não passa da capacidade', 'erro', sqlerrm); end;
end $$;
update _r set obtido = 'erro' where teste = 'gravação direta não passa da capacidade' and obtido in ('sem_vaga', 'tamanho_esgotado');

-- ---------------------------------------------------------------------
-- 3) Confirmação de presença
-- ---------------------------------------------------------------------
insert into _v select 'token_d', token_confirmacao from public.inscricoes where whatsapp = '21999990004' and evento_id = '00000000-0000-4000-8000-0000000000e0';
set role service_role;
insert into _r (teste, esperado, obtido)
select 'token inválido não confirma (resposta neutra)', '{"ok": false}', public.presenca_confirmar(repeat('x', 32), 'sim')::text;
insert into _r (teste, esperado, obtido)
select 'token com formato estranho não confirma', '{"ok": false}', public.presenca_confirmar('''; drop table x; --', 'sim')::text;
insert into _r (teste, esperado, obtido)
select 'consulta pelo token: só primeiro nome, evento e fraldas', 'Davi/TESTE Encontro/["M", "M"]/aguardando',
       (r ->> 'primeiro_nome') || '/' || (r ->> 'titulo') || '/' || (r -> 'tamanhos')::text || '/' || (r ->> 'resposta')
  from (select public.presenca_consultar((select valor from _v where nome = 'token_d')) r) x;
insert into _r (teste, esperado, obtido)
select 'consulta não devolve WhatsApp, e-mail nem sobrenome', 'false', (r::text ~ '2199999|exemplo\.invalid|Teste')::text
  from (select public.presenca_consultar((select valor from _v where nome = 'token_d')) r) x;
insert into _r (teste, esperado, obtido)
select 'D responde "não vai"', 'true/nao_vai', (r ->> 'ok') || '/' || (r ->> 'resposta')
  from (select public.presenca_confirmar((select valor from _v where nome = 'token_d'), 'nao_vai') r) x;
reset role;

set role anon;
insert into _r (teste, esperado, obtido)
select '"não vai" devolve os lugares e as cotas', 'ultimas_vagas/{M}', situacao || '/' || tamanhos::text
  from public.evento_publico('teste-inscricoes');
reset role;

-- F ocupa 1 dos lugares liberados; D quer voltar com acompanhante e não cabe mais
set role service_role;
insert into _r (teste, esperado, obtido)
select 'F: entra na vaga liberada', 'inscrito', r ->> 'situacao'
  from (select public.inscricao_registrar(pg_temp.ficha('{"nome":"Fabio Teste","whatsapp":"21999990006","email":"fabio@exemplo.invalid","doacao_tamanho":"M"}')) r) x;
insert into _r (teste, esperado, obtido)
select 'D muda para "sim" sem lugar: recusado', 'false/sem_vaga', (r ->> 'ok') || '/' || (r ->> 'erro')
  from (select public.presenca_confirmar((select valor from _v where nome = 'token_d'), 'sim') r) x;
reset role;
insert into _r (teste, esperado, obtido)
select 'D continua "não vai"', 'nao_vai', confirmacao from public.inscricoes where whatsapp = '21999990004' and evento_id = '00000000-0000-4000-8000-0000000000e0';

-- Inscrições fechadas / sem lista de espera
update public.eventos set lista_espera = false where id = '00000000-0000-4000-8000-0000000000e0';
set role service_role;
insert into _r (teste, esperado, obtido)
select 'lotado sem lista de espera: encerradas', 'encerradas', r ->> 'erro'
  from (select public.inscricao_registrar(pg_temp.ficha('{"nome":"Gil Teste","whatsapp":"21999990007","acompanhante":true,"acompanhante_nome":"Gil Acomp","acompanhante_whatsapp":"21988880007","acompanhante_doacao_tamanho":"M"}')) r) x;
reset role;
update public.eventos set lista_espera = true, inscricoes_abertas = false where id = '00000000-0000-4000-8000-0000000000e0';
set role service_role;
insert into _r (teste, esperado, obtido)
select 'inscrições fechadas: encerradas', 'encerradas', r ->> 'erro'
  from (select public.inscricao_registrar(pg_temp.ficha('{"nome":"Gil Teste","whatsapp":"21999990007"}')) r) x;
reset role;
set role anon;
insert into _r (teste, esperado, obtido)
select 'anon: inscrições fechadas', 'encerradas/{}', situacao || '/' || tamanhos::text from public.evento_publico('teste-inscricoes');
reset role;
update public.eventos set inscricoes_abertas = true where id = '00000000-0000-4000-8000-0000000000e0';

-- Limite de envios (5 por janela)
set role service_role;
insert into _r (teste, esperado, obtido)
select 'limite: 5 envios passam, o 6º é barrado', 'true,true,true,true,true,false',
       string_agg(public.permitir_envio('teste-limite-0000000000000001', 'inscricao', 5, 600)::text, ',' order by g)
  from generate_series(1, 6) g;
reset role;

-- ---------------------------------------------------------------------
-- 4) Aluno e admin sem MFA não veem nada
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated","aal":"aal1"}', false);
set role authenticated;
insert into _r (teste, esperado, obtido) select 'aluno: não vê inscrições', '0', count(*)::text from public.inscricoes;
insert into _r (teste, esperado, obtido) select 'aluno: não vê eventos', '0', count(*)::text from public.eventos;
insert into _r (teste, esperado, obtido) select 'aluno: não vê a lista do painel', '0', count(*)::text from public.inscricoes_painel;
do $$ begin
  begin perform public.admin_resumo_evento('00000000-0000-4000-8000-0000000000e0');
    insert into _r values (default, 'aluno: não lê o resumo', 'erro', 'leu');
  exception when insufficient_privilege then insert into _r values (default, 'aluno: não lê o resumo', 'erro', 'erro'); end;
  begin insert into public.inscricoes (evento_id, nome, whatsapp, email, empresa, cargo)
        values ('00000000-0000-4000-8000-0000000000e0', 'Aluno Intruso', '21999990009', 'x@exemplo.invalid', 'E', 'C');
    insert into _r values (default, 'aluno: não grava inscrição', 'erro', 'gravou');
  exception when insufficient_privilege then insert into _r values (default, 'aluno: não grava inscrição', 'erro', 'erro'); end;
  begin perform public.inscricao_registrar('{}');
    insert into _r values (default, 'aluno: não chama inscricao_registrar', 'erro', 'chamou');
  exception when insufficient_privilege then insert into _r values (default, 'aluno: não chama inscricao_registrar', 'erro', 'erro'); end;
end $$;
update public.inscricoes set observacoes = 'aluno mexeu' where evento_id = '00000000-0000-4000-8000-0000000000e0';
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e2","role":"authenticated","aal":"aal1"}', false);
set role authenticated;
insert into _r (teste, esperado, obtido) select 'admin sem MFA: não vê inscrições', '0', count(*)::text from public.inscricoes;
do $$ begin
  begin perform public.admin_resumo_evento('00000000-0000-4000-8000-0000000000e0');
    insert into _r values (default, 'admin sem MFA: não lê o resumo', 'erro', 'leu');
  exception when insufficient_privilege then insert into _r values (default, 'admin sem MFA: não lê o resumo', 'erro', 'erro'); end;
end $$;
reset role;
insert into _r (teste, esperado, obtido)
select 'ninguém sem permissão conseguiu alterar', '0', count(*)::text
  from public.inscricoes where evento_id = '00000000-0000-4000-8000-0000000000e0' and observacoes is not null;

-- ---------------------------------------------------------------------
-- 5) Admin com MFA: painel
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e2","role":"authenticated","aal":"aal2"}', false);
set role authenticated;
insert into _r (teste, esperado, obtido)
select 'admin: vê as inscrições do evento', '5', count(*)::text from public.inscricoes where evento_id = '00000000-0000-4000-8000-0000000000e0';
insert into _r (teste, esperado, obtido)
select 'painel: "Possível repetido" por e-mail (Ana e Bruno), sem juntar', 'Ana Teste,Bruno Teste', string_agg(nome, ',' order by nome)
  from public.inscricoes_painel where evento_id = '00000000-0000-4000-8000-0000000000e0' and possivel_repetido;
insert into _r (teste, esperado, obtido)
select 'resumo: inscritos, pessoas, vagas, espera, não vão',  '4/3/1/1/1',
       (r ->> 'inscritos') || '/' || (r ->> 'pessoas') || '/' || (r ->> 'vagas') || '/' || (r ->> 'lista_espera') || '/' || (r ->> 'nao_vao')
  from (select public.admin_resumo_evento('00000000-0000-4000-8000-0000000000e0') r) x;
insert into _r (teste, esperado, obtido)
select 'resumo: fraldas reservadas / cota', 'P 1/1 · M 1/2 · G 1/1',
       string_agg((c ->> 'tamanho') || ' ' || (c ->> 'reservados') || '/' || (c ->> 'cota'), ' · ')
  from (select jsonb_array_elements(public.admin_resumo_evento('00000000-0000-4000-8000-0000000000e0') -> 'cotas') c) x;

-- Mover a Eva da lista de espera para inscrita (cabe: 1 lugar e 1 pacote M)
update public.inscricoes set status = 'inscrito' where whatsapp = '21999990005' and evento_id = '00000000-0000-4000-8000-0000000000e0';
insert into _r (teste, esperado, obtido)
select 'admin move da lista de espera para inscrito', 'inscrito', status from public.inscricoes where whatsapp = '21999990005' and evento_id = '00000000-0000-4000-8000-0000000000e0';
-- Agora lotado: devolver o Davi para "sim" pelo painel não passa
do $$ begin
  begin
    update public.inscricoes set confirmacao = 'sim' where whatsapp = '21999990004' and evento_id = '00000000-0000-4000-8000-0000000000e0';
    insert into _r values (default, 'painel também respeita a capacidade', 'erro', 'gravou');
  exception when raise_exception then insert into _r values (default, 'painel também respeita a capacidade', 'erro', 'erro'); end;
end $$;
-- Cancelar a Ana devolve o lugar e o pacote P
update public.inscricoes set status = 'cancelado' where whatsapp = '21999990001' and evento_id = '00000000-0000-4000-8000-0000000000e0';
insert into _r (teste, esperado, obtido)
select 'cancelar devolve lugar e cota', '1/P 0/1', (r ->> 'vagas') || '/P ' || (r -> 'cotas' -> 0 ->> 'reservados') || '/' || (r -> 'cotas' -> 0 ->> 'cota')
  from (select public.admin_resumo_evento('00000000-0000-4000-8000-0000000000e0') r) x;
-- Edição comum (nome) com o evento lotado continua possível
update public.inscricoes set nome = 'Fábio Teste', observacoes = 'chegou cedo' where whatsapp = '21999990006' and evento_id = '00000000-0000-4000-8000-0000000000e0';
insert into _r (teste, esperado, obtido)
select 'admin edita nome e observações', 'Fábio Teste/chegou cedo', nome || '/' || observacoes from public.inscricoes where whatsapp = '21999990006' and evento_id = '00000000-0000-4000-8000-0000000000e0';
-- O token não muda
insert into _v select 'token_f', token_confirmacao from public.inscricoes where whatsapp = '21999990006' and evento_id = '00000000-0000-4000-8000-0000000000e0';
update public.inscricoes set token_confirmacao = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' where whatsapp = '21999990006' and evento_id = '00000000-0000-4000-8000-0000000000e0';
insert into _r (teste, esperado, obtido)
select 'o link individual (token) nunca muda', 'true', (token_confirmacao = (select valor from _v where nome = 'token_f'))::text
  from public.inscricoes where whatsapp = '21999990006' and evento_id = '00000000-0000-4000-8000-0000000000e0';
-- Check-in do titular e do acompanhante (Bruno sem acompanhante; Davi com)
update public.inscricoes set checkin_em = now() where whatsapp in ('21999990002', '21999990004') and evento_id = '00000000-0000-4000-8000-0000000000e0';
update public.inscricoes set acompanhante_checkin_em = now() where whatsapp = '21999990004' and evento_id = '00000000-0000-4000-8000-0000000000e0';
insert into _r (teste, esperado, obtido)
select 'presentes contam titulares e acompanhantes', '3', public.admin_resumo_evento('00000000-0000-4000-8000-0000000000e0') ->> 'presentes';
update public.inscricoes set acompanhante_checkin_em = now() where whatsapp = '21999990002' and evento_id = '00000000-0000-4000-8000-0000000000e0';
insert into _r (teste, esperado, obtido)
select 'check-in de acompanhante que não existe é ignorado', 'vazio', coalesce(acompanhante_checkin_em::text, 'vazio')
  from public.inscricoes where whatsapp = '21999990002' and evento_id = '00000000-0000-4000-8000-0000000000e0';
-- Exportação e exclusão
select public.admin_registrar_exportacao('00000000-0000-4000-8000-0000000000e0', 'completo', 5);
insert into _v select 'id_c', id::text from public.inscricoes where whatsapp = '21999990002' and evento_id = '00000000-0000-4000-8000-0000000000e0';
delete from public.inscricoes where whatsapp = '21999990002' and evento_id = '00000000-0000-4000-8000-0000000000e0';
reset role;

insert into _r (teste, esperado, obtido)
select 'excluir apaga de verdade', '0', count(*)::text from public.inscricoes where whatsapp = '21999990002' and evento_id = '00000000-0000-4000-8000-0000000000e0';
insert into _r (teste, esperado, obtido)
select 'auditoria da exclusão sem os dados apagados', '1/false',
       count(*) || '/' || bool_or(detalhes::text ~ 'Bruno|exemplo\.invalid|2199999')
  from public.auditoria where acao = 'excluir_inscricao' and alvo = (select valor from _v where nome = 'id_c');
insert into _r (teste, esperado, obtido)
select 'auditoria do painel: alterar (só nomes de campos), exportar e excluir', 'alterar_inscricao,excluir_inscricao,exportar_inscricoes',
       string_agg(distinct acao, ',' order by acao)
  from public.auditoria where quem = '00000000-0000-4000-8000-0000000000e2';
insert into _r (teste, esperado, obtido)
select 'auditoria de alteração não guarda valores', 'false', coalesce(bool_or(detalhes::text ~ 'Fábio|chegou cedo'), false)::text
  from public.auditoria where quem = '00000000-0000-4000-8000-0000000000e2' and acao = 'alterar_inscricao';

-- Nome igual com outro WhatsApp e outro e-mail também gera o aviso (sem juntar)
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e2","role":"authenticated","aal":"aal2"}', false);
set role authenticated;
insert into public.inscricoes (evento_id, nome, whatsapp, email, empresa, cargo, status, doacao_tamanho)
values ('00000000-0000-4000-8000-0000000000e0', 'DAVI  teste', '21999990010', 'outro@exemplo.invalid', 'E', 'C', 'lista_espera', 'G');
insert into _r (teste, esperado, obtido)
select 'painel: "Possível repetido" também por nome igual', 'DAVI teste,Davi Teste', string_agg(nome, ',' order by nome)
  from public.inscricoes_painel where evento_id = '00000000-0000-4000-8000-0000000000e0' and possivel_repetido;
reset role;

-- ---------------------------------------------------------------------
-- 6) Permissões das funções (conferência direta)
-- ---------------------------------------------------------------------
insert into _r (teste, esperado, obtido)
select 'anon/aluno sem EXECUTE nas funções do servidor', 'false',
       bool_or(has_function_privilege(r, f, 'EXECUTE'))::text
  from unnest(array['anon', 'authenticated']) r,
       unnest(array['public.inscricao_registrar(jsonb)', 'public.presenca_consultar(text)', 'public.presenca_confirmar(text,text)',
                    'public.permitir_envio(text,text,integer,integer)', 'privado.gravar_inscricao(jsonb,text,boolean)']) f;
insert into _r (teste, esperado, obtido)
select 'anon sem EXECUTE nas funções do painel', 'false',
       bool_or(has_function_privilege('anon', f, 'EXECUTE'))::text
  from unnest(array['public.admin_resumo_evento(uuid)', 'public.admin_registrar_exportacao(uuid,text,integer)',
                    'public.admin_importar_inscricao(uuid,jsonb)', 'privado.vagas_restantes(uuid)']) f;
insert into _r (teste, esperado, obtido)
select 'RLS ligado nas 3 tabelas', 'true', bool_and(relrowsecurity)::text
  from pg_class where oid in ('public.eventos'::regclass, 'public.cotas_doacao'::regclass, 'public.inscricoes'::regclass);
insert into _r (teste, esperado, obtido)
select 'nenhuma política para anon', '0', count(*)::text
  from pg_policies where schemaname = 'public' and tablename in ('eventos', 'cotas_doacao', 'inscricoes')
   and ('anon' = any (roles) or 'public' = any (roles));

-- ---------------------------------------------------------------------
-- Limpeza e resultado
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{}', false);
delete from public.auditoria where alvo in (select id::text from public.inscricoes where evento_id = '00000000-0000-4000-8000-0000000000e0')
                                 or alvo = '00000000-0000-4000-8000-0000000000e0'
                                 or alvo = (select valor from _v where nome = 'id_c')
                                 or quem = '00000000-0000-4000-8000-0000000000e2';
delete from public.inscricoes where evento_id = '00000000-0000-4000-8000-0000000000e0';
delete from public.eventos where id = '00000000-0000-4000-8000-0000000000e0';
delete from public.auditoria where alvo = '00000000-0000-4000-8000-0000000000e0';
delete from privado.limites_envio where chave = 'teste-limite-0000000000000001';
delete from public.auditoria where alvo in ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000e2');
delete from auth.users where email like 'teste-insc-%@exemplo.invalid';

select teste, esperado, obtido, (esperado = obtido) as ok
  from _r
 order by quando;
