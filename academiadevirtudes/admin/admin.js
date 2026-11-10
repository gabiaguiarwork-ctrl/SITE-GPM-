/*
  /academiadevirtudes/admin/  · base do painel
  Abas, mensagens, chamadas às Edge Functions, uploads e utilitários comuns.
  Cada aba fica no seu arquivo (alunos.js, encontros.js, avisos.js, relatorios.js) e se registra aqui.
  Tudo o que o painel lê e grava passa pela RLS (só admin com MFA consegue).
*/
(function () {
  'use strict';

  var AC = window.AC;
  var A = window.AcademiaAuth;
  var $ = AC.$;
  var abas = {};

  var ADM = {
    estado: { perfil: null, modulos: [], conteudos: [], alunos: [], progresso: [] },
    sb: function () { return A.cliente(); },

    registrar: function (nome, modulo) { abas[nome] = modulo; },
    abas: function () { return abas; },

    msg: function (texto, tipo) {
      var el = $('#msg-admin');
      AC.mensagem(el, texto, tipo || 'ok');
      if (texto) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
    falha: function (err) { ADM.msg(ADM.textoErro(err), 'erro'); },
    textoErro: function (err) {
      if (err && err.mensagemPainel) return err.mensagemPainel;
      if (err && (err.code === '42501' || /row-level security|permission denied/i.test(err.message || ''))) {
        return 'Sem permissão. Confirme que você entrou com a verificação em duas etapas.';
      }
      if (err && err.code === '23514') return 'Algum campo está num formato não aceito. Confira e tente de novo.';
      return A.mensagemErro(err);
    },

    // Edge Function com o token da sessão (o servidor confere admin + MFA).
    chamar: function (nome, corpo) {
      return ADM.sb().functions.invoke(nome, { body: corpo }).then(function (r) {
        if (!r.error) return r.data;
        var ctx = r.error.context;
        if (ctx && typeof ctx.json === 'function') {
          return ctx.json().catch(function () { return {}; }).then(function (j) {
            throw { mensagemPainel: (j && j.erro) || 'Não foi possível concluir a ação.' };
          });
        }
        throw { mensagemPainel: 'Não foi possível falar com o servidor. Verifique a conexão.' };
      });
    },

    confirmar: function (texto) { return window.confirm(texto); },

    // "Encontro 1: Aula!" → "encontro-1-aula"
    slug: function (t) {
      return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'arquivo';
    },

    // Upload com validação de tipo, tamanho e assinatura do arquivo.
    enviarArquivo: function (bucket, caminho, arquivo, tipos, maxBytes) {
      if (tipos.indexOf(arquivo.type) < 0) return Promise.reject({ mensagemPainel: 'Tipo de arquivo não aceito.' });
      if (arquivo.size > maxBytes) return Promise.reject({ mensagemPainel: 'Arquivo grande demais (máximo ' + Math.round(maxBytes / 1048576) + ' MB).' });
      return arquivo.slice(0, 12).arrayBuffer().then(function (buf) {
        var b = new Uint8Array(buf);
        var ok = arquivo.type === 'application/pdf' ? (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46)
          : arquivo.type === 'image/png' ? (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47)
          : arquivo.type === 'image/jpeg' ? (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF)
          : arquivo.type === 'image/webp' ? (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50)
          : false;
        if (!ok) throw { mensagemPainel: 'O conteúdo do arquivo não corresponde ao tipo informado.' };
        return ADM.sb().storage.from(bucket).upload(caminho, arquivo, { contentType: arquivo.type, upsert: false, cacheControl: '3600' });
      }).then(function (r) {
        if (r.error) throw r.error;
        return caminho;
      });
    },
    removerArquivo: function (bucket, caminho) {
      if (!caminho) return Promise.resolve();
      return ADM.sb().storage.from(bucket).remove([caminho]).then(function () {}, function () {});
    },

    /* ---------- Datas (horário de Brasília) ---------- */
    paraInputData: function (iso) {
      if (!iso) return '';
      var p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(new Date(iso)).reduce(function (o, x) { o[x.type] = x.value; return o; }, {});
      return p.year + '-' + p.month + '-' + p.day + 'T' + p.hour + ':' + p.minute;
    },
    deInputData: function (v) {
      if (!v || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
      return v + ':00-03:00'; // Brasília, sem horário de verão desde 2019
    },

    /* ---------- CSV ---------- */
    csv: function (nomeArquivo, linhas) {
      var seguro = function (v) {
        var s = v === null || v === undefined ? '' : String(v);
        if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // evita fórmula ao abrir no Excel
        return '"' + s.replace(/"/g, '""') + '"';
      };
      var texto = '﻿' + linhas.map(function (l) { return l.map(seguro).join(';'); }).join('\r\n');
      var url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }));
      var a = AC.h('a', { href: '#', download: nomeArquivo });
      a.setAttribute('href', url);
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
    },
    lerCsv: function (texto) {
      var linhas = String(texto).replace(/^﻿/, '').split(/\r?\n/).filter(function (l) { return l.trim(); });
      if (!linhas.length) return [];
      var sep = (linhas[0].match(/;/g) || []).length > (linhas[0].match(/,/g) || []).length ? ';' : ',';
      var partir = function (l) {
        var out = [], cur = '', aspas = false;
        for (var i = 0; i < l.length; i++) {
          var ch = l[i];
          if (aspas) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') aspas = false; else cur += ch; }
          else if (ch === '"') aspas = true;
          else if (ch === sep) { out.push(cur.trim()); cur = ''; }
          else cur += ch;
        }
        out.push(cur.trim());
        return out;
      };
      var cab = partir(linhas[0]).map(function (c) { return ADM.slug(c).replace(/-/g, ''); });
      var col = function (nomes) { for (var i = 0; i < nomes.length; i++) { var k = cab.indexOf(nomes[i]); if (k >= 0) return k; } return -1; };
      var iNome = col(['nome', 'nomecompleto', 'name']), iEmail = col(['email', 'e-mail', 'mail']), iWpp = col(['whatsapp', 'telefone', 'celular', 'fone']);
      var iSobrenome = col(['sobrenome', 'ultimonome', 'lastname']);
      var iEmp = col(['empresa', 'company']), iCargo = col(['cargo', 'funcao']);
      if (iNome < 0 || iEmail < 0) return null;
      return linhas.slice(1).map(function (l) {
        var c = partir(l);
        return { nome: c[iNome] || '', sobrenome: iSobrenome >= 0 ? c[iSobrenome] || '' : '', email: (c[iEmail] || '').toLowerCase(), whatsapp: iWpp >= 0 ? c[iWpp] || '' : '', empresa: iEmp >= 0 ? c[iEmp] || '' : '', cargo: iCargo >= 0 ? c[iCargo] || '' : '' };
      });
    },

    /* ---------- Dados compartilhados entre abas ---------- */
    carregarConteudo: function () {
      return Promise.all([
        ADM.sb().from('modulos').select('*').order('ordem').order('titulo'),
        ADM.sb().from('conteudos').select('*').order('ordem').order('titulo')
      ]).then(function (r) {
        if (r[0].error) throw r[0].error;
        if (r[1].error) throw r[1].error;
        ADM.estado.modulos = r[0].data;
        ADM.estado.conteudos = r[1].data;
      });
    },
    carregarAlunos: function () {
      return Promise.all([
        ADM.sb().from('profiles').select('id, nome, sobrenome, email, whatsapp, cpf, empresa, cargo, role, ativo, criado_em, ultimo_acesso, aceite_privacidade_em, aceite_privacidade_versao, aceite_comunicacoes, aceite_comunicacoes_em').order('nome'),
        ADM.sb().from('progresso').select('aluno_id, conteudo_id, concluido, posicao_seg, atualizado_em'),
        // Dados que ficam na conta (auth.users): e-mail confirmado, convite e cadastro completo.
        ADM.sb().rpc('admin_contas')
      ]).then(function (r) {
        if (r[0].error) throw r[0].error;
        if (r[1].error) throw r[1].error;
        if (r[2].error) throw r[2].error;
        var contas = {};
        (r[2].data || []).forEach(function (c) { contas[c.id] = c; });
        ADM.estado.alunos = r[0].data.map(function (a) {
          var c = contas[a.id] || {};
          a.email_confirmado_em = c.email_confirmado_em || null;
          a.origem = c.convidado_em ? 'convite' : 'cadastro';
          a.cadastro_completo = c.cadastro_completo === true;
          return a;
        });
        ADM.estado.progresso = r[1].data;
      });
    },
    nomeCompleto: function (a) { return [a.nome, a.sobrenome].filter(Boolean).join(' '); },
    // Conteúdos que contam para o progresso: publicados, em encontro publicado e liberado.
    conteudosValidos: function () {
      var mods = {};
      ADM.estado.modulos.forEach(function (m) { mods[m.id] = m; });
      return ADM.estado.conteudos.filter(function (c) {
        var m = mods[c.modulo_id];
        return c.publicado && m && m.publicado && window.AcademiaConteudo.liberado(m);
      });
    },
    statusAluno: function (a) {
      if (!a.ativo) return { id: 'inativo', texto: 'Inativo' };
      if (a.origem === 'convite' && !a.ultimo_acesso && !a.aceite_privacidade_em) return { id: 'pendente', texto: 'Convite pendente' };
      if (a.origem === 'cadastro' && !a.email_confirmado_em) return { id: 'confirmacao', texto: 'Aguardando confirmação' };
      if (a.role !== 'admin' && !a.cadastro_completo) return { id: 'incompleto', texto: 'Cadastro incompleto' };
      return { id: 'ativo', texto: 'Ativo' };
    },

    /* ---------- Abas ---------- */
    mostrarAba: function (nome, foco) {
      if (!abas[nome]) nome = 'alunos';
      AC.$$('.ac-aba').forEach(function (b) {
        var sel = b.id === 'aba-' + nome;
        b.setAttribute('aria-selected', sel ? 'true' : 'false');
        b.tabIndex = sel ? 0 : -1;
        if (sel && foco) b.focus();
      });
      AC.$$('.ac-painel').forEach(function (p) { p.hidden = p.id !== 'painel-' + nome; });
      if (location.hash !== '#' + nome) history.replaceState(null, '', '#' + nome);
      AC.mensagem($('#msg-admin'), '');
      if (abas[nome].mostrar) abas[nome].mostrar();
    }
  };

  // Teclado nas abas (setas, Home, End)
  document.addEventListener('DOMContentLoaded', function () {
    var lista = AC.$$('.ac-aba');
    lista.forEach(function (b, i) {
      b.addEventListener('click', function () { ADM.mostrarAba(b.id.replace('aba-', '')); });
      b.addEventListener('keydown', function (e) {
        var j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: lista.length - 1 }[e.key];
        if (j === undefined) return;
        e.preventDefault();
        var alvo = lista[(j + lista.length) % lista.length];
        ADM.mostrarAba(alvo.id.replace('aba-', ''), true);
      });
    });
    AC.$$('[data-fechar]').forEach(function (b) {
      b.addEventListener('click', function () { $('#' + b.getAttribute('data-fechar')).hidden = true; });
    });
  });

  window.AcademiaAdmin = ADM;
})();
