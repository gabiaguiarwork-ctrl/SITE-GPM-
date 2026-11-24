-- =====================================================================
-- Teste da migration 0011 (término do evento, data_fim) · rodar DEPOIS da 0011.
-- Cria um evento e uma inscrição de teste, confere e APAGA tudo no fim.
-- Resultado: todas as linhas com ok = true.
-- =====================================================================
reset role;
select set_config('request.jwt.claims', '{}', false);
delete from public.auditoria where alvo in (select id::text from public.inscricoes where evento_id = '00000000-0000-4000-8000-0000000000d0')
                                 or alvo = '00000000-0000-4000-8000-0000000000d0';
delete from public.inscricoes where evento_id = '00000000-0000-4000-8000-0000000000d0';
delete from public.eventos where id = '00000000-0000-4000-8000-0000000000d0';

drop table if exists pg_temp._r;
create temp table _r (quando timestamptz not null default clock_timestamp(), teste text, esperado text, obtido text);
grant all on _r to service_role;

insert into _r (teste, esperado, obtido)
select 'Encontro 3: das 9h às 17h (Brasília)', '09:00/17:00',
       to_char(data_inicio at time zone 'America/Sao_Paulo', 'HH24:MI') || '/' || to_char(data_fim at time zone 'America/Sao_Paulo', 'HH24:MI')
  from public.eventos where slug = 'encontro-3';

insert into public.eventos (id, slug, titulo, data_inicio, data_fim, local, capacidade, reservados, inscricoes_abertas)
values ('00000000-0000-4000-8000-0000000000d0', 'teste-termino', 'TESTE Término', now() + interval '5 days', now() + interval '5 days 8 hours', 'Auditório', 10, 0, true);

do $$ begin
  begin
    update public.eventos set data_fim = data_inicio - interval '1 hour' where id = '00000000-0000-4000-8000-0000000000d0';
    insert into _r values (default, 'término antes do início é recusado', 'erro', 'gravou');
  exception when check_violation then insert into _r values (default, 'término antes do início é recusado', 'erro', 'erro'); end;
end $$;

set role service_role;
create temp table if not exists _ins as
select public.inscricao_registrar(jsonb_build_object('evento', 'teste-termino', 'nome', 'Teo Teste', 'whatsapp', '21944440001',
       'email', 'teo@exemplo.invalid', 'empresa', 'E', 'cargo', 'C', 'consentimento', true)) r;
insert into _r (teste, esperado, obtido)
select 'e-mail recebe data_fim', 'true',
       ((public.email_confirmacao_reservar((select (r ->> 'id')::uuid from _ins), true) -> 'evento' ->> 'data_fim') is not null)::text;
insert into _r (teste, esperado, obtido)
select 'página de presença recebe data_fim', 'true',
       ((public.presenca_consultar((select token_confirmacao from public.inscricoes where whatsapp = '21944440001'
                                     and evento_id = '00000000-0000-4000-8000-0000000000d0')) ->> 'data_fim') is not null)::text;
reset role;

update public.eventos set data_fim = null where id = '00000000-0000-4000-8000-0000000000d0';
insert into _r (teste, esperado, obtido)
select 'sem término, a página recebe data_fim vazio', 'true',
       ((public.presenca_consultar((select token_confirmacao from public.inscricoes where whatsapp = '21944440001'
                                     and evento_id = '00000000-0000-4000-8000-0000000000d0')) -> 'data_fim') = 'null'::jsonb)::text;

-- Limpeza e resultado
drop table if exists _ins;
delete from public.auditoria where alvo in (select id::text from public.inscricoes where evento_id = '00000000-0000-4000-8000-0000000000d0')
                                 or alvo = '00000000-0000-4000-8000-0000000000d0'
                                 or (acao = 'inscricao_reenviada' and detalhes ->> 'evento' = '00000000-0000-4000-8000-0000000000d0');
delete from public.inscricoes where evento_id = '00000000-0000-4000-8000-0000000000d0';
delete from public.eventos where id = '00000000-0000-4000-8000-0000000000d0';

select teste, esperado, obtido, (esperado = obtido) as ok from _r order by quando;
