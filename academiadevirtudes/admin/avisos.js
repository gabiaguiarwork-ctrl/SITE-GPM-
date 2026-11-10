/*
  Painel · aba Avisos (aparecem no topo da vitrine, os 5 mais recentes publicados)
*/
(function () {
  'use strict';

  var AC = window.AC;
  var ADM = window.AcademiaAdmin;
  var C = window.AcademiaConteudo;
  var h = AC.h;
  var $ = AC.$;
  var avisos = [];

  function sb() { return ADM.sb(); }
  function ok(r) { if (r.error) throw r.error; return r.data; }

  function carregar() {
    return sb().from('avisos').select('*').order('criado_em', { ascending: false }).then(ok).then(function (d) { avisos = d; listar(); });
  }
  function listar() {
    var ul = AC.limpar($('#lista-avisos'));
    if (!avisos.length) { ul.appendChild(h('li', null, C.vazio('Nenhum aviso ainda.'))); return; }
    avisos.forEach(function (a) {
      var publicar = h('button', { type: 'button', class: 'ac-btn ac-btn--mini ac-btn--contorno' }, a.publicado ? 'Despublicar' : 'Publicar');
      var editar = h('button', { type: 'button', class: 'ac-btn ac-btn--mini ac-btn--contorno' }, 'Editar');
      var excluir = h('button', { type: 'button', class: 'ac-btn ac-btn--mini ac-btn--perigo' }, 'Excluir');
      publicar.addEventListener('click', function () {
        AC.ocupado(publicar, true, 'Salvando…');
        sb().from('avisos').update({ publicado: !a.publicado }).eq('id', a.id).then(ok).then(carregar)
          .then(function () { ADM.msg(a.publicado ? 'Aviso despublicado.' : 'Aviso publicado.', 'ok'); })
          .catch(function (e) { AC.ocupado(publicar, false); ADM.falha(e); });
      });
      editar.addEventListener('click', function () {
        $('#av-id').value = a.id;
        $('#av-titulo').value = a.titulo;
        $('#av-texto').value = a.texto || '';
        $('#av-publicado').checked = !!a.publicado;
        $('#t-form-aviso').textContent = 'Editar aviso';
        $('#av-titulo').focus();
      });
      excluir.addEventListener('click', function () {
        if (!ADM.confirmar('Excluir o aviso "' + a.titulo + '"?')) return;
        AC.ocupado(excluir, true, 'Excluindo…');
        sb().from('avisos').delete().eq('id', a.id).then(ok).then(carregar)
          .then(function () { ADM.msg('Aviso excluído.', 'ok'); })
          .catch(function (e) { AC.ocupado(excluir, false); ADM.falha(e); });
      });
      ul.appendChild(h('li', { class: 'ac-linha-admin' },
        h('div', { class: 'ac-linha-admin__texto' },
          h('strong', null, a.titulo), h('br'),
          h('span', { class: 'ac-meta' }, (a.publicado ? 'Publicado' : 'Rascunho') + ' · ' + C.data(a.criado_em, true)),
          a.texto ? h('p', { class: 'ac-meta' }, a.texto) : null),
        h('div', { class: 'ac-acoes-linha' }, publicar, editar, excluir)));
    });
  }
  function limpar() {
    $('#form-aviso').reset();
    $('#av-id').value = '';
    $('#t-form-aviso').textContent = 'Novo aviso';
  }
  function salvar(e) {
    e.preventDefault();
    var titulo = $('#av-titulo'), btn = $('#btn-aviso');
    AC.erroCampo(titulo, titulo.value.trim() ? '' : 'Informe o título.');
    if (!titulo.value.trim()) { titulo.focus(); return; }
    var dados = { titulo: titulo.value.trim().slice(0, 160), texto: $('#av-texto').value.trim().slice(0, 2000) || null, publicado: $('#av-publicado').checked };
    var id = $('#av-id').value;
    AC.ocupado(btn, true, 'Salvando…');
    (id ? sb().from('avisos').update(dados).eq('id', id) : sb().from('avisos').insert(dados)).then(ok)
      .then(function () { limpar(); ADM.msg('Aviso salvo.', 'ok'); return carregar(); })
      .catch(ADM.falha).then(function () { AC.ocupado(btn, false); });
  }

  ADM.registrar('avisos', {
    iniciar: function () {
      $('#form-aviso').addEventListener('submit', salvar);
      $('#limpar-aviso').addEventListener('click', limpar);
    },
    mostrar: function () { carregar().catch(ADM.falha); }
  });
})();
