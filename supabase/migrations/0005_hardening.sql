-- 0005_hardening.sql · Endurecimento de funções criadas pelo próprio Supabase
--
-- public.rls_auto_enable(): criada pelo Supabase quando a opção "RLS automático"
-- é ligada no painel (liga o RLS em toda tabela nova do schema public).
-- O Security Advisor acusava que anon e authenticated podiam executá-la pela API.
-- Ela só precisa rodar pelo gatilho de evento do banco, não por chamada de usuário,
-- então tiramos o EXECUTE de public, anon e authenticated.
--
-- Idempotente: REVOKE repetido não dá erro, e o bloco só age se a função existir
-- (num projeto sem a opção "RLS automático" o arquivo roda sem fazer nada).
-- Já aplicado no projeto pela equipe GPM em 11/2026; este arquivo registra a mudança.

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  else
    raise notice 'public.rls_auto_enable() não existe neste banco; nada a fazer.';
  end if;
end $$;

-- Conferência (deve voltar false nas duas colunas, ou nenhuma linha se a função não existir):
-- select has_function_privilege('anon', 'public.rls_auto_enable()', 'EXECUTE') as anon,
--        has_function_privilege('authenticated', 'public.rls_auto_enable()', 'EXECUTE') as authenticated
--  where to_regprocedure('public.rls_auto_enable()') is not null;
