/*
  Academia de Virtudes · página pública v2 · TEXTOS E DADOS EDITÁVEIS
  Edite só este arquivo para mudar data, local, encontro atual, formulário, depoimentos e fotos.
  Depois de editar, aumente o ?v= deste arquivo em academiadevirtudes/index.html.
*/
window.AV_CONFIG = {
  // Encontro atual (referência). A Jornada agora é uma linha do tempo no index.html, com as capas em assets/academia/capa-encontro-N-*.
  ENCONTRO_ATUAL: 3,

  // Card-resumo e formulário do próximo encontro.
  PROXIMO: {
    titulo: "Encontro 3 · Potencial Artificial",
    data: "Sexta-feira, 11 de dezembro de 2026, das 9h às 17h",
    local: "Centro Empresarial Office Tower · Av. Evandro Lins e Silva, 840 · Rio de Janeiro",
    formato: "Presencial",
    entrada: "Gratuita, mediante doação"
  },

  // Envio do formulário em etapas:
  //   "supabase"  = padrão: Edge Function "inscricao" (vagas, lista de espera, cotas de fralda e e-mail de confirmação)
  //   "formspree" = plano B, se algo der errado no dia: troque aqui e publique.
  FORM_BACKEND: "supabase",
  // Evento no banco (tabela eventos, aba Inscrições do painel).
  EVENTO: "encontro-3",
  // Plano B (Formspree). Só é usado com FORM_BACKEND = "formspree".
  FORMULARIO: "https://formspree.io/f/xoedlyqp",
  ASSUNTO: "Inscrição · Academia de Virtudes · Encontro 3",
  ORIGEM: "site-academia-v2",

  // A doação (fraldas, marca e tamanhos) agora fica no evento, no painel (aba Inscrições).

  // Depoimentos em vídeo (YouTube "não listado"). Enquanto estiver vazio, a seção fica escondida.
  // Exemplo de item: { youtube: "ID_DE_11_CARACTERES", nome: "Nome da pessoa", cargo: "Cargo · Empresa" }
  DEPOIMENTOS: [],

  // Fotos da galeria "A experiência". A primeira abre expandida.
  // base: nome do arquivo em /assets/academia/galeria/ (ou caminho começando com "/"), sem extensão.
  // Cada foto precisa de: base.jpg, base-800.webp e base-1600.webp. w e h: tamanho da -1600.webp.
  GALERIA: [
    { base: "encontro2-01", w: 900,  h: 1600, legenda: "Encontro 2 · Essência Humana · 20/11/2026", alt: "Eduardo Pitombo Mesquita fala ao público diante do slide 'Empreender é a arte de resolver problemas'" },
    { base: "encontro2-02", w: 1600, h: 900,  legenda: "Encontro 2 · Essência Humana · 20/11/2026", alt: "Eduardo no palco do Encontro 2, com a plateia em primeiro plano" },
    { base: "encontro2-03", w: 1200, h: 1600, legenda: "Encontro 2 · Essência Humana · 20/11/2026", alt: "Plateia acompanha a palestra no auditório com luz azul" },
    { base: "encontro2-04", w: 960,  h: 1280, legenda: "Encontro 2 · Essência Humana · 20/11/2026", alt: "Apresentação do Instituto Pró-Vida no palco, com câmera registrando o encontro" },
    { base: "encontro2-05", w: 1600, h: 900,  legenda: "Encontro 2 · Essência Humana · 20/11/2026", alt: "Eduardo com representantes do Instituto Pró-Vida no palco" },
    { base: "encontro2-06", w: 1066, h: 1600, legenda: "Encontro 2 · Essência Humana · 20/11/2026", alt: "Participantes posam juntas no Encontro 2" },
    { base: "encontro2-07", w: 1200, h: 1600, legenda: "Encontro 2 · Essência Humana · 20/11/2026", alt: "Participantes posam juntos no Encontro 2" }
  ]
};
