-- =====================================================================
-- Dados de EXEMPLO da Área do Aluno (opcional)
-- Rodar no SQL Editor depois das migrations 0001–0003, só para ver as telas
-- com conteúdo. Todos os registros têm IDs fixos terminados em "e…"; o bloco
-- no fim do arquivo (comentado) apaga tudo.
--
-- - O vídeo de exemplo usa um ID público do Vimeo; troque pelo vídeo real.
-- - O PDF de exemplo só baixa depois que um arquivo for enviado para
--   materiais/encontro-1/roteiro-encontro-1.pdf (pelo painel admin, Fase 3).
-- =====================================================================

insert into public.modulos (id, titulo, subtitulo, descricao, ordem, publicado, liberado_em) values
  ('00000000-0000-4000-8000-0000000000e1', 'Encontro 1 · Aula inaugural',
   'O que nos torna humanos na era da inteligência artificial',
   'O primeiro encontro da Academia de Virtudes: a proposta, o método e as virtudes que vamos cultivar ao longo da jornada.',
   1, true, null),
  ('00000000-0000-4000-8000-0000000000e2', 'Encontro 2 · Essência Humana',
   'Sexta-feira, 20 de novembro de 2026, às 9h',
   'A gravação e os materiais do Encontro 2 ficam disponíveis aqui depois do encontro.',
   2, true, '2026-11-21 09:00:00-03')
on conflict (id) do nothing;

insert into public.conteudos (id, modulo_id, titulo, tipo, descricao, provedor, video_id, duracao_min, arquivo_path, arquivo_nome, texto, ordem, publicado) values
  ('00000000-0000-4000-8000-0000000000e3', '00000000-0000-4000-8000-0000000000e1',
   'Gravação do encontro', 'video', 'A aula inaugural completa.',
   'vimeo', '76979871', 62, 'encontro-1/roteiro-encontro-1.pdf', 'Roteiro do Encontro 1 (PDF)',
   E'## Para refletir\n\nAntes do próximo encontro, anote:\n\n- uma virtude que você já pratica no trabalho;\n- uma virtude que quer **desenvolver**;\n- uma situação recente em que a tecnologia ajudou *ou atrapalhou* uma conversa importante.\n\nLeia também a [página da Academia](https://gpmintegracao.com.br/academiadevirtudes/).',
   1, true),
  ('00000000-0000-4000-8000-0000000000e4', '00000000-0000-4000-8000-0000000000e1',
   'Exercício: mapa de virtudes', 'texto', 'Um exercício curto para fazer em 15 minutos.',
   null, null, 15, null, null,
   E'## Mapa de virtudes\n\n1. Liste cinco decisões que você tomou nesta semana.\n2. Para cada uma, escreva qual virtude esteve presente.\n3. Marque a que mais faltou.\n\n> A prática vem antes da teoria.',
   2, true),
  ('00000000-0000-4000-8000-0000000000e5', '00000000-0000-4000-8000-0000000000e1',
   'Rascunho que o aluno não vê', 'texto', 'Conteúdo em rascunho (teste da RLS).',
   null, null, null, null, null, 'Este texto não deve aparecer para alunos.', 3, false),
  ('00000000-0000-4000-8000-0000000000e6', '00000000-0000-4000-8000-0000000000e2',
   'Gravação do Encontro 2', 'video', 'Disponível depois do encontro.',
   'vimeo', '76979871', 90, null, null, null, 1, true)
on conflict (id) do nothing;

insert into public.avisos (id, titulo, texto, publicado) values
  ('00000000-0000-4000-8000-0000000000e7', 'Encontro 2 na sexta, 20/11, às 9h',
   'Centro Empresarial Office Tower, Barra da Tijuca. Chegue 15 minutos antes para o credenciamento.', true)
on conflict (id) do nothing;

-- Para apagar os dados de exemplo:
-- delete from public.avisos  where id = '00000000-0000-4000-8000-0000000000e7';
-- delete from public.modulos where id in ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-0000000000e2');
