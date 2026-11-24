/*
  Painel · aba Inscrições (encontros presenciais da Academia)
  - Eventos: criar e editar (lugares, inscrições abertas, lista de espera, cotas de fralda, mensagem do WhatsApp).
  - Lista de inscrições com busca, filtros, edição, lista de espera, cancelar e excluir.
  - Pedido de confirmação pelo WhatsApp (link individual de presença) e reenvio do e-mail de confirmação.
  - Modo check-in (celular), exportação e importação de CSV.
  Tudo passa pela RLS (só admin com MFA) e pelos gatilhos do banco (vagas, cotas e auditoria).
  Inscrição em encontro NÃO tem relação com a conta do portal: aqui nada cria nem aprova acesso.
*/
(function () {
  'use strict';

  var AC = window.AC;
  var ADM = window.AcademiaAdmin;
  var h = AC.h;
  var $ = AC.$;

  var SITE = 'https://gpmintegracao.com.br';
  var TAMANHOS = ['P', 'M', 'G'];
  var MSG_PADRAO = 'Olá, {nome}! Aqui é da Academia de Virtudes, do Grupo GPM. Você confirma sua presença no {evento}? É só tocar no link: {link}';

  var eventos = [];      // public.eventos
  var cotas = [];        // public.cotas_doacao do evento escolhido
  var inscricoes = [];   // public.inscricoes_painel do evento escolhido
  var resumo = null;     // admin_resumo_evento
  var eventoId = '';
  var carregou = false;
  var importacao = [];

  function sb() { return ADM.sb(); }
  function ok(r) { if (r.error) throw r.error; return r.data; }
  function evento() { return eventos.filter(function (e) { return e.id === eventoId; })[0] || null; }

  /* ---------- Formatação ---------- */
  function digitos(v) { return String(v || '').replace(/\D/g, ''); }
  function telefone(v) {
    var d = digitos(v);
    if (d.length === 11) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
    if (d.length === 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return d;
  }
  function dataHora(iso, curta) {
    if (!iso) return '';
    var o = curta ? { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }
                  : { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' };
    o.timeZone = 'America/Sao_Paulo';
    return new Intl.DateTimeFormat('pt-BR', o).format(new Date(iso));
  }
  function primeiroNome(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }
  function semAcento(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function linkPresenca(i) { return SITE + '/academiadevirtudes/presenca/?t=' + encodeURIComponent(i.token_confirmacao); }
  function plural(n, um, varios) { return n + ' ' + (n === 1 ? um : varios); }

  var ROT_STATUS = { inscrito: 'Inscrito', lista_espera: 'Lista de espera', cancelado: 'Cancelado' };
  var ROT_CONF = { sim: 'Sim', aguardando: 'Aguardando', nao_vai: 'Não vai' };
  var ROT_EMAIL = { enviado: 'Enviado', falhou: 'Falhou', nao_enviado: 'Não enviado' };

  function selo(texto, classe) { return h('span', { class: 'ac-selo ac-selo--mini ' + classe }, texto); }
  function seloSituacao(i) {
    if (i.status === 'lista_espera') return selo('Lista de espera', 'in-selo--espera');
    if (i.status === 'cancelado') return selo('Cancelado', 'in-selo--cancelado');
    return selo(ROT_CONF[i.confirmacao] || i.confirmacao, 'in-selo--' + i.confirmacao.replace('_', ''));
  }

  /* ---------- Erros do banco em português ---------- */
  function textoErro(e) {
    var m = (e && e.message) || '';
    if (/sem_vaga/.test(m)) return 'Não há lugares suficientes neste evento. Aumente os lugares no evento ou libere um lugar antes.';
    if (/tamanho_esgotado/.test(m)) {
      var t = (e && e.details) || '';
      return 'A cota de fraldas' + (t ? ' do tamanho ' + t : '') + ' acabou. Troque o tamanho ou aumente a cota no evento.';
    }
    if ((e && e.hint === 'cota_abaixo_reservado') || /cota|reservado/i.test(m)) return m;
    if (e && e.code === '23505') {
      return /slug|eventos_slug/.test(m) ? 'Já existe um evento com esse endereço curto (slug).' : 'Já existe uma inscrição com este WhatsApp neste evento.';
    }
    if (e && e.code === '23514') return 'Algum campo está num formato não aceito (nome com 3 letras ou mais, WhatsApp com DDD, e-mail válido, empresa e cargo preenchidos). Confira e tente de novo.';
    return ADM.textoErro(e);
  }
  function falha(e) { ADM.msg(textoErro(e), 'erro'); }

  /* ================= Carregamento ================= */
  function carregarEventos() {
    return sb().from('eventos').select('*').order('data_inicio', { ascending: false }).then(ok).then(function (d) {
      eventos = d || [];
      if (!eventoId || !evento()) {
        // o próximo evento (o mais perto no futuro); se não houver, o mais recente
        var agora = Date.now();
        var futuros = eventos.filter(function (e) { return new Date(e.data_inicio).getTime() >= agora - 12 * 3600e3; })
          .sort(function (a, b) { return new Date(a.data_inicio) - new Date(b.data_inicio); });
        eventoId = (futuros[0] || eventos[0] || {}).id || '';
      }
      var sel = AC.limpar($('#in-evento'));
      if (!eventos.length) sel.appendChild(h('option', { value: '' }, 'Nenhum evento ainda'));
      eventos.forEach(function (e) {
        var o = h('option', { value: e.id }, e.titulo + ' · ' + dataHora(e.data_inicio, true).split(',')[0]);
        if (e.id === eventoId) o.selected = true;
        sel.appendChild(o);
      });
    });
  }
  function carregarEvento() {
    var e = evento();
    $('#in-conteudo').hidden = !e;
    $('#in-editar-evento').disabled = !e;
    $('#in-abrir-checkin').disabled = !e;
    infoEvento();
    if (!e) { AC.texto($('#in-evento-info'), 'Crie o primeiro evento em "Novo evento".'); return Promise.resolve(); }
    return Promise.all([
      sb().from('cotas_doacao').select('*').eq('evento_id', e.id),
      sb().from('inscricoes_painel').select('*').eq('evento_id', e.id),
      sb().rpc('admin_resumo_evento', { evento: e.id })
    ]).then(function (r) {
      cotas = ok(r[0]) || [];
      inscricoes = (ok(r[1]) || []).sort(function (a, b) { return semAcento(a.nome).localeCompare(semAcento(b.nome)); });
      resumo = ok(r[2]) || {};
      mostrarResumo();
      montarFiltroConvite();
      listar();
      if (!$('#in-modo-checkin').hidden) listarCheckin();
    });
  }
  function recarregar() { return carregarEvento().catch(falha); }

  function infoEvento() {
    var e = evento();
    if (!e) return;
    var partes = [dataHora(e.data_inicio)];
    if (e.local) partes.push(e.local);
    partes.push(e.inscricoes_abertas ? 'Inscrições abertas' : 'Inscrições fechadas');
    partes.push(e.lista_espera ? 'lista de espera ligada' : 'sem lista de espera');
    AC.texto($('#in-evento-info'), partes.join(' · '));
  }

  /* ================= Indicadores ================= */
  function numero(valor, rotulo) { return h('div', { class: 'ac-numero' }, h('strong', null, String(valor)), h('span', null, rotulo)); }
  function mostrarResumo() {
    var r = resumo || {};
    var caixa = AC.limpar($('#in-numeros'));
    [[r.inscritos, 'inscritos'], [r.pessoas, 'pessoas (com acompanhantes)'], [r.vagas, 'vagas restantes'],
     [r.lista_espera, 'na lista de espera'], [r.confirmaram, 'confirmaram'], [r.aguardando, 'aguardando resposta'],
     [r.nao_vao, 'não vão'], [r.presentes, 'presentes (check-in)']]
      .forEach(function (n) { caixa.appendChild(numero(n[0] || 0, n[1])); });

    var c = (r.cotas || []);
    var fr = AC.limpar($('#in-fraldas'));
    fr.appendChild(h('strong', null, 'Fraldas reservadas (' + (evento().doacao_marca || 'fraldas') + '): '));
    if (!c.length) fr.appendChild(document.createTextNode('nenhuma cota cadastrada.'));
    c.forEach(function (x, k) {
      if (k) fr.appendChild(document.createTextNode(' · '));
      fr.appendChild(h('span', { class: x.reservados >= x.cota ? 'in-cota in-cota--cheia' : 'in-cota' }, x.tamanho + ' ' + x.reservados + '/' + x.cota));
    });

    var em = AC.limpar($('#in-emails'));
    em.appendChild(h('strong', null, 'E-mails de confirmação: '));
    em.appendChild(document.createTextNode(plural(r.email_falhou || 0, 'com falha', 'com falha') + ' · ' + plural(r.email_pendente || 0, 'não enviado', 'não enviados')));
    $('#in-reenviar-falhas').disabled = !(r.email_falhou || r.email_pendente);

    // Aviso (não erro) se as fraldas não cobrem os lugares
    var e = evento();
    var soma = c.reduce(function (s, x) { return s + x.cota; }, 0);
    var lugares = e.capacidade - e.reservados;
    var aviso = $('#in-aviso-cotas');
    aviso.hidden = !(c.length && soma < lugares);
    AC.texto(aviso, 'Atenção: as cotas de fralda somam ' + soma + ' pacotes para ' + lugares + ' lugares. Quando as fraldas acabarem, as novas inscrições vão para a lista de espera.');
  }

  /* ================= Lista ================= */
  function montarFiltroConvite() {
    var sel = $('#in-f-convite'), atual = sel.value;
    var nomes = {};
    inscricoes.forEach(function (i) { if (i.convidado_por) nomes[i.convidado_por] = true; });
    AC.limpar(sel);
    sel.appendChild(h('option', { value: '' }, 'Todos'));
    sel.appendChild(h('option', { value: '__nenhum' }, 'Ninguém informado'));
    Object.keys(nomes).sort(function (a, b) { return semAcento(a).localeCompare(semAcento(b)); })
      .forEach(function (n) { sel.appendChild(h('option', { value: n }, n)); });
    sel.value = atual && (atual === '__nenhum' || nomes[atual]) ? atual : '';
  }
  function filtradas() {
    var q = semAcento($('#in-busca').value.trim()), qd = digitos(q);
    var st = $('#in-f-status').value, cf = $('#in-f-confirmacao').value, eq = $('#in-f-equipe').value;
    var cv = $('#in-f-convite').value, pa = $('#in-f-participou').value, fr = $('#in-f-fralda').value;
    return inscricoes.filter(function (i) {
      if (q && semAcento(i.nome).indexOf(q) < 0 && semAcento(i.email).indexOf(q) < 0 && !(qd.length >= 3 && i.whatsapp.indexOf(qd) >= 0)) return false;
      if (st === 'ativos' && i.status === 'cancelado') return false;
      if (st && st !== 'ativos' && i.status !== st) return false;
      if (cf && i.confirmacao !== cf) return false;
      if (eq && (eq === 'sim') !== !!i.equipe_gpm) return false;
      if (cv === '__nenhum' && i.convidado_por) return false;
      if (cv && cv !== '__nenhum' && i.convidado_por !== cv) return false;
      if (pa && (pa === 'sim') !== ((i.participou || []).length > 0)) return false;
      if (fr && i.doacao_tamanho !== fr && !(i.acompanhante && i.acompanhante_doacao_tamanho === fr)) return false;
      return true;
    });
  }
  function celula(rotulo, conteudo) { return h('td', { 'data-rotulo': rotulo }, conteudo); }
  function pendente(i) { return i.status === 'inscrito' && i.confirmacao === 'aguardando'; }

  function listar() {
    var corpo = AC.limpar($('#in-tabela tbody'));
    var lista = filtradas();
    AC.texto($('#in-contagem'), plural(lista.length, 'inscrição', 'inscrições') + (lista.length !== inscricoes.length ? ' de ' + inscricoes.length : ''));
    if (!lista.length) {
      corpo.appendChild(h('tr', null, h('td', { colspan: '8', class: 'ac-meta' }, inscricoes.length ? 'Nenhuma inscrição com esses filtros.' : 'Nenhuma inscrição neste evento ainda.')));
      return;
    }
    lista.forEach(function (i) {
      var pessoa = h('div', { class: 'in-pessoa' },
        h('strong', null, i.nome),
        h('span', { class: 'ac-meta' }, telefone(i.whatsapp) + ' · ' + i.email),
        h('span', { class: 'ac-meta' }, [i.cargo, i.empresa].filter(Boolean).join(' · ')),
        h('span', { class: 'in-selos' },
          i.equipe_gpm ? selo('Equipe GPM', 'in-selo--info') : null,
          i.convidado_por ? selo('Convite: ' + i.convidado_por, 'in-selo--info') : null,
          (i.participou || []).length ? selo('Já participou', 'in-selo--info') : null,
          i.possivel_repetido ? selo('Possível repetido', 'ac-selo--alerta') : null,
          i.tem_conta_portal ? selo('Tem conta no portal', 'in-selo--info') : null),
        i.observacoes ? h('span', { class: 'ac-meta in-obs' }, 'Obs.: ' + i.observacoes) : null);

      var situacao = h('div', { class: 'in-selos' }, seloSituacao(i),
        i.status === 'inscrito' && i.checkin_em ? selo('Chegou', 'in-selo--sim') : null);

      var email = h('div', { class: 'in-email' }, selo(ROT_EMAIL[i.email_confirmacao_status] || i.email_confirmacao_status,
        'in-selo--email-' + i.email_confirmacao_status.replace('_', '')));
      if (i.status !== 'cancelado') {
        var reenviar = h('button', { type: 'button', class: 'ac-btn ac-btn--mini ac-btn--contorno' }, 'Reenviar confirmação');
        reenviar.addEventListener('click', function () { reenviarEmails({ ids: [i.id] }, reenviar); });
        email.appendChild(reenviar);
      }

      var editar = h('button', { type: 'button', class: 'ac-btn ac-btn--mini ac-btn--contorno', 'aria-label': 'Editar a inscrição de ' + i.nome }, 'Editar');
      editar.addEventListener('click', function () { abrirEdicao(i); });
      var acoes = h('div', { class: 'ac-acoes-linha' }, editar);
      if (pendente(i)) {
        acoes.appendChild(h('a', { class: 'ac-btn ac-btn--mini in-btn-whats', href: linkWhatsApp(i), target: '_blank', rel: 'noopener noreferrer',
          'aria-label': 'Pedir confirmação de ' + i.nome + ' pelo WhatsApp (abre em outra aba)' }, 'WhatsApp'));
      }

      corpo.appendChild(h('tr', { class: i.status === 'cancelado' ? 'in-linha--cancelada' : null },
        celula('Pessoa', pessoa),
        celula('Situação', situacao),
        celula('Acompanhante', i.acompanhante ? h('div', { class: 'in-pessoa' }, h('span', null, i.acompanhante_nome), h('span', { class: 'ac-meta' }, telefone(i.acompanhante_whatsapp))) : h('span', { class: 'ac-meta' }, 'Não')),
        celula('Fralda (titular)', h('span', { class: 'in-fralda' }, i.doacao_tamanho || '—')),
        celula('Fralda (acompanhante)', h('span', { class: 'in-fralda' }, i.acompanhante ? (i.acompanhante_doacao_tamanho || '—') : '—')),
        celula('Envios', String(i.envios)),
        celula('E-mail', email),
        celula('Ações', acoes)));
    });
  }

  /* ---------- WhatsApp ---------- */
  function mensagemPara(i) {
    var e = evento() || {};
    return (e.mensagem_whatsapp || MSG_PADRAO)
      .split('{nome}').join(primeiroNome(i.nome))
      .split('{evento}').join(e.titulo || 'encontro')
      .split('{link}').join(linkPresenca(i));
  }
  function linkWhatsApp(i) { return 'https://wa.me/55' + digitos(i.whatsapp) + '?text=' + encodeURIComponent(mensagemPara(i)); }
  function copiarPendentes() {
    var lista = inscricoes.filter(pendente);
    if (!lista.length) { ADM.msg('Ninguém aguardando confirmação neste evento.', 'info'); return; }
    var texto = lista.map(function (i) { return i.nome + ' · ' + telefone(i.whatsapp) + ' · ' + linkPresenca(i); }).join('\n');
    var fim = function () { ADM.msg('Lista copiada: ' + plural(lista.length, 'pessoa', 'pessoas') + ' aguardando confirmação.', 'ok'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto).then(fim, function () { ADM.msg('Não foi possível copiar. Permita o acesso à área de transferência e tente de novo.', 'erro'); });
    } else {
      ADM.msg('Este navegador não deixa copiar automaticamente. Use o CSV "só nome e WhatsApp".', 'erro');
    }
  }

  /* ---------- E-mail de confirmação ---------- */
  function reenviarEmails(corpo, botao) {
    AC.ocupado(botao, true, 'Enviando…');
    return ADM.chamar('reenviar-confirmacao', corpo).then(function (r) {
      r = r || {};
      var env = r.enviado || 0, fal = r.falhou || 0, nao = r.nao_enviado || 0;
      if (!env && !fal && nao) ADM.msg('O envio de e-mails ainda não está configurado (Resend). As inscrições continuam como "não enviado" e podem ser reenviadas depois.', 'info');
      else if (!env && !fal && !nao) ADM.msg('Nenhum e-mail para reenviar.', 'info');
      else ADM.msg('E-mails: ' + plural(env, 'enviado', 'enviados') + (fal ? ' · ' + plural(fal, 'com falha', 'com falha') : '') + '.', fal ? 'erro' : 'ok');
      return recarregar();
    }).catch(falha).then(function () { AC.ocupado(botao, false); });
  }

  /* ================= Evento: criar e editar ================= */
  function abrirEvento(novo) {
    var e = novo ? null : evento();
    var f = $('#form-evento');
    f.reset();
    ['ev-titulo', 'ev-slug', 'ev-data', 'ev-capacidade'].forEach(function (id) { AC.erroCampo($('#' + id), ''); });
    AC.texto($('#t-form-evento'), e ? 'Editar evento' : 'Novo evento');
    $('#ev-id').value = e ? e.id : '';
    $('#ev-titulo').value = e ? e.titulo : '';
    $('#ev-slug').value = e ? e.slug : '';
    $('#ev-data').value = e ? ADM.paraInputData(e.data_inicio) : '';
    $('#ev-local').value = e ? e.local || '' : '';
    $('#ev-capacidade').value = e ? e.capacidade : 50;
    $('#ev-reservados').value = e ? e.reservados : 0;
    $('#ev-abertas').checked = e ? e.inscricoes_abertas : false;
    $('#ev-espera').checked = e ? e.lista_espera : true;
    $('#ev-marca').value = e ? e.doacao_marca : 'Pampers ou Huggies';
    $('#ev-mensagem').value = (e && e.mensagem_whatsapp) || MSG_PADRAO;
    TAMANHOS.forEach(function (t) {
      var c = e ? cotas.filter(function (x) { return x.tamanho === t; })[0] : null;
      $('#ev-cota-' + t).value = c ? c.cota : '';
    });
    avisoCotas();
    f.hidden = false;
    $('#ev-titulo').focus();
  }
  function avisoCotas() {
    var cap = parseInt($('#ev-capacidade').value, 10) || 0, res = parseInt($('#ev-reservados').value, 10) || 0;
    var preenchidas = TAMANHOS.filter(function (t) { return $('#ev-cota-' + t).value !== ''; });
    var soma = preenchidas.reduce(function (s, t) { return s + (parseInt($('#ev-cota-' + t).value, 10) || 0); }, 0);
    var aviso = $('#ev-aviso-cotas');
    aviso.hidden = !(preenchidas.length && soma < cap - res);
    AC.texto(aviso, 'Atenção: as cotas somam ' + soma + ' pacotes para ' + (cap - res) + ' lugares. Você pode salvar assim; quando as fraldas acabarem, as novas inscrições vão para a lista de espera.');
  }
  function salvarEvento(ev) {
    ev.preventDefault();
    var id = $('#ev-id').value, btn = $('#btn-evento');
    var titulo = $('#ev-titulo').value.trim().replace(/\s+/g, ' ');
    var slug = $('#ev-slug').value.trim().toLowerCase();
    var data = ADM.deInputData($('#ev-data').value);
    var cap = parseInt($('#ev-capacidade').value, 10);
    var res = parseInt($('#ev-reservados').value, 10) || 0;
    var erros = 0;
    var marcar = function (campo, msg) { AC.erroCampo($('#' + campo), msg); if (msg) erros++; };
    marcar('ev-titulo', titulo.length >= 3 ? '' : 'Escreva o título (3 letras ou mais).');
    marcar('ev-slug', /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) ? '' : 'Use só letras minúsculas, números e hífen (ex.: encontro-4).');
    marcar('ev-data', data ? '' : 'Informe a data e o horário.');
    marcar('ev-capacidade', cap >= 0 && cap <= 5000 && res <= cap ? '' : 'Informe os lugares (0 a 5000), maior ou igual aos lugares da organização.');
    if (erros) { var inv = $('#form-evento [aria-invalid="true"]'); if (inv) inv.focus(); return; }

    var dados = {
      titulo: titulo, slug: slug, data_inicio: data, local: $('#ev-local').value.trim() || null,
      capacidade: cap, reservados: res, inscricoes_abertas: $('#ev-abertas').checked, lista_espera: $('#ev-espera').checked,
      doacao_marca: $('#ev-marca').value.trim() || 'Pampers ou Huggies', mensagem_whatsapp: $('#ev-mensagem').value.trim() || null
    };
    AC.ocupado(btn, true, 'Salvando…');
    var gravar = id ? sb().from('eventos').update(dados).eq('id', id).select().single() : sb().from('eventos').insert(dados).select().single();
    gravar.then(ok).then(function (salvo) {
      eventoId = salvo.id;
      return salvarCotas(salvo.id, id ? cotas : []);
    }).then(function () {
      $('#form-evento').hidden = true;
      ADM.msg('Evento salvo.', 'ok');
      return carregarEventos().then(carregarEvento);
    }).catch(function (e) {
      falha(e);
      // o evento pode ter sido salvo mesmo com erro numa cota: recarrega para mostrar o estado real
      return carregarEventos().then(carregarEvento).catch(function () {});
    }).then(function () { AC.ocupado(btn, false); });
  }
  // Uma cota por vez, para a mensagem do banco (cota abaixo do reservado) aparecer certinha.
  function salvarCotas(id, atuais) {
    return TAMANHOS.reduce(function (p, t) {
      return p.then(function () {
        var campo = $('#ev-cota-' + t).value.trim();
        var antes = atuais.filter(function (x) { return x.tamanho === t; })[0];
        if (campo === '') return antes ? sb().from('cotas_doacao').delete().eq('evento_id', id).eq('tamanho', t).then(ok) : null;
        var n = parseInt(campo, 10);
        if (!(n >= 0 && n <= 5000)) throw { mensagemPainel: 'A cota do tamanho ' + t + ' precisa ser um número de 0 a 5000.' };
        if (antes && antes.cota === n) return null;
        return (antes ? sb().from('cotas_doacao').update({ cota: n }).eq('evento_id', id).eq('tamanho', t)
                      : sb().from('cotas_doacao').insert({ evento_id: id, tamanho: t, cota: n })).then(ok);
      });
    }, Promise.resolve());
  }

  /* ================= Inscrição: editar, mover, cancelar, excluir ================= */
  var emEdicao = null;
  function abrirEdicao(i) {
    emEdicao = i;
    var f = $('#form-inscricao');
    AC.mensagem($('#fi-msg'), '');
    ['fi-nome', 'fi-whatsapp', 'fi-email'].forEach(function (id) { AC.erroCampo($('#' + id), ''); });
    AC.texto($('#t-form-inscricao'), 'Editar inscrição · ' + i.nome);
    AC.texto($('#fi-meta'), 'Inscrita em ' + dataHora(i.criado_em, true) + ' · ' + plural(i.envios, 'envio', 'envios') + ' do formulário · origem: ' + i.origem +
      (i.confirmado_em ? ' · respondeu em ' + dataHora(i.confirmado_em, true) : '') + (i.aceite_comunicacoes ? ' · aceita comunicações' : ''));
    $('#fi-id').value = i.id;
    $('#fi-nome').value = i.nome;
    $('#fi-whatsapp').value = telefone(i.whatsapp);
    $('#fi-email').value = i.email;
    $('#fi-empresa').value = i.empresa;
    $('#fi-cargo').value = i.cargo;
    $('#fi-convidado').value = i.convidado_por || '';
    $('#fi-perfil').value = i.perfil_ia || '';
    $('#fi-participou').value = (i.participou || []).join(', ');
    $('#fi-status').value = i.status;
    $('#fi-confirmacao').value = i.confirmacao;
    $('#fi-fralda').value = i.doacao_tamanho || '';
    $('#fi-equipe').checked = !!i.equipe_gpm;
    $('#fi-comunic').checked = !!i.aceite_comunicacoes;
    $('#fi-acomp').checked = !!i.acompanhante;
    $('#fi-acomp-nome').value = i.acompanhante_nome || '';
    $('#fi-acomp-whatsapp').value = i.acompanhante_whatsapp ? telefone(i.acompanhante_whatsapp) : '';
    $('#fi-acomp-fralda').value = i.acompanhante_doacao_tamanho || '';
    $('#fi-acomp-dados').hidden = !i.acompanhante;
    $('#fi-obs').value = i.observacoes || '';
    $('#btn-fi-mover').hidden = i.status !== 'lista_espera';
    $('#btn-fi-cancelar').hidden = i.status === 'cancelado';
    f.hidden = false;
    f.scrollIntoView({ block: 'start', behavior: 'smooth' });
    $('#fi-nome').focus({ preventScroll: true });
  }
  function dadosEdicao() {
    var participou = $('#fi-participou').value.split(/[,;]/).map(function (x) { return x.trim().toLowerCase().replace(/\s+/g, '-'); }).filter(Boolean);
    var acomp = $('#fi-acomp').checked;
    return {
      nome: $('#fi-nome').value.trim().replace(/\s+/g, ' '),
      whatsapp: digitos($('#fi-whatsapp').value),
      email: $('#fi-email').value.trim().toLowerCase(),
      empresa: $('#fi-empresa').value.trim(),
      cargo: $('#fi-cargo').value.trim(),
      convidado_por: $('#fi-convidado').value.trim() || null,
      perfil_ia: $('#fi-perfil').value || null,
      participou: participou,
      status: $('#fi-status').value,
      confirmacao: $('#fi-confirmacao').value,
      doacao_tamanho: $('#fi-fralda').value || null,
      equipe_gpm: $('#fi-equipe').checked,
      aceite_comunicacoes: $('#fi-comunic').checked,
      acompanhante: acomp,
      acompanhante_nome: acomp ? $('#fi-acomp-nome').value.trim() || null : null,
      acompanhante_whatsapp: acomp ? digitos($('#fi-acomp-whatsapp').value) || null : null,
      acompanhante_doacao_tamanho: acomp ? $('#fi-acomp-fralda').value || null : null,
      observacoes: $('#fi-obs').value.trim() || null
    };
  }
  function gravarInscricao(id, dados, botao, msgOk) {
    AC.ocupado(botao, true, 'Salvando…');
    AC.mensagem($('#fi-msg'), '');
    return sb().from('inscricoes').update(dados).eq('id', id).then(ok).then(function () {
      $('#form-inscricao').hidden = true;
      ADM.msg(msgOk, 'ok');
      return recarregar();
    }).catch(function (e) { AC.mensagem($('#fi-msg'), textoErro(e), 'erro'); })
      .then(function () { AC.ocupado(botao, false); });
  }
  function salvarEdicao(ev) {
    ev.preventDefault();
    var d = dadosEdicao(), erros = 0;
    var marcar = function (campo, msg) { AC.erroCampo($('#' + campo), msg); if (msg) erros++; };
    marcar('fi-nome', d.nome.length >= 3 ? '' : 'Escreva o nome (3 letras ou mais).');
    marcar('fi-whatsapp', /^[1-9][1-9]\d{8,9}$/.test(d.whatsapp) ? '' : 'WhatsApp com DDD, só números.');
    marcar('fi-email', /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email) ? '' : 'Escreva um e-mail válido.');
    if (d.acompanhante && (!d.acompanhante_nome || !d.acompanhante_whatsapp)) {
      AC.mensagem($('#fi-msg'), 'Preencha o nome e o WhatsApp do acompanhante (ou desmarque "Leva acompanhante").', 'erro');
      return;
    }
    if (erros) { var inv = $('#form-inscricao [aria-invalid="true"]'); if (inv) inv.focus(); return; }
    gravarInscricao($('#fi-id').value, d, $('#btn-fi-salvar'), 'Inscrição salva.');
  }
  function moverParaInscritos() {
    if (!emEdicao) return;
    gravarInscricao(emEdicao.id, { status: 'inscrito' }, $('#btn-fi-mover'), emEdicao.nome + ' saiu da lista de espera e agora está inscrita.');
  }
  function cancelarInscricao() {
    if (!emEdicao) return;
    if (!ADM.confirmar('Cancelar a inscrição de ' + emEdicao.nome + '? O lugar e as fraldas reservadas voltam a ficar livres. A linha continua na lista como "Cancelado".')) return;
    gravarInscricao(emEdicao.id, { status: 'cancelado' }, $('#btn-fi-cancelar'), 'Inscrição cancelada.');
  }
  function excluirInscricao() {
    if (!emEdicao) return;
    var i = emEdicao;
    if (!ADM.confirmar('Excluir de verdade a inscrição de ' + i.nome + '? Os dados são apagados e não dá para desfazer.')) return;
    if (!ADM.confirmar('Confirma a exclusão definitiva de ' + i.nome + '? (A auditoria registra só que houve uma exclusão, sem os dados.)')) return;
    var btn = $('#btn-fi-excluir');
    AC.ocupado(btn, true, 'Excluindo…');
    sb().from('inscricoes').delete().eq('id', i.id).then(ok).then(function () {
      $('#form-inscricao').hidden = true;
      ADM.msg('Inscrição excluída.', 'ok');
      return recarregar();
    }).catch(function (e) { AC.mensagem($('#fi-msg'), textoErro(e), 'erro'); })
      .then(function () { AC.ocupado(btn, false); });
  }

  /* ================= Modo check-in ================= */
  function abrirCheckin() {
    $('#in-modo-lista').hidden = true;
    $('#in-modo-checkin').hidden = false;
    $('#form-evento').hidden = true;
    document.documentElement.classList.add('in-checkin-ativo');
    listarCheckin();
    $('#in-ck-busca').focus();
  }
  function fecharCheckin() {
    $('#in-modo-checkin').hidden = true;
    $('#in-modo-lista').hidden = false;
    document.documentElement.classList.remove('in-checkin-ativo');
    listar();
    $('#in-abrir-checkin').focus();
  }
  function botaoChegou(i, campo, nome) {
    var chegou = !!i[campo];
    var b = h('button', { type: 'button', class: 'in-chegou' + (chegou ? ' in-chegou--sim' : ''), 'aria-pressed': chegou ? 'true' : 'false',
      'aria-label': (chegou ? 'Desfazer a chegada de ' : 'Marcar a chegada de ') + nome }, chegou ? 'Chegou ✓' : 'Chegou');
    b.addEventListener('click', function () {
      var valor = i[campo] ? null : new Date().toISOString();
      var dados = {}; dados[campo] = valor;
      b.disabled = true;
      sb().from('inscricoes').update(dados).eq('id', i.id).then(ok).then(function () {
        i[campo] = valor;
        if (resumo) resumo.presentes = (resumo.presentes || 0) + (valor ? 1 : -1);
        mostrarResumo();
        listarCheckin();
        var novo = document.getElementById('ck-' + campo + '-' + i.id);
        if (novo) novo.focus();
      }).catch(function (e) { b.disabled = false; falha(e); });
    });
    b.id = 'ck-' + campo + '-' + i.id;
    return b;
  }
  function listarCheckin() {
    var q = semAcento($('#in-ck-busca').value.trim());
    var ul = AC.limpar($('#in-ck-lista'));
    var lista = inscricoes.filter(function (i) { return i.status !== 'cancelado'; });
    var total = 0, presentes = 0;
    lista.forEach(function (i) { total += i.acompanhante ? 2 : 1; if (i.checkin_em) presentes++; if (i.acompanhante && i.acompanhante_checkin_em) presentes++; });
    AC.texto($('#in-ck-contagem'), presentes + ' de ' + total + ' pessoas já chegaram');
    var visiveis = lista.filter(function (i) { return !q || semAcento(i.nome).indexOf(q) >= 0 || (i.acompanhante && semAcento(i.acompanhante_nome).indexOf(q) >= 0); });
    if (!visiveis.length) { ul.appendChild(h('li', { class: 'ac-meta' }, lista.length ? 'Ninguém com esse nome.' : 'Nenhuma inscrição neste evento.')); return; }
    visiveis.forEach(function (i) {
      var info = h('div', { class: 'in-ck__info' },
        h('strong', { class: 'in-ck__nome' }, i.nome),
        h('span', { class: 'in-ck__meta' }, 'Fralda ' + (i.doacao_tamanho || '—')),
        h('span', { class: 'in-selos' },
          i.status === 'lista_espera' ? selo('Lista de espera', 'in-selo--espera') : null,
          i.confirmacao === 'nao_vai' ? selo('Disse que não vai', 'in-selo--naovai') : null));
      var li = h('li', { class: 'in-ck' + (i.checkin_em ? ' in-ck--chegou' : '') }, info, botaoChegou(i, 'checkin_em', i.nome));
      ul.appendChild(li);
      if (i.acompanhante) {
        ul.appendChild(h('li', { class: 'in-ck in-ck--acomp' + (i.acompanhante_checkin_em ? ' in-ck--chegou' : '') },
          h('div', { class: 'in-ck__info' },
            h('span', { class: 'in-ck__rotulo' }, 'Acompanhante de ' + primeiroNome(i.nome)),
            h('strong', { class: 'in-ck__nome' }, i.acompanhante_nome),
            h('span', { class: 'in-ck__meta' }, 'Fralda ' + (i.acompanhante_doacao_tamanho || '—'))),
          botaoChegou(i, 'acompanhante_checkin_em', i.acompanhante_nome)));
      }
    });
  }

  /* ================= CSV ================= */
  function nomeArquivo(sufixo) {
    var e = evento();
    return 'inscricoes-' + (e ? e.slug : 'evento') + '-' + sufixo + '-' + new Date().toISOString().slice(0, 10) + '.csv';
  }
  function exportar(modelo, botao) {
    var e = evento();
    if (!e) return;
    var linhas;
    if (modelo === 'completo') {
      linhas = [['Nome', 'WhatsApp', 'E-mail', 'Empresa', 'Cargo', 'Equipe GPM', 'Quem convidou', 'Encontros anteriores', 'Perfil diante da IA',
        'Status', 'Confirmação', 'Respondeu em', 'Acompanhante', 'WhatsApp do acompanhante', 'Fralda (titular)', 'Fralda (acompanhante)',
        'Check-in', 'Check-in do acompanhante', 'E-mail de confirmação', 'Envios do formulário', 'Aceita comunicações', 'Inscrito em',
        'Possível repetido', 'Link de presença', 'Observações']];
      inscricoes.forEach(function (i) {
        linhas.push([i.nome, telefone(i.whatsapp), i.email, i.empresa, i.cargo, i.equipe_gpm ? 'Sim' : 'Não', i.convidado_por || '',
          (i.participou || []).join(', '), i.perfil_ia || '', ROT_STATUS[i.status] || i.status, ROT_CONF[i.confirmacao] || i.confirmacao,
          i.confirmado_em ? dataHora(i.confirmado_em, true) : '', i.acompanhante ? i.acompanhante_nome : '', i.acompanhante ? telefone(i.acompanhante_whatsapp) : '',
          i.doacao_tamanho || '', i.acompanhante ? i.acompanhante_doacao_tamanho || '' : '', i.checkin_em ? dataHora(i.checkin_em, true) : '',
          i.acompanhante_checkin_em ? dataHora(i.acompanhante_checkin_em, true) : '', ROT_EMAIL[i.email_confirmacao_status] || '', i.envios,
          i.aceite_comunicacoes ? 'Sim' : 'Não', dataHora(i.criado_em, true), i.possivel_repetido ? 'Sim' : '', linkPresenca(i), i.observacoes || '']);
      });
    } else {
      linhas = [['Nome', 'WhatsApp']];
      inscricoes.filter(function (i) { return i.status !== 'cancelado'; }).forEach(function (i) {
        linhas.push([i.nome, telefone(i.whatsapp)]);
        if (i.acompanhante) linhas.push([i.acompanhante_nome + ' (acompanhante de ' + primeiroNome(i.nome) + ')', telefone(i.acompanhante_whatsapp)]);
      });
    }
    AC.ocupado(botao, true, 'Exportando…');
    // Registra na auditoria antes de entregar o arquivo.
    sb().rpc('admin_registrar_exportacao', { evento: e.id, modelo: modelo, linhas: linhas.length - 1 }).then(ok).then(function () {
      ADM.csv(nomeArquivo(modelo === 'completo' ? 'completo' : 'nome-whatsapp'), linhas);
      ADM.msg('CSV exportado (' + plural(linhas.length - 1, 'linha', 'linhas') + '). A exportação ficou registrada na auditoria.', 'ok');
    }).catch(falha).then(function () { AC.ocupado(botao, false); });
  }

  /* ---------- Importar (uso futuro) ---------- */
  function partirCsv(texto) {
    var linhas = String(texto).replace(/^﻿/, '').split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (!linhas.length) return null;
    var sep = (linhas[0].match(/;/g) || []).length >= (linhas[0].match(/,/g) || []).length ? ';' : ',';
    var partir = function (l) {
      var out = [], cur = '', aspas = false;
      for (var k = 0; k < l.length; k++) {
        var ch = l[k];
        if (aspas) { if (ch === '"' && l[k + 1] === '"') { cur += '"'; k++; } else if (ch === '"') aspas = false; else cur += ch; }
        else if (ch === '"') aspas = true;
        else if (ch === sep) { out.push(cur.trim()); cur = ''; }
        else cur += ch;
      }
      out.push(cur.trim());
      return out;
    };
    var cab = partir(linhas[0]).map(function (c) { return semAcento(c).replace(/[^a-z0-9]/g, ''); });
    var col = function (nomes) { for (var k = 0; k < nomes.length; k++) { var x = cab.indexOf(nomes[k]); if (x >= 0) return x; } return -1; };
    var mapa = {
      nome: col(['nome', 'nomecompleto']), whatsapp: col(['whatsapp', 'telefone', 'celular']), email: col(['email']),
      empresa: col(['empresa']), cargo: col(['cargo']), equipe: col(['equipegpm', 'equipe']), convidado: col(['convidadopor', 'quemconvidou', 'convidado']),
      perfil: col(['perfilia', 'perfil']), fralda: col(['fralda', 'doacaotamanho', 'tamanho', 'fraldatitular']),
      anome: col(['acompanhantenome', 'acompanhante']), awpp: col(['acompanhantewhatsapp', 'whatsappdoacompanhante']),
      afralda: col(['acompanhantefralda', 'acompanhantedoacaotamanho', 'fraldaacompanhante'])
    };
    if (mapa.nome < 0 || mapa.whatsapp < 0 || mapa.email < 0) return { erro: 'O arquivo precisa ter as colunas nome, whatsapp e email.' };
    var sim = function (v) { return /^(sim|s|x|1|true|yes)$/i.test(String(v || '').trim()); };
    var tam = function (v) { var t = String(v || '').trim().toUpperCase().replace(/^TAMANHO\s+/, ''); return TAMANHOS.indexOf(t) >= 0 ? t : null; };
    var get = function (c, k) { return k >= 0 ? (c[k] || '').trim() : ''; };
    return {
      linhas: linhas.slice(1).map(function (l) {
        var c = partir(l), an = get(c, mapa.anome);
        return {
          nome: get(c, mapa.nome), whatsapp: digitos(get(c, mapa.whatsapp)), email: get(c, mapa.email).toLowerCase(),
          empresa: get(c, mapa.empresa), cargo: get(c, mapa.cargo), equipe_gpm: sim(get(c, mapa.equipe)),
          convidado_por: get(c, mapa.convidado) || null, perfil_ia: get(c, mapa.perfil) || null, participou: [],
          doacao_tamanho: tam(get(c, mapa.fralda)), acompanhante: !!an, acompanhante_nome: an || null,
          acompanhante_whatsapp: an ? digitos(get(c, mapa.awpp)) : null, acompanhante_doacao_tamanho: an ? tam(get(c, mapa.afralda)) : null,
          aceite_comunicacoes: false
        };
      }).filter(function (x) { return x.nome || x.whatsapp || x.email; })
    };
  }
  function lerImportacao() {
    var arq = $('#in-im-arquivo').files[0], previa = AC.limpar($('#in-im-previa')), btn = $('#btn-in-importar');
    importacao = [];
    btn.disabled = true;
    if (!arq) return;
    if (arq.size > 1048576) { previa.appendChild(h('p', { class: 'ac-msg ac-msg--erro' }, 'Arquivo grande demais (máximo 1 MB).')); return; }
    arq.text().then(function (texto) {
      var r = partirCsv(texto);
      if (!r || r.erro || !r.linhas.length) { previa.appendChild(h('p', { class: 'ac-msg ac-msg--erro' }, (r && r.erro) || 'Nenhuma linha encontrada no arquivo.')); return; }
      if (r.linhas.length > 300) { previa.appendChild(h('p', { class: 'ac-msg ac-msg--erro' }, 'Até 300 linhas por vez. Divida o arquivo.')); return; }
      importacao = r.linhas;
      previa.appendChild(h('p', { class: 'ac-meta' }, plural(importacao.length, 'linha pronta', 'linhas prontas') + ' para importar. Confira abaixo antes de gravar:'));
      var corpo = h('tbody');
      importacao.forEach(function (x) {
        corpo.appendChild(h('tr', null, celula('Nome', x.nome), celula('WhatsApp', telefone(x.whatsapp)), celula('E-mail', x.email),
          celula('Fralda', x.doacao_tamanho || '—'), celula('Acompanhante', x.acompanhante_nome || 'Não'), celula('Resultado', h('span', { class: 'ac-meta' }, '—'))));
      });
      previa.appendChild(h('div', { class: 'ac-tabela-caixa' }, h('table', { class: 'ac-tabela', id: 'in-im-tabela' },
        h('thead', null, h('tr', null, ['Nome', 'WhatsApp', 'E-mail', 'Fralda', 'Acompanhante', 'Resultado'].map(function (t) { return h('th', { scope: 'col' }, t); }))),
        corpo)));
      btn.disabled = false;
      AC.texto(btn, 'Importar ' + plural(importacao.length, 'linha', 'linhas'));
    }).catch(function () { previa.appendChild(h('p', { class: 'ac-msg ac-msg--erro' }, 'Não foi possível ler o arquivo.')); });
  }
  function importar(ev) {
    ev.preventDefault();
    var e = evento(), btn = $('#btn-in-importar');
    if (!e || !importacao.length) return;
    if (!ADM.confirmar('Importar ' + plural(importacao.length, 'linha', 'linhas') + ' para "' + e.titulo + '"? Vale a mesma regra do site: mesmo WhatsApp atualiza a inscrição existente.')) return;
    AC.ocupado(btn, true, 'Importando…');
    var linhasTabela = AC.$$('#in-im-tabela tbody tr');
    var cont = { inscrito: 0, lista_espera: 0, erro: 0 };
    var ERROS = { dados: 'dados inválidos', tamanho_esgotado: 'fralda esgotada', encerradas: 'sem lugar', consentimento: 'sem concordância' };
    importacao.reduce(function (p, x, k) {
      return p.then(function () {
        return sb().rpc('admin_importar_inscricao', { evento: e.id, dados: x }).then(ok).then(function (r) {
          var txt = r && r.ok ? (r.situacao === 'lista_espera' ? 'Lista de espera' : 'Inscrito') : 'Erro: ' + (ERROS[r && r.erro] || (r && r.erro) || 'desconhecido');
          if (r && r.ok) cont[r.situacao === 'lista_espera' ? 'lista_espera' : 'inscrito']++; else cont.erro++;
          var alvo = linhasTabela[k] && linhasTabela[k].lastChild;
          if (alvo) AC.limpar(alvo).appendChild(h('span', { class: r && r.ok ? 'ac-meta' : 'ac-erro-texto' }, txt));
        }, function (err) {
          cont.erro++;
          var alvo = linhasTabela[k] && linhasTabela[k].lastChild;
          if (alvo) AC.limpar(alvo).appendChild(h('span', { class: 'ac-erro-texto' }, textoErro(err)));
        });
      });
    }, Promise.resolve()).then(function () {
      importacao = [];
      ADM.msg('Importação concluída: ' + cont.inscrito + ' inscrita(s), ' + cont.lista_espera + ' na lista de espera, ' + cont.erro + ' com erro.', cont.erro ? 'erro' : 'ok');
      AC.texto(btn, 'Importar');
      return recarregar();
    }).then(function () { AC.ocupado(btn, false); btn.disabled = true; });
  }

  /* ================= Ligações ================= */
  ADM.registrar('inscricoes', {
    iniciar: function () {
      $('#in-evento').addEventListener('change', function () {
        eventoId = $('#in-evento').value;
        $('#form-evento').hidden = true;
        $('#form-inscricao').hidden = true;
        recarregar();
      });
      $('#in-editar-evento').addEventListener('click', function () { abrirEvento(false); });
      $('#in-novo-evento').addEventListener('click', function () { abrirEvento(true); });
      $('#form-evento').addEventListener('submit', salvarEvento);
      ['ev-capacidade', 'ev-reservados', 'ev-cota-P', 'ev-cota-M', 'ev-cota-G'].forEach(function (id) { $('#' + id).addEventListener('input', avisoCotas); });
      $('#ev-titulo').addEventListener('input', function () { if (!$('#ev-id').value) $('#ev-slug').value = ADM.slug($('#ev-titulo').value).split('-').slice(0, 2).join('-'); });

      ['in-busca', 'in-f-status', 'in-f-confirmacao', 'in-f-equipe', 'in-f-convite', 'in-f-participou', 'in-f-fralda'].forEach(function (id) {
        $('#' + id).addEventListener(id === 'in-busca' ? 'input' : 'change', listar);
      });
      $('#in-copiar').addEventListener('click', copiarPendentes);
      $('#in-reenviar-falhas').addEventListener('click', function () {
        var e = evento(), r = resumo || {};
        if (!e) return;
        if (!ADM.confirmar('Reenviar o e-mail de confirmação para ' + plural((r.email_falhou || 0) + (r.email_pendente || 0), 'pessoa', 'pessoas') + ' (com falha ou ainda não enviado)?')) return;
        reenviarEmails({ evento: e.id, falhas: true }, $('#in-reenviar-falhas'));
      });
      $('#in-csv-completo').addEventListener('click', function () { exportar('completo', $('#in-csv-completo')); });
      $('#in-csv-simples').addEventListener('click', function () { exportar('nome_whatsapp', $('#in-csv-simples')); });
      $('#in-abrir-importar').addEventListener('click', function () { $('#form-in-importar').hidden = false; $('#in-im-arquivo').focus(); });
      $('#in-im-arquivo').addEventListener('change', lerImportacao);
      $('#form-in-importar').addEventListener('submit', importar);

      $('#form-inscricao').addEventListener('submit', salvarEdicao);
      $('#fi-acomp').addEventListener('change', function () { $('#fi-acomp-dados').hidden = !$('#fi-acomp').checked; });
      $('#btn-fi-mover').addEventListener('click', moverParaInscritos);
      $('#btn-fi-cancelar').addEventListener('click', cancelarInscricao);
      $('#btn-fi-excluir').addEventListener('click', excluirInscricao);

      $('#in-abrir-checkin').addEventListener('click', abrirCheckin);
      $('#in-fechar-checkin').addEventListener('click', fecharCheckin);
      $('#in-ck-busca').addEventListener('input', listarCheckin);
    },
    mostrar: function () {
      (carregou ? Promise.resolve() : carregarEventos().then(function () { carregou = true; }))
        .then(carregarEvento).catch(falha);
    }
  });
})();
