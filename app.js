/* Contas: painel de contas a pagar. Os dados reais vêm só do servidor (atrás do PIN). Este arquivo é público. */
(function () {
  'use strict';
  var API = window.CONTAS_API || '';
  var DEMO = /[?&]demo=1/.test(location.search);
  var LS = { tok: 'contas_tok', cache: 'contas_cache', fila: 'contas_fila', pinlen: 'contas_pinlen' };

  // ---------- utilidades ----------
  function $(s, el) { return (el || document).querySelector(s); }
  function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function parse(s) { var p = String(s).slice(0, 10).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function hojeD() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function hoje() { return iso(new Date()); }
  function dias(a, b) { return Math.round((parse(b) - parse(a)) / 864e5); }
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var MES3 = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  var SEM = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  function brl(v) { return v == null || isNaN(v) ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function brl0(v) { return v == null ? '—' : 'R$ ' + Math.round(v).toLocaleString('pt-BR'); }
  function dm(s) { var d = parse(s); return pad2(d.getDate()) + '/' + MES3[d.getMonth()]; }
  function uuid() { return 'op' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }

  var MARCAS = {
    aluguel: { ab: 'SR', bg: 'linear-gradient(135deg,#5b7cfa,#3a4fd6)', nome: 'Aluguel' },
    condominio: { ab: 'ZG', bg: 'linear-gradient(135deg,#9a7bff,#6a4ae0)', nome: 'Condomínio' },
    enel: { ab: 'EN', bg: 'linear-gradient(135deg,#22c08a,#0d8a63)', nome: 'Luz' },
    comgas: { ab: 'CG', bg: 'linear-gradient(135deg,#2a8de0,#1559a8)', nome: 'Gás' },
    claro: { ab: 'CL', bg: 'linear-gradient(135deg,#ef3b2d,#b51a12)', nome: 'Internet' },
    porto: { ab: 'PB', bg: 'linear-gradient(135deg,#1fb6ff,#0a74c2)', nome: 'Cartão' },
    xp: { ab: 'XP', bg: 'linear-gradient(135deg,#3a3a3a,#111)', nome: 'Cartão' },
    btg: { ab: 'BTG', bg: 'linear-gradient(135deg,#2c5bc9,#0c2a6b)', nome: 'Cartão' },
    nubank: { ab: 'NU', bg: 'linear-gradient(135deg,#9b2fe6,#6a0bb0)', nome: 'Cartão' }
  };
  function marca(f) { return MARCAS[f] || { ab: (f || '?').slice(0, 2).toUpperCase(), bg: '#555', nome: '' }; }
  function logo(it) { var m = marca(it.fonte); return '<span class="logo" style="background:' + m.bg + '"' + (m.ab === 'XP' ? ' data-xp' : '') + ' aria-hidden="true">' + esc(m.ab) + '</span>'; }

  // ---------- estado ----------
  var S = lsGet(LS.cache, null);          // {snapshot, marcas, atualizadoEm}
  var fila = lsGet(LS.fila, []);          // marcações ainda não confirmadas pelo servidor
  var tab = 'pend', calMes = null, calSel = null, aberto = null;

  function marcasEfetivas() {
    var m = {}, base = (S && S.marcas) || {};
    for (var k in base) m[k] = base[k];
    fila.forEach(function (op) { m[op.id] = { pago: op.pago, data: op.data, quando: op.quando, local: true }; });
    return m;
  }
  function itens(comPrevistos) {
    var c = (S && S.snapshot && S.snapshot.contas) || [], m = marcasEfetivas();
    return c.filter(function (it) { return comPrevistos || !it.previsto; }).map(function (it) {
      var x = {}; for (var k in it) x[k] = it[k];
      var mk = m[it.id];
      if (mk) { x.pagoEm = mk.pago ? mk.data : null; x.marcaLocal = !!mk.local; }
      else x.pagoEm = it.pago ? String(it.pago).slice(0, 10) : null;
      return x;
    });
  }

  // ---------- API ----------
  function api(q) {
    if (DEMO) return demoApi(q);
    var ctl = window.AbortController ? new AbortController() : null;
    var t = ctl && setTimeout(function () { ctl.abort(); }, 40000);
    return fetch(API, { method: 'POST', body: JSON.stringify(q), redirect: 'follow', signal: ctl && ctl.signal })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (t) clearTimeout(t); return j; }, function (e) { if (t) clearTimeout(t); throw e; });
  }
  function tok() { return lsGet(LS.tok, null); }

  var ultimaConfirmacao = 0, avaria = [];
  function carregar(manual) {
    var b = $('#btnSync'), t0; b.classList.add('spin');
    return enviarFila().then(function () {
      t0 = Date.now();
      return api({ acao: 'dados', token: tok() });
    }).then(function (j) {
      if (!j.ok) { if (j.codigo === 'sessao') return sairLocal(); throw new Error(j.erro || 'erro'); }
      if (ultimaConfirmacao > t0 || fila.length) { b.classList.remove('spin'); return carregar(manual); }
      avaria = j.avaria || [];
      S = { snapshot: j.snapshot || (S && S.snapshot) || null, marcas: j.marcas || {}, atualizadoEm: j.atualizadoEm };
      lsSet(LS.cache, S); render();
      if (manual) toast('Atualizado');
    }).catch(function () {
      if (manual) toast('Sem conexão — mostrando a última versão');
      render();
    }).then(function () { b.classList.remove('spin'); });
  }

  var enviando = false;
  function enviarFila() {
    if (enviando || !fila.length) return Promise.resolve();
    enviando = true;
    var op = fila[0];
    return api({ acao: 'marcar', token: tok(), id: op.id, pago: op.pago, data: op.data, opId: op.opId }).then(function (j) {
      enviando = false;
      if (!j.ok) {
        if (j.codigo === 'sessao') { sairLocal(); return; }
        if (j.codigo === 'invalido') { fila.shift(); lsSet(LS.fila, fila); toast('Servidor recusou: ' + (j.erro || 'erro')); return enviarFila(); }
        agendarReenvio(); return;              // ocupado / erro interno: tenta de novo daqui a pouco
      }
      fila.shift(); lsSet(LS.fila, fila); ultimaConfirmacao = Date.now();
      if (S) { S.marcas = j.marcas || S.marcas; lsSet(LS.cache, S); }
      return enviarFila();
    }, function () { enviando = false; agendarReenvio(); });
  }
  var tRe = null, espera = 5000;
  function agendarReenvio() {
    if (tRe) return;
    tRe = setTimeout(function () { tRe = null; espera = Math.min(espera * 2, 120000); enviarFila().then(function () { if (!fila.length) espera = 5000; render(); }); }, espera);
  }

  function marcar(it, pago, data) {
    var op = { id: it.id, pago: pago, data: data || hoje(), quando: new Date().toISOString(), opId: uuid() };
    fila.push(op); lsSet(LS.fila, fila);
    render();
    enviarFila().then(render);
    return op;
  }

  // ---------- classificação ----------
  function classificar() {
    var h = hoje(), all = itens(), r = { atr: [], hoje: [], amanha: [], semana: [], depois: [], pagas: [], naoPague: [] };
    all.forEach(function (it) {
      if (it.naoPague) { if (!it.vencimento || dias(it.vencimento, h) <= 45) r.naoPague.push(it); return; }
      if (it.pagoEm) { r.pagas.push(it); return; }
      if (!it.vencimento) { r.depois.push(it); return; }
      var d = dias(h, it.vencimento);
      if (d < 0) r.atr.push(it);
      else if (d === 0) r.hoje.push(it);
      else if (d === 1) r.amanha.push(it);
      else if (d <= 7) r.semana.push(it);
      else r.depois.push(it);
    });
    function ord(a, b) { return (a.vencimento || '9') < (b.vencimento || '9') ? -1 : (a.vencimento || '9') > (b.vencimento || '9') ? 1 : 0; }
    for (var k in r) r[k].sort(ord);
    r.pagas.reverse();
    return r;
  }
  function soma(l) { return l.reduce(function (s, it) { return s + (it.valor || 0); }, 0); }

  // ---------- render ----------
  function render() {
    if (!S || !S.snapshot) { renderVazio(); return; }
    var c = classificar(), h = hojeD(), mes = iso(h).slice(0, 7);
    $('#hoje').textContent = SEM[h.getDay()].charAt(0).toUpperCase() + SEM[h.getDay()].slice(1) + ', ' + h.getDate() + ' de ' + MESES[h.getMonth()];

    // robô
    var rb = S.snapshot.robo || {}, chip = $('#robo'), quando = rb.ultimaLeitura || S.snapshot.geradoEm, idade = quando ? (Date.now() - new Date(String(quando).replace(' ', 'T'))) / 6e4 : 1e9;
    chip.className = 'chip' + (rb.leitorOk === false || idade > 26 * 60 ? ' bad' : idade > 3 * 60 ? ' warn' : '');
    $('#roboTx').textContent = idade < 1e8 ? 'robô ' + idadeTx(idade) : 'sem dados';

    // total a pagar
    var abertas = c.atr.concat(c.hoje, c.amanha, c.semana, c.depois), tot = soma(abertas);
    var semValor = abertas.filter(function (i) { return i.valor == null; }).length;
    $('#heroV').textContent = abertas.length ? brl(tot) : 'Nada a pagar';
    var sub = abertas.length ? abertas.length + (abertas.length === 1 ? ' conta' : ' contas') : 'Tudo em dia';
    if (c.atr.length) sub += ' · <b>' + c.atr.length + ' atrasada' + (c.atr.length > 1 ? 's' : '') + '</b>';
    if (semValor) sub += ' · ' + semValor + ' sem valor no e-mail (cartão: veja no app)';
    $('#heroS').innerHTML = sub;

    // alertas
    var al = '';
    c.naoPague.forEach(function (it) { al += '<button class="alert" data-open="' + esc(it.id) + '" style="width:100%;text-align:left"><span>⛔</span><span><b>Não pague:</b> ' + esc(it.nome) + ' ' + brl(it.valor) + ' — ' + esc(it.naoPague) + '</span></button>'; });
    (rb.avisos || []).forEach(function (a) { al += '<div class="alert warn"><span>⚠️</span><span>' + esc(a) + '</span></div>'; });
    if (avaria.length) al += '<div class="alert warn"><span>🛠️</span><span>O servidor achou dados danificados e se recuperou sozinho. Confira as últimas marcações.</span></div>';
    if (fila.length) al += '<div class="alert warn"><span>⏳</span><span><b>' + fila.length + ' marcação(ões)</b> ainda não chegaram ao servidor. Reenvio sozinho quando tiver internet.</span></div>';
    $('#alerts').innerHTML = al;

    $('#tab-pend').innerHTML = renderPend(c);
    $('#tab-cal').innerHTML = tab === 'cal' ? renderCal() : '';
    ligarLinhas();
    renderAvisos();
    if (aberto) { var it = itens(true).filter(function (i) { return i.id === aberto; })[0]; if (it) $('#sheetBody').innerHTML = renderSheet(it); }
  }

  function renderVazio() {
    $('#tab-pend').innerHTML = '<div class="empty"><div class="e">📭</div><b>Ainda sem dados</b>O robô envia as contas na próxima rodada (de hora em hora, das 8h às 21h).</div>';
  }
  function idadeTx(min) { if (min < 2) return 'agora'; if (min < 60) return 'há ' + Math.round(min) + ' min'; if (min < 48 * 60) return 'há ' + Math.round(min / 60) + ' h'; return 'há ' + Math.round(min / 1440) + ' dias'; }
  function quandoTx(v) { var d = dias(hoje(), v); if (d < 0) return 'Venceu há ' + (-d) + (d === -1 ? ' dia' : ' dias'); if (d === 0) return 'Vence hoje'; if (d === 1) return 'Vence amanhã'; return 'Vence ' + SEM[parse(v).getDay()] + ', ' + dm(v); }
  function anel(p) {
    var r = 50, C = 2 * Math.PI * r, off = C * (1 - Math.max(0, Math.min(1, p)));
    return '<svg viewBox="0 0 120 120" aria-hidden="true"><defs><linearGradient id="gr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--ok)"/><stop offset="1" stop-color="var(--acc)"/></linearGradient></defs>' +
      '<circle cx="60" cy="60" r="' + r + '" fill="none" stroke="var(--line)" stroke-width="11"/>' +
      '<circle cx="60" cy="60" r="' + r + '" fill="none" stroke="url(#gr)" stroke-width="11" stroke-linecap="round" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" style="transition:stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)"/></svg>';
  }

  function linha(it, modo) {
    var d = it.vencimento ? dias(hoje(), it.vencimento) : null, dc = '', dt = '';
    if (modo === 'pago') { dc = 'ok'; dt = 'pago ' + (it.pagoEm ? dm(it.pagoEm) : ''); }
    else if (d == null) dt = 'sem data';
    else if (d < 0) { dc = 'bad'; dt = 'há ' + (-d) + 'd'; }
    else if (d === 0) { dc = 'warn'; dt = 'hoje'; }
    else if (d === 1) { dc = 'warn'; dt = 'amanhã'; }
    else if (d <= 7) { dt = 'D-' + d; }
    else dt = dm(it.vencimento);
    var tags = '';
    if (it.previsto && d != null && d < 0 && modo !== 'pago') tags += '<span class="tag warn">não chegou</span>';
    else if (it.previsto) tags += '<span class="tag">previsto</span>';
    if (it.alerta) tags += '<span class="tag bad">confira</span>';
    else if (it.codigo) tags += '<span class="tag info">' + (it.tipoCodigo === 'pix' ? 'Pix' : 'boleto') + '</span>';
    else if (it.categoria === 'cartao') tags += '<span class="tag">pagar no app</span>';
    if (it.marcaLocal) tags += '<span class="tag warn">enviando</span>';
    var sub = it.vencimento ? SEM[parse(it.vencimento).getDay()].slice(0, 3) + ' ' + dm(it.vencimento) : '';
    if (it.minimo && modo !== 'pago') sub += ' · mín. ' + brl0(it.minimo);
    var val = it.valor == null ? '<span class="v est">ver no app</span>' : '<span class="v num' + (it.previsto ? ' est' : '') + '">' + (it.previsto ? '≈ ' : '') + brl(it.valor) + '</span>';
    return '<div class="row' + (modo === 'pago' ? ' paid' : '') + (it.previsto ? ' prev' : '') + '" data-id="' + esc(it.id) + '">' +
      '<div class="under' + (modo === 'pago' ? ' undo' : '') + '">' + (modo === 'pago' ? 'Desmarcar ↺' : '✓ Paguei') + '</div>' +
      '<div class="face" role="button" tabindex="0" aria-label="' + esc(it.nome + ', ' + brl(it.valor) + ', ' + (it.vencimento ? quandoTx(it.vencimento) : '')) + '">' + logo(it) +
      '<div class="mid"><div class="t">' + esc(it.nome) + '</div><div class="m">' + tags + '<span>' + sub + '</span></div></div>' +
      '<div class="rgt">' + val + '<div class="d ' + dc + '">' + dt + '</div></div>' +
      '<button class="check" data-check aria-label="' + (modo === 'pago' ? 'Desmarcar pagamento' : 'Marcar como paga') + '"><i><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></i></button>' +
      '</div></div>';
  }
  function grupo(titulo, l, cls, extra) {
    if (!l.length) return '';
    var tv = l.some(function (i) { return i.valor != null; }) ? brl(soma(l)) : '';
    return '<div class="grp ' + (cls || '') + '"><h2>' + titulo + ' <span class="s num">' + tv + '</span></h2>' + (extra || '') + '<div class="list">' + l.map(function (i) { return linha(i); }).join('') + '</div></div>';
  }
  function renderPend(c) {
    var n = c.atr.length + c.hoje.length + c.amanha.length + c.semana.length + c.depois.length;
    if (!n) return '<div class="empty"><div class="e">🎉</div><b>Tudo pago</b>Quando chegar conta nova, ela aparece aqui.</div>';
    var bulk = c.atr.length > 1 ? '<div style="display:flex;padding:0 4px 8px;margin-top:-4px"><span style="font-size:13px;color:var(--tx3)">Conta já paga e que o robô não tem como saber? Marque aqui.</span><button class="bulk" data-bulk>Já paguei todas</button></div>' : '';
    return grupo('Atrasadas', c.atr, 'bad', bulk) + grupo('Hoje', c.hoje, 'hoje') + grupo('Amanhã', c.amanha, 'hoje') + grupo('Próximos 7 dias', c.semana) + grupo('Depois', c.depois);
  }
  function renderPagas(l) {
    if (!l.length) return '<div class="empty"><div class="e">🧾</div><b>Nada pago ainda</b>Contas marcadas como pagas aparecem aqui.</div>';
    var por = {}, ord = [];
    l.forEach(function (it) { var k = (it.vencimento || it.pagoEm || '').slice(0, 7); if (!por[k]) { por[k] = []; ord.push(k); } por[k].push(it); });
    ord.sort().reverse();
    return ord.map(function (k) {
      var p = k.split('-'), t = MESES[+p[1] - 1] + ' ' + p[0];
      return '<div class="grp"><h2>' + t + ' <span class="s num">' + brl(soma(por[k])) + '</span></h2><div class="list">' + por[k].map(function (i) { return linha(i, 'pago'); }).join('') + '</div></div>';
    }).join('');
  }
  function renderPrazos() {
    var p = ((S.snapshot && S.snapshot.prazos) || []).slice().sort(function (a, b) { return a.data < b.data ? -1 : 1; });
    if (!p.length) return '<div class="empty"><div class="e">📅</div><b>Sem prazos</b></div>';
    var h = hoje(), passados = p.filter(function (x) { return x.data < h; }), fut = p.filter(function (x) { return x.data >= h; });
    var l = passados.slice(-1).concat(fut);
    return '<div class="grp"><h2>Contrato, fiança e seguro</h2></div><div class="tl">' + l.map(function (x) {
      var d = dias(h, x.data), cls = d < 0 ? 'past' : d <= 30 ? 'soon' : '';
      var falta = d < 0 ? 'passou' : d === 0 ? 'hoje' : d < 60 ? 'em ' + d + ' dias' : 'em ' + Math.round(d / 30.4) + ' meses';
      var pd = parse(x.data);
      return '<div class="it ' + cls + '"><div class="dt">' + pd.getDate() + ' ' + MES3[pd.getMonth()] + ' ' + pd.getFullYear() + ' · ' + falta + '</div><div class="ti">' + esc(x.titulo) + '</div>' + (x.detalhe ? '<div class="de">' + esc(x.detalhe) + '</div>' : '') + '</div>';
    }).join('') + '</div>';
  }
  function corDe(it, hs) { return it.pagoEm ? 'var(--ok)' : it.previsto ? 'var(--tx3)' : it.vencimento < hs ? 'var(--bad)' : 'var(--warn)'; }
  function renderCal() {
    var h = hojeD(); if (!calMes) calMes = new Date(h.getFullYear(), h.getMonth(), 1);
    var y = calMes.getFullYear(), m = calMes.getMonth(), ini = new Date(y, m, 1), off = ini.getDay(), hs = iso(h);
    var porDia = {};
    itens(true).forEach(function (it) { if (it.vencimento && !it.naoPague) (porDia[it.vencimento] = porDia[it.vencimento] || []).push(it); });
    var g = '<div class="cal"><div class="hd"><button class="ibtn" data-cal="-1" aria-label="Mês anterior">‹</button><b>' + MESES[m] + ' ' + y + '</b><button class="ibtn" data-cal="1" aria-label="Próximo mês">›</button></div><div class="grid">';
    ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].forEach(function (w) { g += '<div class="wd">' + w + '</div>'; });
    for (var i = 0; i < 42; i++) {
      var d = new Date(y, m, 1 - off + i), k = iso(d), its = porDia[k] || [];
      if (i >= 35 && d.getMonth() !== m) break;
      var fora = d.getMonth() !== m;
      var chips = fora ? '' : its.slice(0, 3).map(function (it) {
        return '<i class="ch" style="--c:' + corDe(it, hs) + '">' + esc(marca(it.fonte).ab) + '</i>';
      }).join('') + (its.length > 3 && !fora ? '<i class="ch mais">+' + (its.length - 3) + '</i>' : '');
      g += '<button class="day' + (fora ? ' out' : '') + (its.length && !fora ? ' tem' : '') + (k === hs ? ' today' : '') + (k === calSel ? ' sel' : '') + '" data-day="' + k + '" aria-label="' + d.getDate() + ' de ' + MESES[d.getMonth()] + (its.length ? ': ' + its.map(function (x) { return x.nome; }).join(', ') : '') + '"><span class="n">' + d.getDate() + '</span><span class="chips">' + chips + '</span></button>';
    }
    g += '</div><div class="legend"><span><i style="background:var(--warn)"></i>a pagar</span><span><i style="background:var(--bad)"></i>atrasada</span><span><i style="background:var(--ok)"></i>paga</span><span><i style="background:var(--tx3)"></i>prevista</span></div></div>';

    // lista do mes, dia a dia (ou so o dia tocado)
    var mk = y + '-' + pad2(m + 1);
    var dias_ = Object.keys(porDia).filter(function (k) { return calSel ? k === calSel : k.slice(0, 7) === mk; }).sort();
    var doMes = [].concat.apply([], Object.keys(porDia).filter(function (k) { return k.slice(0, 7) === mk; }).map(function (k) { return porDia[k]; }));
    var falta = doMes.filter(function (x) { return !x.pagoEm; });
    g += '<div class="mesres"><span><b class="num">' + brl0(soma(doMes)) + '</b> em ' + MESES[m] + '</span><span>' + (falta.length ? 'falta <b class="num">' + brl0(soma(falta)) + '</b>' : 'tudo pago') + '</span></div>';
    if (calSel) g += '<button class="lk" data-day="' + calSel + '" style="display:block;margin:2px auto 0">Mostrar o mês inteiro</button>';
    if (!dias_.length) g += '<div class="empty" style="padding:22px">' + (calSel ? 'Nenhuma conta neste dia' : 'Nenhuma conta neste mês') + '</div>';
    dias_.forEach(function (k) {
      var l = porDia[k], dd = parse(k);
      g += '<div class="grp"><h2>' + SEM[dd.getDay()].slice(0, 3) + ', ' + dd.getDate() + ' de ' + MESES[dd.getMonth()] + ' <span class="s num">' + (l.some(function (x) { return x.valor != null; }) ? brl(soma(l)) : '') + '</span></h2><div class="list">' +
        l.map(function (x) { return linha(x, x.pagoEm ? 'pago' : null); }).join('') + '</div></div>';
    });
    return g;
  }

  // ---------- folha de detalhe ----------
  function renderSheet(it) {
    var m = marca(it.fonte), v = it.vencimento, wd = v ? parse(v).getDay() : null, h = '';
    h += '<div class="sh-hd">' + logo(it) + '<div><h3>' + esc(it.nome) + '</h3><p>' + esc(m.nome) + (it.recebido ? ' · chegou ' + dm(it.recebido) : '') + (it.previsto ? ' · ainda não chegou' : '') + '</p></div></div>';
    h += '<div class="sh-val num">' + (it.previsto ? '≈ ' : '') + (it.valor == null ? 'ver no app' : brl(it.valor)) + (it.minimo ? '<small>mín. ' + brl(it.minimo) + '</small>' : '') + '</div>';
    if (v) {
      h += '<div class="sh-due">' + (it.pagoEm ? '<b style="color:var(--ok)">Paga em ' + dm(it.pagoEm) + '</b> · ' : '') + 'Vencimento <b>' + SEM[wd] + ', ' + parse(v).getDate() + ' de ' + MESES[parse(v).getMonth()] + '</b>' + (it.pagoEm ? '' : ' · ' + quandoTx(v).toLowerCase()) + '</div>';
      if (!it.pagoEm && (wd === 0 || wd === 6) && it.codigo) h += '<div class="alert warn" style="margin-top:10px"><span>💡</span><span>Vence no fim de semana: boleto pode ser pago no próximo dia útil sem juros.</span></div>';
    }
    if (it.naoPague) h += '<div class="alert" style="margin-top:12px"><span>⛔</span><span><b>Não pague.</b> ' + esc(it.naoPague) + '</span></div>';
    if (it.alerta) h += '<div class="alert" style="margin-top:12px"><span>⚠️</span><span><b>Atenção.</b> ' + esc(it.alerta) + '</span></div>';
    if (it.previsto && v && dias(hoje(), v) < 0 && !it.pagoEm) h += '<div class="alert warn" style="margin-top:12px"><span>📭</span><span>Esta conta não chegou no e-mail. Confira no app do banco ou da empresa; se já pagou, marque aqui.</span></div>';
    if (it.codigo && !it.naoPague && !it.alerta) {
      var cod = it.tipoCodigo === 'linha' ? fmtLinha(it.codigo) : it.codigo;
      h += '<div class="box"><div class="k">' + (it.tipoCodigo === 'pix' ? 'Pix copia e cola' : 'Linha digitável') + '</div><div class="code">' + esc(cod) + '</div>' +
        '<button class="btn" data-copy="' + esc(it.codigo) + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2.5"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>Copiar ' + (it.tipoCodigo === 'pix' ? 'Pix' : 'código') + '</button></div>';
    }
    if (it.como || it.conferencia) {
      h += '<div class="box">' + (it.como ? '<div class="k">Como pagar</div><div style="font-size:15px">' + esc(it.como) + '</div>' : '') +
        (it.conferencia ? '<div class="k" style="margin-top:' + (it.como ? '12px' : '0') + '">Confira na tela do banco</div><div style="font-size:14.5px;color:var(--tx2)">' + esc(it.conferencia) + '</div>' : '') + '</div>';
    }
    var hist = ((S.snapshot.historico || {})[it.fonte] || []).filter(function (x) { return x.valor != null; });
    if (hist.length > 1) h += '<div class="box"><div class="k">Histórico · ' + esc(m.nome || it.fonte) + '</div>' + spark(hist, it.vencimento) +
      '<div class="hist">' + hist.slice(-6).reverse().map(function (x) { return '<span>' + MES3[parse(x.venc).getMonth()] + ' ' + parse(x.venc).getFullYear() + '</span><b class="num">' + brl(x.valor) + '</b>'; }).join('') + '</div></div>';
    if (!it.naoPague) {
      if (it.pagoEm) h += '<button class="btn sec" data-unpay>↺ Desmarcar pagamento</button>';
      else h += '<div class="paydate"><label for="pdata">Paguei em</label><input type="date" id="pdata" value="' + hoje() + '" max="' + hoje() + '"></div><button class="btn ok" data-pay><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>Marcar como paga</button>' +
        (it.previsto ? '<p class="hint">Esta conta ainda não chegou por e-mail. Marcar agora avisa o robô para não lembrar dela quando chegar.</p>' : '');
    }
    h += '<button class="btn sec" data-close>Fechar</button>';
    return h;
  }
  function fmtLinha(c) {
    c = String(c).replace(/\D/g, '');
    if (c.length === 47) return c.slice(0, 5) + '.' + c.slice(5, 10) + ' ' + c.slice(10, 15) + '.' + c.slice(15, 21) + ' ' + c.slice(21, 26) + '.' + c.slice(26, 32) + ' ' + c.slice(32, 33) + ' ' + c.slice(33);
    if (c.length === 48) return c.slice(0, 12) + ' ' + c.slice(12, 24) + ' ' + c.slice(24, 36) + ' ' + c.slice(36);
    return c;
  }
  function spark(hist, atual) {
    var W = 320, H = 84, P = 8, vs = hist.map(function (x) { return x.valor; }), mx = Math.max.apply(null, vs), mn = Math.min.apply(null, vs);
    if (mx === mn) { mx += 1; mn -= 1; }
    var pts = hist.map(function (x, i) { return [P + i * (W - 2 * P) / (hist.length - 1), H - P - (x.valor - mn) / (mx - mn) * (H - 2 * P - 10)]; });
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
    var area = d + ' L' + pts[pts.length - 1][0].toFixed(1) + ' ' + H + ' L' + pts[0][0].toFixed(1) + ' ' + H + ' Z';
    var dots = pts.map(function (p, i) { var cur = hist[i].venc === atual; return '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + (cur ? 5 : 3) + '" fill="' + (cur ? 'var(--acc)' : 'var(--card)') + '" stroke="var(--acc)" stroke-width="2"/>'; }).join('');
    return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--acc)" stop-opacity=".28"/><stop offset="1" stop-color="var(--acc)" stop-opacity="0"/></linearGradient></defs><path d="' + area + '" fill="url(#sg)"/><path d="' + d + '" fill="none" stroke="var(--acc)" stroke-width="2.2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>' + dots + '</svg>';
  }
  function abrir(id) {
    var it = itens().filter(function (i) { return i.id === id; })[0]; if (!it) return;
    aberto = id; $('#sheetBody').innerHTML = renderSheet(it);
    $('#sheet').classList.add('on'); $('#scrim').classList.add('on'); $('#sheet').scrollTop = 0;
  }
  function fechar() { aberto = null; $('#sheet').classList.remove('on'); $('#scrim').classList.remove('on'); }

  // ---------- copiar ----------
  function copiar(txt) {
    function ok() { toast('Copiado ✓ — cole no app do banco'); if (navigator.vibrate) navigator.vibrate(15); }
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(txt).then(ok, fallback);
    fallback();
    function fallback() {
      var ta = document.createElement('textarea'); ta.value = txt; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px';
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, txt.length);
      try { document.execCommand('copy'); ok(); } catch (e) { toast('Não consegui copiar — segure o código para selecionar'); }
      document.body.removeChild(ta);
    }
  }

  // ---------- toast ----------
  var tT;
  function toast(msg, desfazer) {
    $('#toastTx').textContent = msg;
    var b = $('#toastBtn'); b.classList.toggle('hide', !desfazer); b.onclick = function () { $('#toast').classList.remove('on'); desfazer(); };
    $('#toast').classList.add('on'); clearTimeout(tT); tT = setTimeout(function () { $('#toast').classList.remove('on'); }, desfazer ? 6000 : 2600);
  }

  function pagar(it, data) {
    marcar(it, true, data);
    toast('✓ Pago: ' + it.nome, function () { marcar(it, false); toast('Desfeito'); });
    if (navigator.vibrate) navigator.vibrate([10, 40, 10]);
  }
  function despagar(it) {
    marcar(it, false);
    toast('Pagamento desmarcado', function () { marcar(it, true, it.pagoEm); });
  }
  function porId(id) { return itens(true).filter(function (i) { return i.id === id; })[0]; }

  // ---------- gestos ----------
  function ligarLinhas() {
    $$('.row').forEach(function (row) {
      var face = $('.face', row), x0 = 0, y0 = 0, dx = 0, ativo = false, horiz = null, W = 0;
      row.addEventListener('pointerdown', function (e) {
        if (e.target.closest('[data-check]') || e.pointerType === 'mouse' && e.button !== 0) return;
        x0 = e.clientX; y0 = e.clientY; dx = 0; ativo = true; horiz = null; W = row.offsetWidth; delete row.dataset.swiped;
      });
      row.addEventListener('pointermove', function (e) {
        if (!ativo) return;
        var mx = e.clientX - x0, my = e.clientY - y0;
        if (horiz === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) { horiz = Math.abs(mx) > Math.abs(my) * 1.2 && mx > 0; if (horiz) { row.classList.add('dragging'); try { row.setPointerCapture(e.pointerId); } catch (er) { } } else ativo = false; }
        if (horiz) { dx = Math.max(0, mx); face.style.transform = 'translateX(' + (dx > W * .5 ? W * .5 + (dx - W * .5) * .25 : dx) + 'px)'; e.preventDefault(); }
      });
      function fim() {
        if (!ativo) return; ativo = false; row.classList.remove('dragging');
        if (horiz && dx > Math.min(120, W * .32)) {
          face.style.transform = 'translateX(' + W + 'px)';
          var it = porId(row.dataset.id);
          setTimeout(function () { if (it.pagoEm) despagar(it); else pagar(it); }, 180);
        } else { face.style.transform = ''; }
        if (horiz) { row.dataset.swiped = '1'; setTimeout(function () { delete row.dataset.swiped; }, 350); }
      }
      row.addEventListener('pointerup', fim); row.addEventListener('pointercancel', fim);
      face.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(row.dataset.id); } });
    });
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    var row = t.closest('.row');
    if (t.closest('[data-check]') && row) { e.stopPropagation(); var it = porId(row.dataset.id); if (it.pagoEm) despagar(it); else pagar(it); return; }
    if (row) { if (row.dataset.swiped) { delete row.dataset.swiped; return; } abrir(row.dataset.id); return; }
    var o = t.closest('[data-open]'); if (o) { abrir(o.getAttribute('data-open')); if (o.classList.contains('next')) { var it2 = porId(o.getAttribute('data-open')); if (it2 && it2.codigo && !it2.naoPague && !it2.alerta) copiar(it2.codigo); } return; }
    var tb = t.closest('[data-tab]'); if (tb) { tab = tb.dataset.tab; $$('[data-tab]').forEach(function (b) { b.setAttribute('aria-selected', b === tb); }); ['pend', 'cal'].forEach(function (k) { $('#tab-' + k).classList.toggle('hide', k !== tab); }); $('#hint').classList.toggle('hide', tab !== 'pend'); render(); window.scrollTo(0, 0); return; }
    var cm = t.closest('[data-cal]'); if (cm) { calMes = new Date(calMes.getFullYear(), calMes.getMonth() + (+cm.dataset.cal), 1); calSel = null; render(); return; }
    var dy = t.closest('[data-day]'); if (dy) { calSel = calSel === dy.dataset.day ? null : dy.dataset.day; render(); return; }
    var cp = t.closest('[data-copy]'); if (cp) { copiar(cp.getAttribute('data-copy')); return; }
    if (t.closest('[data-pay]')) { var a = porId(aberto); var dt = ($('#pdata') || {}).value || hoje(); if (dt > hoje()) dt = hoje(); fechar(); pagar(a, dt); return; }
    if (t.closest('[data-unpay]')) { var b = porId(aberto); fechar(); despagar(b); return; }
    if (t.closest('[data-close]') || t === $('#scrim')) { fechar(); return; }
    var pu = t.closest('[data-push]'); if (pu) { var a2 = pu.dataset.push; if (a2 === 'on') ligarAvisos(); else if (a2 === 'teste') testarAvisos(false); else desligarAvisos(); return; }
    var bk = t.closest('[data-bulk]');
    if (bk) {
      if (!bk.dataset.conf) { bk.dataset.conf = '1'; bk.textContent = 'Toque de novo para confirmar'; setTimeout(function () { if (bk.isConnected) { delete bk.dataset.conf; bk.textContent = 'Já paguei todas'; } }, 4000); return; }
      var l = classificar().atr; l.forEach(function (i) { marcar(i, true, i.vencimento < hoje() ? i.vencimento : hoje()); });
      toast(l.length + ' contas marcadas como pagas', function () { l.forEach(function (i) { marcar(i, false); }); });
    }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') fechar(); });
  $('#btnSync').addEventListener('click', function () { carregar(true); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && tok()) { carregar(false); manterAvisos(); } });
  window.addEventListener('online', function () { if (tok()) carregar(false); });

  // ---------- avisos no aparelho (Web Push, igual à Tribuna) ----------
  var LS_PUSH = 'contas_push';
  function pushPode() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }
  function ehIOS() { return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  function instalado() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; }
  function b64Bytes(b) {
    var s = atob(b.replace(/-/g, '+').replace(/_/g, '/') + '===='.slice((b.length % 4) || 4));
    var o = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) o[i] = s.charCodeAt(i); return o;
  }
  function mesmaChave(sub, chave) {
    try {
      var cur = sub.options && sub.options.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null, w = b64Bytes(chave);
      if (!cur || cur.length !== w.length) return false;
      for (var i = 0; i < w.length; i++) if (cur[i] !== w[i]) return false;
      return true;
    } catch (e) { return false; }
  }
  function nomeAparelho() { return ehIOS() ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'Android' : /Windows/.test(navigator.userAgent) ? 'PC' : 'Navegador'; }

  function renderAvisos() {
    var el = $('#avisos'); if (!el) return;
    var h = '';
    if (!pushPode()) {
      h = ehIOS() && !instalado()
        ? '<p class="av"><b>🔔 Avisos no iPhone:</b> toque em Compartilhar (□↑) → <b>Adicionar à Tela de Início</b> e abra o Contas pelo ícone. Aí aparece o botão para ligar.</p>'
        : '<p class="av">🔔 Este navegador não mostra notificações. No iPhone, precisa do iOS 16.4 ou mais novo.</p>';
    } else if (Notification.permission === 'denied') {
      h = '<p class="av">🔕 As notificações do Contas estão bloqueadas. ' + (ehIOS() ? 'Ajustes → Notificações → Contas → Permitir.' : 'Libere nas configurações do site (cadeado ao lado do endereço).') + '</p>';
    } else if (lsGet(LS_PUSH, null) && Notification.permission === 'granted') {
      h = '<p class="av">🔔 Avisos ligados neste aparelho · <button class="lk" data-push="teste">Testar</button> · <button class="lk" data-push="off">Desligar</button></p>';
    } else {
      h = '<button class="btn sec" data-push="on">🔔 Receber avisos neste aparelho</button>';
    }
    el.innerHTML = h;
  }

  function assinar(antigo) {
    var chave;
    return api({ acao: 'pushChave', token: tok() }).then(function (j) {
      if (!j.ok) throw new Error(j.erro || 'O servidor recusou.');
      chave = j.publicKey;
      return navigator.serviceWorker.ready;
    }).then(function (reg) {
      return reg.pushManager.getSubscription().then(function (sub) {
        if (sub && !mesmaChave(sub, chave)) return sub.unsubscribe().then(function () { return null; });
        return sub;
      }).then(function (sub) { return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64Bytes(chave) }); });
    }).then(function (sub) {
      return api({ acao: 'inscrever', token: tok(), sub: sub.toJSON(), nome: nomeAparelho(), antigo: antigo && antigo !== sub.endpoint ? antigo : undefined }).then(function (j) {
        if (!j.ok) throw new Error(j.erro || 'O servidor recusou.');
        lsSet(LS_PUSH, { endpoint: sub.endpoint }); return sub;
      });
    });
  }

  function ligarAvisos() {
    if (DEMO) { toast('No modo demonstração os avisos ficam desligados'); return; }
    // Pedir a permissão direto no toque: o iPhone recusa se vier depois de uma espera.
    Notification.requestPermission().then(function (p) {
      if (p !== 'granted') { renderAvisos(); toast('Sem permissão, não dá para avisar'); return; }
      toast('Ligando avisos…');
      return assinar().then(function () { renderAvisos(); toast('✓ Avisos ligados neste aparelho'); testarAvisos(true); });
    }).catch(function (e) { renderAvisos(); toast('Não consegui ligar: ' + (e && e.message ? e.message : 'erro')); });
  }

  function testarAvisos(silencioso) {
    var p = lsGet(LS_PUSH, null); if (!p) return;
    api({ acao: 'pushTeste', token: tok(), endpoint: p.endpoint }).then(function (j) {
      if (silencioso) return;
      toast(j.ok && j.enviados ? 'Aviso de teste enviado' : 'O aviso de teste não saiu. Desligue e ligue de novo.');
    }, function () { if (!silencioso) toast('Sem conexão'); });
  }

  function desligarAvisos() {
    var p = lsGet(LS_PUSH, null); lsDel(LS_PUSH); renderAvisos();
    navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (s) { if (s) s.unsubscribe(); }).catch(function () { });
    if (p) api({ acao: 'desinscrever', token: tok(), endpoint: p.endpoint }).catch(function () { });
    toast('Avisos desligados neste aparelho');
  }

  // A Apple e o Google às vezes trocam a assinatura, e o servidor apaga aparelho que deu 410:
  // reenvia a assinatura ao abrir e ao voltar para o app (no máximo 1x por hora; o servidor não duplica).
  var ultManter = 0;
  function manterAvisos() {
    var p = lsGet(LS_PUSH, null);
    if (DEMO || !p || !tok() || !pushPode() || Notification.permission !== 'granted' || Date.now() - ultManter < 36e5) return;
    ultManter = Date.now();
    assinar(p.endpoint).catch(function () { ultManter = 0; });
  }

  // ---------- login ----------
  var pin = '', criando = false, primeiro = null;
  function dotsPin() {
    var n = Math.max(4, pin.length), h = '';
    for (var i = 0; i < n; i++) h += '<i' + (i < pin.length ? ' class="on"' : '') + '></i>';
    $('#pins').innerHTML = h;
  }
  function msg(t, err) { var p = $('#lgMsg'); p.textContent = t; p.className = err ? 'err' : ''; if (err) { $('#pins').classList.remove('shake'); void $('#pins').offsetWidth; $('#pins').classList.add('shake'); } }
  function telaLogin() {
    $('#app').classList.add('hide'); $('#login').classList.remove('hide'); pin = ''; dotsPin();
    msg('Conectando…');
    api({ acao: 'status' }).then(function (j) {
      criando = j.ok && !j.temPin;
      $('#lgTitle').textContent = criando ? 'Crie seu PIN' : 'Contas';
      msg(criando ? 'Escolha de 4 a 6 dígitos' : 'Digite seu PIN');
    }, function () { msg('Sem conexão. Tente de novo.', true); });
  }
  function enviarPin() {
    if (pin.length < 4) { msg('O PIN tem pelo menos 4 dígitos', true); return; }
    if (criando && primeiro === null) { primeiro = pin; pin = ''; dotsPin(); msg('Repita o PIN para confirmar'); return; }
    if (criando && primeiro !== pin) { primeiro = null; pin = ''; dotsPin(); msg('Os PINs não bateram. Escolha de novo.', true); return; }
    var p = pin; msg('Entrando…');
    api(criando ? { acao: 'criarPin', pin: p } : { acao: 'entrar', pin: p }).then(function (j) {
      if (!j.ok) {
        pin = ''; dotsPin();
        if (j.codigo === 'bloqueado') msg('Muitas tentativas. Tente de novo ' + (j.ate ? 'às ' + new Date(j.ate).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'mais tarde'), true);
        else msg(j.erro || 'PIN incorreto', true);
        return;
      }
      lsSet(LS.tok, j.token); lsSet(LS.pinlen, p.length); pin = ''; primeiro = null;
      entrarApp();
    }, function () { pin = ''; dotsPin(); msg('Sem conexão. Tente de novo.', true); });
  }
  $('#pad').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var k = b.dataset.k;
    if (k === 'del') pin = pin.slice(0, -1);
    else if (k === 'ok') return enviarPin();
    else if (pin.length < 6) pin += b.textContent;
    dotsPin();
    if (!criando && pin.length === lsGet(LS.pinlen, 0)) enviarPin();
  });
  document.addEventListener('keydown', function (e) {
    if ($('#login').classList.contains('hide')) return;
    if (/^\d$/.test(e.key) && pin.length < 6) { pin += e.key; dotsPin(); if (!criando && pin.length === lsGet(LS.pinlen, 0)) enviarPin(); }
    else if (e.key === 'Backspace') { pin = pin.slice(0, -1); dotsPin(); }
    else if (e.key === 'Enter') enviarPin();
  });
  function sairLocal() { lsDel(LS.tok); lsDel(LS.cache); S = null; telaLogin(); }
  function entrarApp() { $('#login').classList.add('hide'); $('#app').classList.remove('hide'); render(); carregar(false); manterAvisos(); }

  // ---------- modo demonstração (dados inventados) ----------
  function demoApi(q) {
    var h = hojeD();
    function dd(n) { var d = new Date(h); d.setDate(d.getDate() + n); return iso(d); }
    if (!window._demo) {
      window._demo = { marcas: {}, snapshot: {
        geradoEm: new Date().toISOString(), robo: { ultimaLeitura: new Date(Date.now() - 14 * 6e4).toISOString(), leitorOk: true, avisos: [] },
        contas: [
          { id: 'd1', fonte: 'enel', categoria: 'consumo', nome: 'Conta de luz (Enel)', valor: 84.3, vencimento: dd(0), codigo: '836200000008843000481018060013552918002655060735', tipoCodigo: 'linha', como: 'Código de barras ou app Enel.', conferencia: 'ENEL (convênio de concessionária)' },
          { id: 'd2', fonte: 'aluguel', categoria: 'moradia', nome: 'Aluguel + IPTU', valor: 2950, vencimento: dd(1), codigo: '34191090080353623028156896180009616410000295000', tipoCodigo: 'linha', como: 'Pague pelo app do banco com o código.', conferencia: 'Banco 341 · Imobiliária Exemplo LTDA' },
          { id: 'd3', fonte: 'claro', categoria: 'consumo', nome: 'Internet (Claro)', valor: 99.9, vencimento: dd(-4), codigo: '00020101021126580014br.gov.bcb.pix0136exemplo-exemplo5204000053039865405' + '99.905802BR5909Claro S/A6009SAO PAULO6304ABCD', tipoCodigo: 'pix', como: 'Pix copia e cola.', conferencia: 'Recebedor: Claro S/A' },
          { id: 'd4', fonte: 'xp', categoria: 'cartao', nome: 'Cartão XP', valor: 640.12, minimo: 96.02, vencimento: dd(-35), como: 'app XP › Cartões › Pagar fatura.' },
          { id: 'd5', fonte: 'nubank', categoria: 'cartao', nome: 'Cartão Nubank', valor: null, vencimento: dd(5), como: 'app Nubank › Pagar fatura.' },
          { id: 'd6', fonte: 'btg', categoria: 'cartao', nome: 'Cartão BTG', valor: 2100.4, minimo: 315, vencimento: dd(8), como: 'app BTG › Cartão › Pagar.' },
          { id: 'd7', fonte: 'condominio', categoria: 'moradia', nome: 'Condomínio', valor: 990, vencimento: dd(16), previsto: true, como: 'Boleto da administradora (chega perto do dia 10).' },
          { id: 'd8', fonte: 'porto', categoria: 'cartao', nome: 'Cartão Porto', valor: 310.5, vencimento: dd(-6), pago: dd(-7), origemPago: 'heleno' },
          { id: 'd9', fonte: 'aluguel', categoria: 'moradia', nome: 'Aluguel + IPTU', valor: 120.1, vencimento: dd(-30), pago: dd(-31), origemPago: 'heleno' },
          { id: 'd10', fonte: 'aluguel', categoria: 'moradia', nome: 'Boleto de outro inquilino', valor: 1500, vencimento: dd(2), naoPague: 'Boleto de outro pagador (EMPRESA EXEMPLO) — NÃO PAGUE' },
          { id: 'd11', fonte: 'aluguel', categoria: 'moradia', nome: 'Aluguel + IPTU', valor: 2950, vencimento: dd(31), previsto: true }
        ],
        prazos: [
          { data: dd(-20), titulo: 'Entregar protocolos à imobiliária', detalhe: 'Exemplo de prazo passado.' },
          { data: dd(21), titulo: 'Renovar seguro', detalhe: 'Exemplo de prazo próximo.' },
          { data: dd(300), titulo: 'Reajuste anual do aluguel', detalhe: 'Exemplo.' }
        ],
        historico: { aluguel: [{ venc: dd(-60), valor: 300 }, { venc: dd(-30), valor: 120.1 }, { venc: dd(1), valor: 2950 }], enel: [{ venc: dd(-30), valor: 61.2 }, { venc: dd(0), valor: 84.3 }], xp: [{ venc: dd(-65), valor: 512 }, { venc: dd(-35), valor: 640.12 }] }
      } };
    }
    var D = window._demo;
    return new Promise(function (res) {
      setTimeout(function () {
        if (q.acao === 'status') return res({ ok: true, temPin: true });
        if (q.acao === 'entrar' || q.acao === 'criarPin') return res(q.pin === '1234' ? { ok: true, token: 'demo' } : { ok: false, erro: 'PIN incorreto (no demo é 1234)' });
        if (q.acao === 'dados') return res({ ok: true, snapshot: D.snapshot, marcas: D.marcas, atualizadoEm: new Date().toISOString() });
        if (q.acao === 'marcar') { D.marcas[q.id] = { pago: q.pago, data: q.data, quando: new Date().toISOString() }; return res({ ok: true, marcas: D.marcas }); }
        res({ ok: false, erro: 'ação desconhecida' });
      }, 250);
    });
  }

  // ---------- início ----------
  if ('serviceWorker' in navigator && !DEMO) navigator.serviceWorker.register('sw.js').catch(function () { });
  if (DEMO && !tok()) lsSet(LS.tok, 'demo');
  if (!API && !DEMO) { document.body.innerHTML = '<p style="padding:24px">Configuração ausente (config.js).</p>'; return; }
  if (tok()) entrarApp(); else telaLogin();
})();
