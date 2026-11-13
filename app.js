// TaMi Orçamentos — calculadora e orçamentos guardados no iPhone (sem servidor).
// As contas são as mesmas da app do Mac (app/custos.py). Tudo fica no próprio telemóvel:
// definições e rascunho no localStorage, orçamentos (com foto) no IndexedDB.
"use strict";

// ---------- definições ----------
const DEFS_BASE = {   // valores atuais de data/custos.json no Mac (nov 2026)
  kwh_price: 0.1439, printer_watts: 95, printer_price: 350.39, printer_life_hours: 3000,
  maintenance_per_hour: 0.05,
  materials: { "PLA": 20.66, "PLA Matte": 20.66, "PLA Silk": 25, "PETG": 19.63, "TPU": 30, "ABS": 22, "ASA": 25 },
  default_material: "PLA",
  waste_pct: 10, failure_pct: 10, hourly_rate: 10, paint_materials: 3, packaging: 1.5,
  margin_pct: 50, vat_pct: 0, round_to: 1,
};
const CAMPOS_DEFS = [
  ["Impressora e eletricidade", [
    ["kwh_price", "Eletricidade", "€/kWh"], ["printer_watts", "Consumo a imprimir", "W"],
    ["printer_price", "Preço da impressora", "€"], ["printer_life_hours", "Vida útil", "h"],
    ["maintenance_per_hour", "Manutenção", "€/h"]]],
  ["Margens", [
    ["waste_pct", "Desperdício de filamento", "%"], ["failure_pct", "Margem para falhas", "%"],
    ["margin_pct", "Lucro sobre o custo", "%"], ["vat_pct", "IVA", "%"],
    ["round_to", "Arredondar para cima a", "€"]]],
  ["Trabalho e extras (por omissão)", [
    ["hourly_rate", "O teu trabalho", "€/h"], ["paint_materials", "Tintas e verniz", "€"],
    ["packaging", "Embalagem", "€"]]],
];

function carregarDefs() {
  const d = JSON.parse(JSON.stringify(DEFS_BASE));
  try {
    const g = JSON.parse(localStorage.getItem("tami.defs") || "{}");
    for (const k in g) if (k in d) d[k] = g[k];
  } catch (e) {}
  if (!Object.keys(d.materials).length) d.materials = { ...DEFS_BASE.materials };
  if (!(d.default_material in d.materials)) d.default_material = Object.keys(d.materials)[0];
  return d;
}
let defs = carregarDefs();
const guardarDefs = () => localStorage.setItem("tami.defs", JSON.stringify(defs));

// ---------- números ----------
function num(v) {                       // "1,5" → 1.5; vazio/errado → null
  if (v === null || v === undefined) return null;
  const t = String(v).trim().replace(/\s/g, "").replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
const eur = x => (Math.round((x + Number.EPSILON) * 100) / 100).toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
const fmt = (x, d = 2) => (Math.round(x * 10 ** d) / 10 ** d).toLocaleString("pt-PT", { maximumFractionDigits: d });
const txt = v => (v === null || v === undefined) ? "" : String(v).replace(".", ",");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const horasTxt = h => { const t = Math.round(h * 60); return `${Math.floor(t / 60)} h${t % 60 ? " " + (t % 60) + " min" : ""}`; };

// ---------- contas (iguais a app/custos.py, com várias peças) ----------
function precoMaterial(nome) {
  if (nome in defs.materials) return [nome, defs.materials[nome]];
  const d = defs.default_material;
  return [d, defs.materials[d]];
}

function calcular(o) {
  const s = defs;
  let material = 0, horas = 0, gramas = 0;
  const pecas = o.pecas.map(p => {
    const q = Math.max(1, Math.round(num(p.qtd) || 1));
    const g = (num(p.gramas) || 0) * q;
    const h = ((num(p.horas) || 0) + (num(p.minutos) || 0) / 60) * q;
    const [mat, kg] = precoMaterial(p.material);
    const m = g * (1 + s.waste_pct / 100) * kg / 1000;
    material += m; horas += h; gramas += g;
    return { q, g, h, mat, custo: m };
  });
  const electricity = horas * s.printer_watts / 1000 * s.kwh_price;
  const wearRate = (s.printer_life_hours ? s.printer_price / s.printer_life_hours : 0) + s.maintenance_per_hour;
  const wear = horas * wearRate;
  const failures = (material + electricity + wear) * s.failure_pct / 100;
  // custo de máquina de cada peça (para o subtotal mostrado na peça)
  pecas.forEach(p => {
    const maq = p.h * (s.printer_watts / 1000 * s.kwh_price + wearRate);
    p.custo = (p.custo + maq) * (1 + s.failure_pct / 100);
  });
  const trabH = num(o.trabalho_h) || 0;
  const labour = trabH * s.hourly_rate;
  const tintas = num(o.tintas) ?? s.paint_materials;
  const embalagem = num(o.embalagem) ?? s.packaging;
  const envio = num(o.envio) || 0;
  const margem = num(o.margem) ?? s.margin_pct;

  const linhas = [
    [`Filamento (${fmt(gramas, 1)} g + ${fmt(s.waste_pct)}% desperdício)`, material],
    [`Eletricidade (${horasTxt(horas)} × ${fmt(s.printer_watts)} W)`, electricity],
    [`Desgaste da impressora (${fmt(wearRate)} €/h)`, wear],
    [`Margem para falhas (${fmt(s.failure_pct)}%)`, failures],
    [`Trabalho (${fmt(trabH)} h × ${fmt(s.hourly_rate)} €/h)`, labour],
    ["Tintas e verniz", tintas],
    ["Embalagem", embalagem],
  ];
  const custo = linhas.reduce((a, l) => a + l[1], 0);
  const iva = 1 + s.vat_pct / 100;
  let preco = custo * (1 + margem / 100) * iva;
  if (s.round_to && preco > 0) preco = Math.ceil(Math.round(preco / s.round_to * 1e6) / 1e6) * s.round_to;
  const sugerido = preco + envio * iva;
  const acordado = num(o.acordado);
  const final = acordado ?? sugerido;
  const semIva = final / iva;
  const lucro = semIva - custo - envio;
  return { pecas, linhas, custo, sugerido, final, acordado: acordado !== null, lucro, envio, margem,
           gramas, horas, iva: final - semIva, horaValor: trabH ? (lucro + labour) / trabH : null };
}

// ---------- base de dados (IndexedDB) ----------
let _db;
function db() {
  if (_db) return Promise.resolve(_db);
  return new Promise((ok, erro) => {
    const r = indexedDB.open("tami-orcamentos", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("orcamentos", { keyPath: "id" });
    r.onsuccess = () => ok(_db = r.result);
    r.onerror = () => erro(r.error);
  });
}
async function tx(modo, fn) {
  const d = await db();
  return new Promise((ok, erro) => {
    const t = d.transaction("orcamentos", modo);
    const st = t.objectStore("orcamentos");
    const r = fn(st);
    t.oncomplete = () => ok(r && r.result);
    t.onerror = () => erro(t.error);
  });
}
const todos = () => tx("readonly", st => st.getAll()).then(l => (l || []).sort((a, b) => b.alterado - a.alterado));
const obter = id => tx("readonly", st => st.get(id));
const gravar = o => tx("readwrite", st => st.put(o));
const apagar = id => tx("readwrite", st => st.delete(id));

// ---------- rascunho da calculadora ----------
const pecaNova = (n) => ({ nome: n ? `Peça ${n}` : "", material: defs.default_material, gramas: "", horas: "", minutos: "", qtd: "1" });
const orcamentoNovo = () => ({ id: null, nome: "", notas: "", foto: null, pecas: [pecaNova(1)],
  trabalho_h: "", tintas: "", embalagem: "", envio: "", margem: "", acordado: "" });
let rasc;
try { rasc = JSON.parse(localStorage.getItem("tami.rascunho")); } catch (e) {}
if (!rasc || !Array.isArray(rasc.pecas)) rasc = orcamentoNovo();
function guardarRascunho() {
  try { localStorage.setItem("tami.rascunho", JSON.stringify(rasc)); }
  catch (e) { localStorage.setItem("tami.rascunho", JSON.stringify({ ...rasc, foto: null })); }
}

// ---------- ecrã ----------
const $ = s => document.querySelector(s);
const ecra = $("#ecra");
let aba = "calc";
let mudou = false;   // rascunho alterado desde que foi aberto/guardado

function aviso(t) {
  const a = $("#aviso");
  a.textContent = t; a.classList.add("ver");
  clearTimeout(aviso._t); aviso._t = setTimeout(() => a.classList.remove("ver"), 2200);
}
function topo(titulo, acaoTxt, acao, voltar) {
  const h = $(".topo");
  h.innerHTML = (voltar ? `<button class="acao" id="voltar">‹ Voltar</button>` : `<img src="icones/logo.svg" alt="" class="logo">`) +
    `<h1>${esc(titulo)}</h1>` + (acaoTxt ? `<button class="acao" id="acaoTopo">${esc(acaoTxt)}</button>` : "");
  if (voltar) $("#voltar").onclick = voltar;
  if (acaoTxt) $("#acaoTopo").onclick = acao;
}
function mostrarAba(a) {
  aba = a;
  document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("ativo", b.dataset.tab === a));
  document.querySelector(".resumo")?.remove();
  window.scrollTo(0, 0);
  ({ calc: ecraCalc, lista: ecraLista, defs: ecraDefs })[a]();
}
document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => mostrarAba(b.dataset.tab));

const campoNum = (chave, rotulo, unidade, ph = "", extra = "") =>
  `<label class="campo"><span>${rotulo}</span><div class="com-unidade">
     <input inputmode="decimal" data-k="${chave}" value="${esc(txt(rasc[chave]))}" placeholder="${esc(ph)}" ${extra}><i>${unidade}</i></div></label>`;

function ecraCalc() {
  topo(rasc.id ? "Editar orçamento" : "Calculadora", "Novo", () => {
    if (mudou && !confirm("Começar um orçamento novo? O que está na calculadora e não foi guardado perde-se.")) return;
    rasc = orcamentoNovo(); mudou = false; guardarRascunho(); ecraCalc();
  });
  const mats = Object.keys(defs.materials);
  const pecasHtml = rasc.pecas.map((p, i) => `
    <div class="peca" data-i="${i}">
      <div class="peca-topo">
        <input data-p="nome" value="${esc(p.nome)}" placeholder="Nome da peça">
        ${rasc.pecas.length > 1 ? `<button class="x" data-tirar="${i}" aria-label="Tirar peça">✕</button>` : ""}
      </div>
      <div class="grelha">
        <label class="campo"><span>Filamento</span>
          <select data-p="material">${mats.concat(mats.includes(p.material) ? [] : [p.material]).map(m =>
            `<option ${m === p.material ? "selected" : ""}>${esc(m)}</option>`).join("")}</select></label>
        <label class="campo"><span>Gramas</span><div class="com-unidade">
          <input inputmode="decimal" data-p="gramas" value="${esc(txt(p.gramas))}" placeholder="0"><i>g</i></div></label>
      </div>
      <div class="grelha3">
        <label class="campo"><span>Impressão</span><div class="com-unidade">
          <input inputmode="numeric" data-p="horas" value="${esc(txt(p.horas))}" placeholder="0"><i>h</i></div></label>
        <label class="campo"><span>&nbsp;</span><div class="com-unidade">
          <input inputmode="numeric" data-p="minutos" value="${esc(txt(p.minutos))}" placeholder="0"><i>min</i></div></label>
        <label class="campo"><span>Quantidade</span><div class="com-unidade">
          <input inputmode="numeric" data-p="qtd" value="${esc(txt(p.qtd))}" placeholder="1"><i>×</i></div></label>
      </div>
      <div class="peca-sub" data-sub="${i}"></div>
    </div>`).join("");

  ecra.innerHTML = `
    <div class="card">
      <label class="campo"><span>Nome do orçamento</span>
        <input data-k="nome" value="${esc(rasc.nome)}" placeholder="ex.: Kit Natal"></label>
    </div>
    <div class="card">
      <h2>Peças <small>(o que diz o Bambu Studio)</small></h2>
      ${pecasHtml}
      <button class="btn tracejado cheio" id="maisPeca">＋ Adicionar peça</button>
    </div>
    <div class="card">
      <h2>Trabalho e extras</h2>
      <div class="grelha">
        ${campoNum("trabalho_h", "Preparar e pintar", "h", "0")}
        ${campoNum("tintas", "Tintas e verniz", "€", fmt(defs.paint_materials))}
        ${campoNum("embalagem", "Embalagem", "€", fmt(defs.packaging))}
        ${campoNum("envio", "Envio", "€", "0")}
        ${campoNum("margem", "Lucro", "%", fmt(defs.margin_pct))}
        ${campoNum("acordado", "Preço combinado", "€", "—")}
      </div>
      <p class="nota">Campos vazios usam os valores das Definições. O envio passa ao cliente sem lucro.</p>
    </div>
    <div class="card"><h2>Contas</h2><table class="linhas" id="linhas"></table></div>
    <div class="card">
      <h2>Foto e notas</h2>
      <div class="foto-zona">
        ${rasc.foto ? `<img src="${rasc.foto}" alt="">` : `<div class="foto-vazia">📷</div>`}
        <div class="botoes">
          <label class="btn">${rasc.foto ? "Trocar foto" : "Adicionar foto"}<input type="file" accept="image/*" id="foto" class="escondido"></label>
          ${rasc.foto ? `<button class="btn perigo" id="tirarFoto">Tirar foto</button>` : ""}
        </div>
      </div>
      <label class="campo" style="margin-top:12px"><span>Notas</span>
        <textarea data-k="notas" placeholder="cliente, cores, prazo…">${esc(rasc.notas)}</textarea></label>
    </div>
    <button class="btn perigo cheio" id="limpar">Limpar calculadora</button>`;

  const resumo = document.createElement("div");
  resumo.className = "resumo";
  resumo.innerHTML = `<div><div class="preco" id="rPreco"></div></div><div class="det" id="rDet"></div>
    <button class="btn" id="guardar">${rasc.id ? "Guardar" : "Guardar…"}</button>`;
  document.querySelector(".resumo")?.remove();
  document.body.appendChild(resumo);

  ecra.oninput = e => {
    const t = e.target;
    if (t.dataset.k) rasc[t.dataset.k] = t.value;
    else if (t.dataset.p) rasc.pecas[+t.closest(".peca").dataset.i][t.dataset.p] = t.value;
    else return;
    mudou = true; guardarRascunho(); atualizarContas();
  };
  ecra.onchange = ecra.oninput;
  ecra.onclick = e => {
    const tirar = e.target.closest("[data-tirar]");
    if (tirar) { rasc.pecas.splice(+tirar.dataset.tirar, 1); mudou = true; guardarRascunho(); ecraCalc(); }
  };
  $("#maisPeca").onclick = () => {
    rasc.pecas.push(pecaNova(rasc.pecas.length + 1)); mudou = true; guardarRascunho(); ecraCalc();
    const ult = ecra.querySelectorAll(".peca"); ult[ult.length - 1].scrollIntoView({ behavior: "smooth", block: "center" });
  };
  $("#foto").onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { rasc.foto = await reduzirFoto(f); mudou = true; guardarRascunho(); ecraCalc(); }
    catch (err) { aviso("Não consegui abrir essa imagem"); }
  };
  if ($("#tirarFoto")) $("#tirarFoto").onclick = () => { rasc.foto = null; mudou = true; guardarRascunho(); ecraCalc(); };
  $("#limpar").onclick = () => {
    if (!confirm("Limpar tudo o que está na calculadora?")) return;
    rasc = orcamentoNovo(); mudou = false; guardarRascunho(); ecraCalc();
  };
  $("#guardar").onclick = guardarOrcamento;
  atualizarContas();
}

function atualizarContas() {
  const r = calcular(rasc);
  r.pecas.forEach((p, i) => {
    const el = ecra.querySelector(`[data-sub="${i}"]`);
    if (el) el.textContent = p.g || p.h ? `${p.q > 1 ? p.q + " peças · " : ""}${fmt(p.g, 1)} g · ${horasTxt(p.h)} · ${eur(p.custo)} de impressão` : "";
  });
  $("#linhas").innerHTML = tabelaContas(r);
  $("#rPreco").textContent = eur(r.final);
  $("#rDet").innerHTML = `Custo ${eur(r.custo)}<br>Lucro <b>${eur(r.lucro)}</b>${r.acordado ? " · combinado" : ""}`;
}

function tabelaContas(r) {
  return r.linhas.map(([l, v]) => `<tr><td>${esc(l)}</td><td>${eur(v)}</td></tr>`).join("") +
    `<tr class="total"><td>Custo total</td><td>${eur(r.custo)}</td></tr>` +
    `<tr><td>Preço sugerido (+${fmt(r.margem)}% lucro${defs.round_to ? ", arredondado" : ""}${r.envio ? ", com envio" : ""})</td><td>${eur(r.sugerido)}</td></tr>` +
    (r.acordado ? `<tr><td>Preço combinado</td><td><b>${eur(r.final)}</b></td></tr>` : "") +
    (defs.vat_pct ? `<tr><td>IVA incluído (${fmt(defs.vat_pct)}%)</td><td>${eur(r.iva)}</td></tr>` : "") +
    `<tr class="lucro ${r.lucro < 0 ? "neg" : ""}"><td>Lucro${r.horaValor !== null ? ` (a tua hora vale ${eur(r.horaValor)})` : ""}</td><td>${eur(r.lucro)}</td></tr>`;
}

async function guardarOrcamento() {
  let nome = rasc.nome.trim();
  if (!nome) {
    nome = (prompt("Nome do orçamento (ex.: Kit Natal):") || "").trim();
    if (!nome) return;
    rasc.nome = nome;
  }
  const agora = Date.now();
  const o = JSON.parse(JSON.stringify(rasc));
  o.id = o.id || (crypto.randomUUID ? crypto.randomUUID() : String(agora) + Math.random().toString(16).slice(2));
  const antigo = rasc.id ? await obter(rasc.id) : null;
  o.criado = antigo?.criado || agora;
  o.alterado = agora;
  const r = calcular(o);
  o.preco_guardado = r.final;          // preço no dia em que foi guardado (as definições podem mudar)
  o.custo_guardado = r.custo;
  try { await gravar(o); }
  catch (e) { aviso("Não foi possível guardar"); return; }
  rasc = orcamentoNovo(); mudou = false; guardarRascunho();
  aviso(antigo ? "Orçamento atualizado" : "Orçamento guardado");
  aba = "lista";
  document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("ativo", b.dataset.tab === "lista"));
  document.querySelector(".resumo")?.remove();
  ecraDetalhe(o.id);
}

// fotos: reduz para no máximo 1400 px e JPEG, para não encher o telemóvel
function reduzirFoto(ficheiro) {
  return new Promise((ok, erro) => {
    const url = URL.createObjectURL(ficheiro);
    const img = new Image();
    img.onload = () => {
      const max = 1400, k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      ok(c.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); erro(new Error("imagem")); };
    img.src = url;
  });
}

// ---------- lista ----------
let filtro = "";
async function ecraLista() {
  topo("Orçamentos");
  const lista = await todos();
  if (aba !== "lista") return;
  if (!lista.length) {
    ecra.innerHTML = `<div class="vazio"><div class="grande">📒</div><p>Ainda não tens orçamentos guardados.</p>
      <p>Faz as contas na <b>Calculadora</b> e carrega em <b>Guardar</b>.</p></div>`;
    return;
  }
  ecra.innerHTML = `<input type="search" class="procura" placeholder="Procurar…" value="${esc(filtro)}" id="procura"><div id="itens"></div>`;
  const desenhar = () => {
    const f = filtro.trim().toLowerCase();
    const vis = lista.filter(o => !f || (o.nome + " " + o.notas + " " + o.pecas.map(p => p.nome).join(" ")).toLowerCase().includes(f));
    $("#itens").innerHTML = vis.map(o => `
      <div class="item" data-id="${esc(o.id)}">
        ${o.foto ? `<img src="${o.foto}" alt="" loading="lazy">` : `<div class="foto-vazia">🧩</div>`}
        <div class="meio"><div class="nome">${esc(o.nome)}</div>
          <div class="sub">${o.pecas.length} peça${o.pecas.length === 1 ? "" : "s"} · ${new Date(o.alterado).toLocaleDateString("pt-PT")}</div></div>
        <div class="valor">${eur(o.preco_guardado ?? calcular(o).final)}</div>
      </div>`).join("") || `<p class="vazio">Nada encontrado.</p>`;
  };
  $("#procura").oninput = e => { filtro = e.target.value; desenhar(); };
  $("#itens").onclick = e => { const it = e.target.closest(".item"); if (it) ecraDetalhe(it.dataset.id); };
  desenhar();
}

async function ecraDetalhe(id) {
  const o = await obter(id);
  if (!o) return ecraLista();
  topo(o.nome, "Editar", () => abrirNaCalc(o), () => ecraLista());
  window.scrollTo(0, 0);
  const r = calcular(o);
  const mudouPreco = o.preco_guardado !== undefined && Math.abs(o.preco_guardado - r.final) > 0.005;
  ecra.innerHTML = `
    ${o.foto ? `<img class="detalhe-foto" src="${o.foto}" alt="">` : ""}
    <div class="card">
      <div class="preco-grande">${eur(o.preco_guardado ?? r.final)}</div>
      <div class="muted">${r.acordado ? "Preço combinado" : "Preço sugerido"} · lucro ${eur(r.lucro)}</div>
      ${mudouPreco ? `<p class="nota">Com as definições de hoje daria ${eur(r.final)}. Abre em <b>Editar</b> e guarda para atualizar.</p>` : ""}
      <p class="nota">Guardado a ${new Date(o.criado).toLocaleDateString("pt-PT")}${o.alterado !== o.criado ? ` · alterado a ${new Date(o.alterado).toLocaleDateString("pt-PT")}` : ""}</p>
    </div>
    <div class="card"><h2>Peças</h2><table class="linhas">${o.pecas.map((p, i) => `
      <tr><td><b>${esc(p.nome || "Peça " + (i + 1))}</b>${r.pecas[i].q > 1 ? ` × ${r.pecas[i].q}` : ""}<br>
        <span class="muted small">${esc(r.pecas[i].mat)} · ${fmt(r.pecas[i].g, 1)} g · ${horasTxt(r.pecas[i].h)}</span></td>
        <td>${eur(r.pecas[i].custo)}</td></tr>`).join("")}
      <tr class="total"><td>Total: ${fmt(r.gramas, 1)} g · ${horasTxt(r.horas)}</td><td></td></tr></table></div>
    <div class="card"><h2>Contas</h2><table class="linhas">${tabelaContas(r)}</table></div>
    ${o.notas ? `<div class="card"><h2>Notas</h2><div style="white-space:pre-wrap">${esc(o.notas)}</div></div>` : ""}
    <div class="botoes" style="margin-bottom:10px">
      <button class="btn" id="partilhar">Partilhar</button>
      <button class="btn" id="duplicar">Duplicar</button>
    </div>
    <button class="btn perigo cheio" id="apagar">Apagar orçamento</button>`;

  $("#apagar").onclick = async () => {
    if (!confirm(`Apagar “${o.nome}”? Não dá para desfazer.`)) return;
    await apagar(o.id); aviso("Orçamento apagado"); ecraLista();
  };
  $("#duplicar").onclick = () => abrirNaCalc({ ...o, id: null, nome: o.nome + " (cópia)" });
  $("#partilhar").onclick = () => partilhar(o, r);
}

function abrirNaCalc(o) {
  if (mudou && !confirm("A calculadora tem contas por guardar. Substituir?")) return;
  rasc = JSON.parse(JSON.stringify(o));
  delete rasc.criado; delete rasc.alterado; delete rasc.preco_guardado; delete rasc.custo_guardado;
  mudou = false; guardarRascunho();
  mostrarAba("calc");
}

async function partilhar(o, r) {
  const texto = `${o.nome} — ${eur(o.preco_guardado ?? r.final)}\n` +
    o.pecas.map((p, i) => `• ${p.nome || "Peça " + (i + 1)}${r.pecas[i].q > 1 ? " × " + r.pecas[i].q : ""}: ${fmt(r.pecas[i].g, 1)} g, ${horasTxt(r.pecas[i].h)}`).join("\n") +
    (o.notas ? `\n\n${o.notas}` : "");
  const dados = { title: o.nome, text: texto };
  if (o.foto) {
    try {
      const blob = await (await fetch(o.foto)).blob();
      const f = new File([blob], o.nome.replace(/[^\w\- ]+/g, "") + ".jpg", { type: "image/jpeg" });
      if (navigator.canShare?.({ files: [f] })) dados.files = [f];
    } catch (e) {}
  }
  if (navigator.share) { try { await navigator.share(dados); } catch (e) {} }
  else { await navigator.clipboard?.writeText(texto); aviso("Copiado"); }
}

// ---------- definições ----------
function ecraDefs() {
  topo("Definições");
  const mats = Object.entries(defs.materials);
  ecra.innerHTML = CAMPOS_DEFS.map(([titulo, campos]) => `
    <div class="card"><h2>${titulo}</h2><div class="grelha">${campos.map(([k, l, u]) =>
      `<label class="campo"><span>${l}</span><div class="com-unidade">
        <input inputmode="decimal" data-d="${k}" value="${esc(txt(defs[k]))}"><i>${u}</i></div></label>`).join("")}</div></div>`).join("") + `
    <div class="card"><h2>Filamentos <small>(preço do rolo de 1 kg)</small></h2>
      <div id="mats">${mats.map(([n, p], i) => `
        <div class="mat" data-i="${i}"><input data-m="nome" value="${esc(n)}" placeholder="Nome">
          <div class="com-unidade"><input inputmode="decimal" data-m="preco" value="${esc(txt(p))}"><i>€</i></div>
          <button class="x" data-tirarmat="${i}" aria-label="Tirar">✕</button></div>`).join("")}</div>
      <button class="btn tracejado cheio" id="maisMat">＋ Adicionar filamento</button>
      <label class="campo" style="margin-top:12px"><span>Filamento por omissão</span>
        <select id="matDef">${mats.map(([n]) => `<option ${n === defs.default_material ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label>
    </div>
    <div class="card"><h2>Cópia de segurança</h2>
      <p class="nota">Os orçamentos ficam só neste iPhone. Exporta uma cópia de vez em quando e guarda-a no iCloud Drive (em “Guardar em Ficheiros”).</p>
      <div class="botoes"><button class="btn" id="exportar">Exportar</button>
        <label class="btn">Importar<input type="file" accept=".json,application/json" id="importar" class="escondido"></label></div>
    </div>
    <button class="btn cheio" id="repor">Repor valores da app do Mac</button>
    <p class="nota" style="text-align:center;margin-top:16px">TaMi Orçamentos · as contas são as mesmas da app do Mac</p>`;

  ecra.oninput = e => {
    const t = e.target;
    if (t.dataset.d) { const n = num(t.value); if (n !== null) { defs[t.dataset.d] = n; guardarDefs(); } }
  };
  ecra.onchange = e => {
    const t = e.target;
    if (t.dataset.m || t.id === "matDef") lerMats();
  };
  ecra.onclick = e => {
    const b = e.target.closest("[data-tirarmat]");
    if (!b) return;
    if (ecra.querySelectorAll(".mat").length <= 1) return aviso("É preciso pelo menos um filamento");
    b.closest(".mat").remove(); lerMats(); ecraDefs();
  };
  $("#maisMat").onclick = () => {
    let n = "Novo", k = 2; while (n in defs.materials) n = "Novo " + k++;
    defs.materials[n] = 20; guardarDefs(); ecraDefs();
  };
  $("#repor").onclick = () => {
    if (!confirm("Repor todas as definições com os valores da app do Mac?")) return;
    localStorage.removeItem("tami.defs"); defs = carregarDefs(); ecraDefs(); aviso("Definições repostas");
  };
  $("#exportar").onclick = exportar;
  $("#importar").onchange = importar;
}
function lerMats() {
  const m = {};
  ecra.querySelectorAll(".mat").forEach(r => {
    const n = r.querySelector("[data-m=nome]").value.trim();
    if (n) m[n] = num(r.querySelector("[data-m=preco]").value) ?? 0;
  });
  if (!Object.keys(m).length) return;
  defs.materials = m;
  const sel = $("#matDef")?.value;
  defs.default_material = sel in m ? sel : Object.keys(m)[0];
  guardarDefs();
}

async function exportar() {
  const dados = { app: "tami-orcamentos", versao: 1, exportado: new Date().toISOString(), definicoes: defs, orcamentos: await todos() };
  const nome = `TaMi-orcamentos-${new Date().toISOString().slice(0, 10)}.json`;
  const f = new File([JSON.stringify(dados)], nome, { type: "application/json" });
  if (navigator.canShare?.({ files: [f] })) {
    try { await navigator.share({ files: [f], title: nome }); } catch (e) {}
  } else {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(f); a.download = nome; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
}
async function importar(e) {
  const f = e.target.files[0]; if (!f) return;
  try {
    const d = JSON.parse(await f.text());
    if (d.app !== "tami-orcamentos" || !Array.isArray(d.orcamentos)) throw new Error();
    const existentes = new Set((await todos()).map(o => o.id));
    const novos = d.orcamentos.filter(o => !existentes.has(o.id)).length;
    if (!confirm(`Importar ${d.orcamentos.length} orçamentos (${novos} novos; os que já existem são substituídos pela cópia)?`)) return;
    for (const o of d.orcamentos) if (o && o.id && Array.isArray(o.pecas)) await gravar(o);
    if (d.definicoes && confirm("Usar também as definições da cópia?")) {
      localStorage.setItem("tami.defs", JSON.stringify(d.definicoes)); defs = carregarDefs(); ecraDefs();
    }
    aviso("Cópia importada");
  } catch (err) { aviso("Esse ficheiro não é uma cópia da TaMi"); }
  e.target.value = "";
}

// ---------- arranque ----------
mostrarAba("calc");
navigator.storage?.persist?.();
if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js");
