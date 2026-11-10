/*
  /academiadevirtudes/aluno/completar/
  Tela obrigatória para quem está logado com o cadastro incompleto (ex.: entrou por convite).
  Mostra os dados que já existem, pede o que falta e só libera a Área do Aluno quando o banco
  confirma cadastro_completo(). O CPF só aparece se ainda estiver vazio.
*/
(function () {
  'use strict';

  var AC = window.AC;
  var A = window.AcademiaAuth;
  var C = window.AcademiaCampos;
  var CFG = window.ACADEMIA_CONFIG;
  var $ = AC.$;
  var msg = $('#msg');
  var perfil = null;

  AC.mascaraWhatsapp($('#whatsapp'));
  C.mascaraCpf($('#cpf'));

  var CAMPOS = [
    [$('#nome'), C.erroTexto('nome')],
    [$('#sobrenome'), C.erroTexto('sobrenome')],
    [$('#whatsapp'), C.erroWhatsapp],
    [$('#cpf'), C.erroCpf],
    [$('#empresa'), C.erroTexto('empresa')],
    [$('#cargo'), C.erroTexto('cargo')]
  ];
  C.ligarCorrecao(CAMPOS);

  function destino() { return AC.destinoSeguro(AC.parametro('voltar'), CFG.rotas.aluno); }

  A.proteger({ paginaCompletar: true }).then(function (ctx) {
    perfil = ctx.perfil;
    if (perfil.role === 'admin') { A.irPara(CFG.rotas.admin); return; }
    return A.cadastroCompleto().then(function (completo) {
      if (completo) { A.irPara(destino()); return; }
      $('#nome').value = perfil.nome || '';
      $('#sobrenome').value = perfil.sobrenome || '';
      $('#whatsapp').value = perfil.whatsapp ? C.formatarWhatsapp(perfil.whatsapp) : '';
      $('#empresa').value = perfil.empresa || '';
      $('#cargo').value = perfil.cargo || '';
      // CPF já preenchido não se troca pela tela (o banco também não deixa).
      $('#campo-cpf').hidden = !!perfil.cpf;
      ligarSair();
      AC.liberar();
      var primeiro = CAMPOS.filter(function (p) { return !p[0].closest('[hidden]') && p[1](p[0].value); })[0];
      setTimeout(function () { (primeiro ? primeiro[0] : $('#nome')).focus(); }, 30);
    });
  }).catch(function (err) {
    AC.liberar();
    AC.mensagem(msg, A.mensagemErro(err), 'erro');
  });

  function ligarSair() {
    AC.$$('[data-sair]').forEach(function (b) {
      b.addEventListener('click', function () {
        AC.ocupado(b, true, 'Saindo…');
        A.sair(false).then(function () { A.irPara(CFG.rotas.entrar); });
      });
    });
  }

  $('#form-completar').addEventListener('submit', function (e) {
    e.preventDefault();
    AC.mensagem(msg, '');
    if (!perfil || !C.validar(CAMPOS)) return;
    var dados = {
      nome: C.limparTexto($('#nome').value),
      sobrenome: C.limparTexto($('#sobrenome').value),
      whatsapp: C.whatsappDigitos($('#whatsapp').value),
      empresa: C.limparTexto($('#empresa').value),
      cargo: C.limparTexto($('#cargo').value)
    };
    if (!perfil.cpf) dados.cpf = C.soDigitos($('#cpf').value);
    var btn = $('#btn-completar');
    AC.ocupado(btn, true, 'Salvando…');
    A.cliente().from('profiles').update(dados).eq('id', perfil.id).select('id').then(function (r) {
      if (r.error) throw r.error;
      if (!r.data || !r.data.length) throw {};
      Object.assign(perfil, dados);
      return A.cadastroCompleto();
    }).then(function (completo) {
      if (completo) { A.irPara(destino()); return; }
      AC.ocupado(btn, false);
      AC.mensagem(msg, 'Ainda falta algum dado. Confira os campos e tente de novo.', 'erro');
    }).catch(function (err) {
      AC.ocupado(btn, false);
      AC.mensagem(msg, A.mensagemErro(err), 'erro');
    });
  });
})();
