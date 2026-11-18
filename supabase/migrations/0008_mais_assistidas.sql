-- =====================================================================
-- Área do Aluno · Academia de Virtudes
-- 0008 · "Mais assistidas pelos alunos" (vitrine no estilo COR, 18/11/2026)
--
-- Rodar no SQL Editor DEPOIS da 0007. Idempotente.
--
-- O aluno só lê o próprio progresso (RLS). Para montar a fileira
-- "Mais assistidas pelos alunos", esta função conta, por aula, quantos alunos
-- já abriram a aula, e devolve SÓ a lista de aulas em ordem (sem números,
-- sem nomes, sem nenhum dado de outro aluno).
-- - Só aulas publicadas e liberadas.
-- - Só para quem pode ver conteúdo (ativo + cadastro completo) ou admin com MFA.
-- - No máximo 20 aulas.
-- =====================================================================

create or replace function privado.aulas_mais_vistas(limite integer default 10)
returns table (conteudo_id uuid, posicao integer)
language sql stable security definer set search_path = ''
as $$
  select r.conteudo_id, (row_number() over (order by r.alunos desc, r.ordem, r.titulo))::integer
    from (
      select c.id as conteudo_id, c.ordem, c.titulo, count(distinct p.aluno_id) as alunos
        from public.progresso p
        join public.conteudos c on c.id = p.conteudo_id
       where ((select privado.pode_ver_conteudo()) or (select privado.is_admin()))
         and c.publicado
         and (c.liberado_em is null or c.liberado_em <= now())
       group by c.id, c.ordem, c.titulo
    ) r
   order by 2
   limit least(greatest(coalesce(limite, 10), 1), 20);
$$;

-- Porta de entrada pela API (o mesmo padrão de public.admin_uso_storage).
create or replace function public.aulas_mais_vistas(limite integer default 10)
returns table (conteudo_id uuid, posicao integer)
language sql stable security invoker set search_path = ''
as $$ select * from privado.aulas_mais_vistas(limite); $$;

revoke execute on function privado.aulas_mais_vistas(integer) from public, anon;
grant  execute on function privado.aulas_mais_vistas(integer) to authenticated, service_role;
revoke execute on function public.aulas_mais_vistas(integer)  from public, anon;
grant  execute on function public.aulas_mais_vistas(integer)  to authenticated, service_role;

comment on function public.aulas_mais_vistas(integer) is
  'Aulas visíveis mais abertas pelos alunos, em ordem (só o id e a posição). Usada na vitrine.';

-- Conferência (como aluno logado, no site, a fileira aparece sozinha):
-- select * from public.aulas_mais_vistas(10);
