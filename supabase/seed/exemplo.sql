-- =====================================================================
-- Dados de EXEMPLO da Área do Aluno (opcional)
-- Rodar no SQL Editor depois de todas as migrations (até a 0007), só para ver
-- a vitrine cheia. Todos os registros têm IDs fixos que começam com
-- "00000000-0000-4000-8000-000000ee00"; o bloco no fim do arquivo apaga tudo.
--
-- - Os vídeos são EXEMPLOS: filmes abertos da Blender Foundation no YouTube
--   (Big Buck Bunny, Sintel, Tears of Steel, Cosmos Laundromat). Troque pelos
--   vídeos "Não listados" da GPM pelo painel (Aulas → Editar → Link do YouTube).
-- - Os PDFs são fictícios: só abrem depois que um arquivo for enviado pelo
--   painel (Aulas → Editar → trocar o PDF). Até lá, o aluno vê o card, mas
--   "Abrir"/"Baixar" mostram erro.
-- =====================================================================

-- Trilhas
insert into public.modulos (id, titulo, descricao, ordem) values
  ('00000000-0000-4000-8000-000000ee0001', 'Os 4 perfis diante da IA',
   'Como cada perfil de liderança reage à inteligência artificial, e o que cultivar em cada um.', 10),
  ('00000000-0000-4000-8000-000000ee0002', 'Essência Humana',
   'O que nos torna humanos no trabalho, e por que isso importa mais agora.', 20)
on conflict (id) do nothing;

-- Aulas: 4 videoaulas (YouTube, EXEMPLO) e 2 materiais em PDF (fictícios)
insert into public.conteudos (id, modulo_id, titulo, tipo, descricao, provedor, video_id, duracao_min, arquivo_path, arquivo_nome, arquivo_tamanho, ordem, publicado, destaque) values
  ('00000000-0000-4000-8000-000000ee0011', '00000000-0000-4000-8000-000000ee0001',
   'Aula 1 · Os 4 perfis (EXEMPLO)', 'video', 'Uma visão geral dos quatro perfis e de como cada um se relaciona com a tecnologia.',
   'youtube', 'aqz-KE-bpKQ', 10, null, null, null, 10, true, true),
  ('00000000-0000-4000-8000-000000ee0012', '00000000-0000-4000-8000-000000ee0001',
   'Aula 2 · O perfil analítico (EXEMPLO)', 'video', 'Dados, método e o risco de terceirizar o julgamento.',
   'youtube', 'eRsGyueVLvQ', 15, null, null, null, 20, true, false),
  ('00000000-0000-4000-8000-000000ee0013', '00000000-0000-4000-8000-000000ee0002',
   'Aula 3 · Prudência e decisão (EXEMPLO)', 'video', 'A virtude da prudência em decisões apoiadas por IA.',
   'youtube', 'R6MlUcmOul8', 12, null, null, null, 30, true, false),
  ('00000000-0000-4000-8000-000000ee0014', null,
   'Conversa aberta com a turma (EXEMPLO)', 'video', 'Perguntas e respostas sem trilha específica.',
   'youtube', 'Y-rmzh0PI3c', 12, null, null, null, 40, true, false),
  ('00000000-0000-4000-8000-000000ee0015', '00000000-0000-4000-8000-000000ee0001',
   'Guia dos 4 perfis (EXEMPLO)', 'pdf', 'Resumo para imprimir e consultar.',
   null, null, null, 'exemplo/guia-dos-4-perfis.pdf', 'Guia dos 4 perfis', 2411724, 50, true, false),
  ('00000000-0000-4000-8000-000000ee0016', null,
   'Caderno de exercícios (EXEMPLO)', 'pdf', 'Exercícios para fazer entre as aulas.',
   null, null, null, 'exemplo/caderno-de-exercicios.pdf', 'Caderno de exercícios', 845000, 60, true, false)
on conflict (id) do nothing;

-- PDF de apoio da Aula 1 (fictício)
insert into public.anexos (id, conteudo_id, nome, arquivo_path, tamanho, ordem) values
  ('00000000-0000-4000-8000-000000ee0021', '00000000-0000-4000-8000-000000ee0011',
   'Slides da Aula 1', 'exemplo/slides-aula-1.pdf', 1520000, 10)
on conflict (id) do nothing;

insert into public.avisos (id, titulo, texto, publicado) values
  ('00000000-0000-4000-8000-000000ee0031', 'Novas aulas toda semana (EXEMPLO)',
   'As próximas aulas da trilha Essência Humana entram na sexta-feira.', true)
on conflict (id) do nothing;

-- Para apagar os dados de exemplo (as aulas apagam junto os PDFs de apoio e o progresso):
-- delete from public.conteudos where id::text like '00000000-0000-4000-8000-000000ee00%';
-- delete from public.modulos   where id::text like '00000000-0000-4000-8000-000000ee00%';
-- delete from public.avisos    where id::text like '00000000-0000-4000-8000-000000ee00%';
--
-- Dados de exemplo da versão anterior deste arquivo (se ainda estiverem no banco):
-- delete from public.conteudos where id::text like '00000000-0000-4000-8000-0000000000e%';
-- delete from public.modulos   where id::text like '00000000-0000-4000-8000-0000000000e%';
-- delete from public.avisos    where id = '00000000-0000-4000-8000-0000000000e7';
