/*
  Academia de Virtudes · página pública v2 · TEXTOS E DADOS EDITÁVEIS
  Edite só este arquivo para mudar data, local, encontro atual, formulário, depoimentos e fotos.
  Depois de editar, aumente o ?v= deste arquivo em academiadevirtudes/index.html.
*/
window.AV_CONFIG = {
  // Encontro que aparece aberto na Jornada e no formulário (1, 2 ou 3).
  ENCONTRO_ATUAL: 3,

  // Card-resumo e formulário do próximo encontro.
  PROXIMO: {
    titulo: "Encontro 3 · Potencial Artificial",
    data: "Sexta-feira, 11 de dezembro de 2026",
    local: "Rio de Janeiro · local em breve",          // [CONFIRMAR]
    formato: "Presencial",
    entrada: "Gratuita, mediante doação"
  },

  // Formspree do formulário em etapas. [CONFIRMAR] Hoje usa o mesmo das inscrições do Encontro 2
  // (conta nova). Se criar um formulário só para o Encontro 3, troque o código aqui.
  FORMULARIO: "https://formspree.io/f/xoedlyqp",
  ASSUNTO: "Inscrição · Academia de Virtudes · Encontro 3",
  ORIGEM: "site-academia-v2",

  // Itens da doação (Rede Colaborativa Pró-Vida). [CONFIRMAR para o Encontro 3]
  DOACOES: ["Fraldas", "Lenços umedecidos", "Roupas de bebê"],

  // Depoimentos em vídeo (YouTube "não listado"). Enquanto estiver vazio, a seção fica escondida.
  // Exemplo de item: { youtube: "ID_DE_11_CARACTERES", nome: "Nome da pessoa", cargo: "Cargo · Empresa" }
  DEPOIMENTOS: [],

  // Fotos da galeria "A experiência" (largura 800 e 1600 em WebP).
  GALERIA: [
    { src: "/assets/academia-encontro1-1-800.webp", grande: "/assets/academia-encontro1-1-1600.webp", alt: "Eduardo Pitombo Mesquita diante do slide “O problema é a sua percepção.”" },
    { src: "/assets/academia-encontro1-2-800.webp", grande: "/assets/academia-encontro1-2-1600.webp", alt: "Eduardo apresenta o slide “As cinco zonas” para os participantes no auditório" },
    { src: "/assets/academia-encontro1-3-800.webp", grande: "/assets/academia-encontro1-3-1600.webp", alt: "Eduardo aponta o mapa das cinco zonas na tela" },
    { src: "/assets/academia-encontro1-4-800.webp", grande: "/assets/academia-encontro1-4-1600.webp", alt: "Eduardo no palco do auditório durante o Encontro 1" }
  ]
};
