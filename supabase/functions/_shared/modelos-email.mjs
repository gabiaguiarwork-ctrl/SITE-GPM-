// =====================================================================
// Academia de Virtudes · MODELOS DO E-MAIL DE CONFIRMAÇÃO DA INSCRIÇÃO
//
// Para mudar os textos: edite TEXTOS abaixo (o padrão vale para todos os
// encontros; um encontro pode ter textos próprios, pelo slug, em POR_EVENTO).
// Depois, publique de novo a função: supabase functions deploy inscricao
// (e reenviar-confirmacao). Este arquivo é JavaScript puro: o Deno (Edge
// Function) e o Node (prévia local) usam o mesmo arquivo.
//
// Regras: sem link para cadastro, login ou Área do Aluno; sem dados de
// outras pessoas; todo dado da inscrição passa por esc() no HTML.
// =====================================================================

export const TEXTOS = {
  assunto_inscrito: 'Inscrição confirmada · Academia de Virtudes · {titulo}',
  assunto_espera: 'Você está na lista de espera · {titulo}',
  aviso_whatsapp: 'Alguns dias antes do encontro, você vai receber pelo WhatsApp um link para confirmar sua presença.',
  espera: 'Recebemos sua inscrição na lista de espera do {titulo}. Se abrir uma vaga, avisamos pelo WhatsApp.',
  despedida: 'Até lá,',
  assinatura: 'Equipe do Grupo GPM',
  duracao_horas: 4, // .ics: só quando o evento não tem término (data_fim) no painel
};

// Textos próprios por encontro (opcional). Ex.: { 'encontro-3': { duracao_horas: 3 } }
export const POR_EVENTO = {};

export function textosDo(slug) {
  return Object.assign({}, TEXTOS, POR_EVENTO[slug] || {});
}

const FUSO = 'America/Sao_Paulo';

export function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function trocar(t, mapa) {
  return String(t).replace(/\{(\w+)\}/g, (m, k) => (k in mapa ? mapa[k] : m));
}

// "9h" · "9h30" (horário de Brasília)
export function hora(iso) {
  const p = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const h = Number(p.find((x) => x.type === 'hour').value);
  const m = p.find((x) => x.type === 'minute').value;
  return h + 'h' + (m !== '00' ? m : '');
}
function diaDe(iso) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
}

// "sexta-feira, 11 de dezembro de 2026, das 9h às 17h" (sem término: "…, às 9h")
export function dataPorExtenso(inicio, fim) {
  const dia = diaDe(inicio);
  if (!fim) return dia + ', às ' + hora(inicio);
  if (diaDe(fim) === dia) return dia + ', das ' + hora(inicio) + ' às ' + hora(fim);
  return dia + ', às ' + hora(inicio) + ', até ' + diaDe(fim) + ', às ' + hora(fim);
}

// "1 pacote de fraldas Pampers ou Huggies, tamanho M" · "2 pacotes ..., tamanhos M e G"
export function doacaoTexto(tamanhos, marca) {
  const n = tamanhos.length;
  const lista = n === 2 ? (tamanhos[0] === tamanhos[1] ? tamanhos[0] : tamanhos[0] + ' e ' + tamanhos[1]) : tamanhos[0];
  return {
    qtd: n === 1 ? '1 pacote' : n + ' pacotes',
    marca: marca,
    tamanhos: (n === 2 && tamanhos[0] !== tamanhos[1] ? 'tamanhos ' : 'tamanho ') + lista,
    destino: n === 1 ? 'destinado ao Instituto Pró-Vida' : 'destinados ao Instituto Pró-Vida',
  };
}

// Arquivo de agenda (RFC 5545), com fim de linha CRLF.
export function ics(d) {
  const t = textosDo(d.evento.slug);
  const ini = new Date(d.evento.data_inicio);
  const fim = d.evento.data_fim ? new Date(d.evento.data_fim) : new Date(ini.getTime() + t.duracao_horas * 3600_000);
  const z = (x) => x.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const e = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const linhas = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Grupo GPM//Academia de Virtudes//PT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:' + d.id + '@gpmintegracao.com.br',
    'DTSTAMP:' + z(new Date()),
    'DTSTART:' + z(ini),
    'DTEND:' + z(fim),
    'SUMMARY:' + e('Academia de Virtudes · ' + d.evento.titulo),
    'LOCATION:' + e(d.evento.local || ''),
    'DESCRIPTION:' + e('Academia de Virtudes · Grupo GPM'),
    'END:VEVENT', 'END:VCALENDAR',
  ];
  // Dobra linhas longas (75 caracteres) como pede a norma.
  return linhas.map((l) => {
    const partes = [];
    for (let i = 0; i < l.length; i += 73) partes.push((i ? ' ' : '') + l.slice(i, i + 73));
    return partes.join('\r\n');
  }).join('\r\n') + '\r\n';
}

// d = retorno de email_confirmacao_reservar (migration 0010)
export function montarEmail(d) {
  const t = textosDo(d.evento.slug);
  const espera = d.situacao === 'lista_espera';
  const titulo = d.evento.titulo;
  const assunto = trocar(espera ? t.assunto_espera : t.assunto_inscrito, { titulo });
  const quando = dataPorExtenso(d.evento.data_inicio, d.evento.data_fim);
  const local = d.evento.local || 'a confirmar';
  const doacao = !espera && d.tamanhos && d.tamanhos.length ? doacaoTexto(d.tamanhos, d.evento.doacao_marca) : null;

  // ---------- Texto simples ----------
  const txt = ['Olá, ' + d.primeiro_nome + '.', ''];
  if (espera) {
    txt.push(trocar(t.espera, { titulo }), '');
  } else {
    txt.push('Sua inscrição no ' + titulo + ' está confirmada.', '',
      'Data: ' + quando, 'Local: ' + local);
    if (d.acompanhante_nome) txt.push('Acompanhante: ' + d.acompanhante_nome);
    txt.push('');
    if (doacao) txt.push('Sua doação: ' + doacao.qtd + ' de fraldas ' + doacao.marca + ', ' + doacao.tamanhos + ', ' + doacao.destino + '.', '');
    txt.push(t.aviso_whatsapp, '');
  }
  txt.push(t.despedida, t.assinatura);
  const texto = txt.join('\n');

  // ---------- HTML (tabelas e estilos em linha: é o que os leitores de e-mail aceitam) ----------
  const linha = (rotulo, valor) =>
    '<tr><td style="padding:6px 0;color:#8a6d2f;font:600 12px/1.4 Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;width:120px;vertical-align:top">' + esc(rotulo) +
    '</td><td style="padding:6px 0;color:#14203B;font:400 16px/1.5 Arial,sans-serif">' + esc(valor) + '</td></tr>';
  let corpo = '<p style="margin:0 0 16px;font:400 17px/1.6 Arial,sans-serif;color:#14203B">Olá, ' + esc(d.primeiro_nome) + '.</p>';
  if (espera) {
    corpo += '<p style="margin:0 0 20px;font:400 17px/1.6 Arial,sans-serif;color:#14203B">' + esc(trocar(t.espera, { titulo })) + '</p>';
  } else {
    corpo += '<p style="margin:0 0 20px;font:400 17px/1.6 Arial,sans-serif;color:#14203B">Sua inscrição no <strong>' + esc(titulo) + '</strong> está confirmada.</p>' +
      '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid #e5dcc8;border-bottom:1px solid #e5dcc8;margin:0 0 20px;padding:8px 0">' +
      linha('Data', quando) + linha('Local', local) + (d.acompanhante_nome ? linha('Acompanhante', d.acompanhante_nome) : '') + '</table>';
    if (doacao) {
      corpo += '<p style="margin:0 0 20px;padding:16px 18px;background:#FAF6EE;border-left:3px solid #C9A45C;font:400 16px/1.6 Arial,sans-serif;color:#14203B">' +
        '<strong>Sua doação:</strong> ' + esc(doacao.qtd) + ' de fraldas <strong>' + esc(doacao.marca) + '</strong>, <strong>' + esc(doacao.tamanhos) + '</strong>, ' + esc(doacao.destino) + '.</p>';
    }
    corpo += '<p style="margin:0 0 20px;font:400 16px/1.6 Arial,sans-serif;color:#14203B">' + esc(t.aviso_whatsapp) + '</p>';
  }
  corpo += '<p style="margin:0;font:400 16px/1.6 Arial,sans-serif;color:#14203B">' + esc(t.despedida) + '<br>' + esc(t.assinatura) + '</p>';

  const html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="color-scheme" content="light"><title>' + esc(assunto) + '</title></head>' +
    '<body style="margin:0;padding:0;background:#F4EEE2">' +
    '<div style="display:none;max-height:0;overflow:hidden">' + esc(espera ? 'Você está na lista de espera.' : 'Sua inscrição está confirmada.') + '</div>' +
    '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#F4EEE2"><tr><td align="center" style="padding:24px 12px">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border-radius:8px;overflow:hidden">' +
    '<tr><td style="background:#08142E;padding:26px 28px">' +
    '<p style="margin:0;color:#E2C88E;font:italic 500 22px/1.2 Georgia,\'Times New Roman\',serif">Academia de Virtudes</p>' +
    '<p style="margin:6px 0 0;color:#C9A45C;font:600 11px/1.4 Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase">Grupo GPM</p></td></tr>' +
    '<tr><td style="padding:28px 28px 32px">' + corpo + '</td></tr>' +
    '<tr><td style="padding:16px 28px;background:#FAF6EE;color:#5a6378;font:400 12px/1.5 Arial,sans-serif">' +
    'Você recebeu este e-mail porque se inscreveu em um encontro da Academia de Virtudes. Para falar com a equipe, é só responder.</td></tr>' +
    '</table></td></tr></table></body></html>';

  const anexos = espera ? [] : [{ filename: 'academia-de-virtudes.ics', conteudo: ics(d), tipo: 'text/calendar' }];
  return { assunto, texto, html, anexos };
}
