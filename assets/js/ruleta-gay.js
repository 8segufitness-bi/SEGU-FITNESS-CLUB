"use strict";
/* ============================================================
   RULETA GAY AMIGXS — capa de datos compartida
   ---------------------------------------------------------------
   Este archivo lo usan ruleta-gay-dashboard.html (el moderador) y
   ruleta-gay-inscripcion.html (lo que abren les invitades al leer
   el QR). Entre los dos necesitan ver la MISMA información — perfiles
   cargados, quién se anotó, quién es VIP, los votos y los resultados
   — así que no alcanza con localStorage (eso solo vive en un celular).

   NO HACE FALTA CREAR NINGUNA CUENTA NI PROYECTO. Esta página guarda
   los datos de la partida en jsonblob.com, un servicio público y
   anónimo (sin login, sin API key) pensado justo para esto: guardar
   un "papelito" de JSON en internet y poder leerlo/escribirlo desde
   cualquier navegador. Abrís ruleta-gay-dashboard.html y ya funciona.

   CÓMO FUNCIONA (para quien quiera entender o tocar el código)
   - Al abrir el dashboard por primera vez se crea una "sala" nueva
     (un blob con los perfiles, participantes y resultados de esa
     fiesta). El link del QR lleva el id de esa sala en "?r=...".
   - Cada invitade que se registra recibe SU PROPIO blob para
     guardar sus votos — así, si diez personas votan al mismo
     tiempo, nadie le pisa el voto a nadie (cada quien escribe solo
     en el suyo). El dashboard suma todo recién al activar la ruleta.
   - "Reiniciar ronda" simplemente crea una sala nueva.
   - jsonblob.com es un servicio gratuito de terceros pensado para
     prototipos: andá bien, pero no es garantía de nivel productivo.
     Para una fiesta puntual alcanza de sobra — igual conviene hacer
     una prueba rápida (registrar 1 persona, votar, revelar) antes
     del evento.
   ============================================================ */

const RULETA_CONFIG = {
  categorias: [
    { id: "chistosa", nombre: "La Más Chistosa", emoji: "😂" },
    { id: "social",   nombre: "La Más Social",   emoji: "🥂" },
    { id: "curada",   nombre: "La Más Curada",   emoji: "💅" },
    { id: "putonga",  nombre: "La Más Putonga",  emoji: "🔥" }
  ],
  puntosMin: 1,
  puntosMax: 7,
  pesoVip: 3,
  pesoNormal: 1
};

/* ============================================================
   ALMACÉN — jsonblob.com (crear/leer/escribir un blob de JSON)
   ============================================================ */
const JSONBLOB_BASE = "https://jsonblob.com/api/jsonBlob";

async function rgFetchConReintento(input, init, intentos = 2) {
  let ultimoError;
  for (let i = 0; i <= intentos; i++) {
    try {
      const res = await fetch(input, init);
      if (!res.ok) throw new Error("El servidor de datos respondió " + res.status);
      return res;
    } catch (e) {
      ultimoError = e;
      if (i < intentos) await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw ultimoError;
}

async function rgCrearBlob(data) {
  const res = await rgFetchConReintento(JSONBLOB_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(data)
  });
  const loc = res.headers.get("Location") || res.headers.get("location") || "";
  const id = loc.split("/").filter(Boolean).pop();
  if (!id) throw new Error("No se pudo crear la sala (no llegó el id).");
  return id;
}
async function rgLeerBlobPorId(id) {
  const res = await rgFetchConReintento(JSONBLOB_BASE + "/" + id, { headers: { "Accept": "application/json" } });
  return res.json();
}
async function rgEscribirBlobPorId(id, data) {
  await rgFetchConReintento(JSONBLOB_BASE + "/" + id, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(data)
  });
}

/* ============================================================
   SALA — el blob compartido con perfiles / participantes / revelado
   ============================================================ */
const RULETA_STORAGE_KEY = "rg_sala_actual";
let _roomId = null;
let _salaCache = null;

function rgIdSala() {
  if (!_roomId) throw new Error("Todavía no hay una sala activa.");
  return _roomId;
}
function rgFijarIdSala(id) {
  _roomId = id;
  try { localStorage.setItem(RULETA_STORAGE_KEY, id); } catch (e) { /* modo privado, no pasa nada */ }
}
function rgIdSalaGuardada() {
  try { return localStorage.getItem(RULETA_STORAGE_KEY); } catch (e) { return null; }
}
function rgIdSalaDesdeUrl() {
  return new URLSearchParams(window.location.search).get("r");
}

async function rgLeerSala() {
  return rgLeerBlobPorId(rgIdSala());
}

async function rgCrearSala() {
  const inicial = { perfiles: [], participantes: [], revelado: {} };
  const id = await rgCrearBlob(inicial);
  rgFijarIdSala(id);
  _salaCache = inicial;
  return id;
}

/* Usado por el dashboard: retoma la sala guardada en este navegador,
   o crea una nueva si es la primera vez (o si la guardada ya no existe). */
async function rgAbrirOCrearSalaDashboard() {
  const guardada = rgIdSalaGuardada();
  if (guardada) {
    _roomId = guardada;
    try { _salaCache = await rgLeerSala(); return guardada; }
    catch (e) { /* la sala guardada ya no responde: creamos una nueva */ }
  }
  return rgCrearSala();
}

/* Usado por la página de inscripción: la sala SIEMPRE viene del link (?r=...). */
async function rgUnirseASala() {
  const id = rgIdSalaDesdeUrl();
  if (!id) throw new Error("Este link no tiene una ruleta asociada — pedile el QR actualizado al anfitrión.");
  rgFijarIdSala(id);
  _salaCache = await rgLeerSala();
  return id;
}

/* Lee-modifica-escribe con un par de reintentos por si dos escrituras
   caen casi al mismo tiempo (ver nota de diseño al inicio del archivo:
   los votos de cada participante van en su propio blob así que esto
   solo se usa para acciones poco frecuentes del anfitrión). */
async function rgMutarSala(mutador, intentos = 3) {
  let ultimoError;
  for (let i = 0; i < intentos; i++) {
    try {
      const actual = await rgLeerSala();
      const nueva = mutador(actual) || actual;
      await rgEscribirBlobPorId(rgIdSala(), nueva);
      _salaCache = nueva;
      _notificarListeners();
      return nueva;
    } catch (e) {
      ultimoError = e;
      await new Promise(r => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw ultimoError;
}

/* ---- "en vivo" por sondeo (polling) ----
   No hay servidor propio para avisar en tiempo real, así que cada
   pocos segundos se vuelve a preguntar por la sala. Las tres
   funciones rgEscuchar* comparten un solo temporizador para no
   triplicar los pedidos de red. */
const RULETA_POLL_MS = 3000;
const _listeners = { perfiles: [], participantes: [], estado: [] };
let _pollingIniciado = false;

function _notificarListeners() {
  if (!_salaCache) return;
  _listeners.perfiles.forEach(cb => cb(_salaCache.perfiles || []));
  _listeners.participantes.forEach(cb => cb(_salaCache.participantes || []));
  _listeners.estado.forEach(cb => cb({ revelado: _salaCache.revelado || {} }));
}
async function _tick() {
  if (_roomId) {
    try { _salaCache = await rgLeerSala(); _notificarListeners(); }
    catch (e) { /* wifi de la fiesta con hipo: se reintenta solo en el próximo tick */ }
  }
  setTimeout(_tick, RULETA_POLL_MS);
}
function _iniciarPolling() {
  if (_pollingIniciado) return;
  _pollingIniciado = true;
  setTimeout(_tick, RULETA_POLL_MS);
}
function rgEscucharPerfiles(cb) {
  _listeners.perfiles.push(cb);
  if (_salaCache) cb(_salaCache.perfiles || []);
  _iniciarPolling();
  return () => { _listeners.perfiles = _listeners.perfiles.filter(x => x !== cb); };
}
function rgEscucharParticipantes(cb) {
  _listeners.participantes.push(cb);
  if (_salaCache) cb(_salaCache.participantes || []);
  _iniciarPolling();
  return () => { _listeners.participantes = _listeners.participantes.filter(x => x !== cb); };
}
function rgEscucharEstado(cb) {
  _listeners.estado.push(cb);
  if (_salaCache) cb({ revelado: _salaCache.revelado || {} });
  _iniciarPolling();
  return () => { _listeners.estado = _listeners.estado.filter(x => x !== cb); };
}

/* ---- helpers de perfiles de Instagram ----
   Acepta cualquiera de estas formas y las deja todas equivalentes:
   "@usuario", "usuario", "instagram.com/usuario", "www.instagram.com/usuario",
   "https://instagram.com/usuario". */
function rgNormalizarUrl(url) {
  let v = url.trim().replace(/^@/, "");
  if (!/^https?:\/\//i.test(v)) {
    v = /^(www\.)?instagram\.com(\/|$)/i.test(v) ? "https://" + v : "https://instagram.com/" + v;
  }
  return v;
}
function rgExtraerHandle(url) {
  try {
    const u = new URL(rgNormalizarUrl(url));
    const parte = u.pathname.split("/").filter(Boolean)[0];
    return parte ? "@" + parte : url.trim();
  } catch (e) {
    return url.trim();
  }
}
function rgIdCorto() {
  return (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2));
}

/* ---- perfiles (los sube el moderador) ---- */
function rgAgregarPerfil(url) {
  const nuevo = { id: rgIdCorto(), url: rgNormalizarUrl(url), handle: rgExtraerHandle(url) };
  return rgMutarSala(sala => { sala.perfiles = sala.perfiles || []; sala.perfiles.push(nuevo); return sala; });
}
function rgEliminarPerfil(perfilId) {
  return rgMutarSala(sala => { sala.perfiles = (sala.perfiles || []).filter(p => p.id !== perfilId); return sala; });
}

/* ---- participantes (se anotan al leer el QR) ----
   Cada participante tiene su PROPIO blob de votos (votosBlobId), así
   que votar nunca choca con la escritura de otra persona. */
async function rgRegistrarParticipante(nombre) {
  const votosBlobId = await rgCrearBlob({});
  const participanteId = rgIdCorto();
  await rgMutarSala(sala => {
    sala.participantes = sala.participantes || [];
    sala.participantes.push({
      id: participanteId, nombre: nombre.trim(), isVip: false,
      completo: false, votosBlobId, registradoAt: Date.now()
    });
    return sala;
  });
  return { participanteId, votosBlobId };
}
async function rgMarcarVip(participanteId) {
  return rgMutarSala(sala => {
    (sala.participantes || []).forEach(p => { p.isVip = (p.id === participanteId); });
    return sala;
  });
}
async function rgQuitarVip(participanteId) {
  return rgMutarSala(sala => {
    const p = (sala.participantes || []).find(x => x.id === participanteId);
    if (p) p.isVip = false;
    return sala;
  });
}
async function rgMarcarParticipanteCompleto(participanteId) {
  return rgMutarSala(sala => {
    const p = (sala.participantes || []).find(x => x.id === participanteId);
    if (p) p.completo = true;
    return sala;
  });
}

/* ---- votos (viven en el blob propio de cada participante, no en la sala) ---- */
async function rgLeerVotosPropios(votosBlobId) {
  try { return await rgLeerBlobPorId(votosBlobId); } catch (e) { return {}; }
}
async function rgEmitirVoto(votosBlobId, categoriaId, perfilId, puntos) {
  const votos = await rgLeerVotosPropios(votosBlobId);
  votos[categoriaId] = {
    perfilId,
    puntos: Math.max(RULETA_CONFIG.puntosMin, Math.min(RULETA_CONFIG.puntosMax, Number(puntos) || 0))
  };
  await rgEscribirBlobPorId(votosBlobId, votos);
  return votos;
}

/* ---- estado del evento (resultados revelados) ---- */
function rgRevelarCategoria(categoriaId, resultado) {
  return rgMutarSala(sala => { sala.revelado = sala.revelado || {}; sala.revelado[categoriaId] = resultado; return sala; });
}
async function rgReiniciarRonda() {
  return rgCrearSala();
}

/* ---- totales ponderados por categoría ----
   total(perfil) = suma de (puntos del voto * peso del votante)
   peso: RULETA_CONFIG.pesoVip si el participante es VIP, si no pesoNormal.
   Junta el voto de cada participante desde su propio blob (por eso
   es async: implica un pedido de red por participante). */
async function rgCalcularTotales(perfiles, participantes, categoriaId) {
  const pesoPorParticipante = {};
  participantes.forEach(p => { pesoPorParticipante[p.id] = p.isVip ? RULETA_CONFIG.pesoVip : RULETA_CONFIG.pesoNormal; });

  const votosPorParticipante = await Promise.all(
    participantes.map(p => rgLeerVotosPropios(p.votosBlobId).then(votos => ({ p, votos })))
  );

  const totales = {};
  const conteos = {};
  perfiles.forEach(pf => { totales[pf.id] = 0; conteos[pf.id] = 0; });

  votosPorParticipante.forEach(({ p, votos }) => {
    const voto = votos && votos[categoriaId];
    if (!voto || !voto.perfilId) return;
    const peso = pesoPorParticipante[p.id] ?? RULETA_CONFIG.pesoNormal;
    if (!(voto.perfilId in totales)) { totales[voto.perfilId] = 0; conteos[voto.perfilId] = 0; }
    totales[voto.perfilId] += (Number(voto.puntos) || 0) * peso;
    conteos[voto.perfilId] += 1;
  });

  return perfiles
    .map(pf => ({ perfil: pf, total: totales[pf.id] || 0, votos: conteos[pf.id] || 0 }))
    .sort((a, b) => b.total - a.total);
}
