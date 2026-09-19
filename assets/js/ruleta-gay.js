"use strict";
/* ============================================================
   RULETA GAY AMIGXS — capa de datos compartida
   ---------------------------------------------------------------
   Este archivo lo usan ruleta-gay-dashboard.html (el moderador) y
   ruleta-gay-inscripcion.html (lo que abren les invitades al leer
   el QR). Entre los dos necesitan ver la MISMA información en
   tiempo real — perfiles cargados, quién se anotó, quién es VIP,
   los votos y los resultados — así que no alcanza con localStorage
   (eso solo vive en un celular). Por eso este archivo usa Firebase
   Firestore como "base de datos compartida", gratis, sin backend
   propio, siguiendo el mismo espíritu que el resto del sitio (cero
   build, cero servidor propio).

   CÓMO CONECTARLO (una sola vez, ~5 minutos)
   1. Ir a https://console.firebase.google.com → "Agregar proyecto"
      (podés usar el mismo Google que usan para Airtable). Nombre
      sugerido: "segu-ruleta-gay".
   2. Dentro del proyecto: "Compilación" → "Firestore Database" →
      "Crear base de datos" → modo "producción" → elegir región
      cercana (ej. southamerica-east1) → Crear.
   3. En "Reglas" de Firestore, pegar esto y Publicar (alcanza para
      un juego de fiesta puntual; borrá el proyecto cuando termine
      el evento si no lo vas a volver a usar):

        rules_version = '2';
        service cloud.firestore {
          match /databases/{database}/documents {
            match /eventos/{eventId} {
              allow read, write: if true;
              match /{coleccion}/{docId} {
                allow read, write: if true;
              }
            }
          }
        }

   4. Volver al panel del proyecto → ícono "</>" (Agregar app web) →
      registrar la app (no hace falta Hosting) → copiar el objeto
      "firebaseConfig" que te muestra.
   5. Pegar esos valores abajo en RULETA_CONFIG.firebase, reemplazando
      cada "PEGA_AQUI...". Guardar y listo — el dashboard y la página
      de inscripción van a avisar si todavía falta este paso.

   EVENT ID — RULETA_CONFIG.eventId separa los datos por evento (por
   si se reutiliza para varias fiestas). Cambiarlo alcanza para
   arrancar una ronda 100% nueva sin tocar nada más.
   ============================================================ */

const RULETA_CONFIG = {
  eventId: "ruleta-gay-amigxs",

  categorias: [
    { id: "chistosa", nombre: "La Más Chistosa", emoji: "😂" },
    { id: "social",   nombre: "La Más Social",   emoji: "🥂" },
    { id: "curada",   nombre: "La Más Curada",   emoji: "💅" },
    { id: "putonga",  nombre: "La Más Putonga",  emoji: "🔥" }
  ],

  puntosMin: 1,
  puntosMax: 7,
  pesoVip: 3,
  pesoNormal: 1,

  // ✏️ Pegar acá el firebaseConfig del paso 4 de arriba.
  firebase: {
    apiKey: "PEGA_AQUI_TU_API_KEY",
    authDomain: "PEGA_AQUI_TU_PROYECTO.firebaseapp.com",
    projectId: "PEGA_AQUI_TU_PROYECTO",
    storageBucket: "PEGA_AQUI_TU_PROYECTO.appspot.com",
    messagingSenderId: "PEGA_AQUI_TU_SENDER_ID",
    appId: "PEGA_AQUI_TU_APP_ID"
  }
};

const RULETA_READY = Object.values(RULETA_CONFIG.firebase)
  .every(v => typeof v === "string" && v.indexOf("PEGA_AQUI") === -1);

let _rgApp = null;
let _rgDb = null;

function rgInit() {
  if (!RULETA_READY) return null;
  if (!_rgDb) {
    _rgApp = firebase.initializeApp(RULETA_CONFIG.firebase);
    _rgDb = firebase.firestore();
  }
  return _rgDb;
}

function rgEventoRef() {
  return rgInit().collection("eventos").doc(RULETA_CONFIG.eventId);
}

/* ---- helpers ----
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

function rgUrlPerfil(url) {
  return rgNormalizarUrl(url);
}

/* ---- perfiles (los sube el moderador) ---- */
function rgAgregarPerfil(url) {
  return rgEventoRef().collection("perfiles").add({
    url: rgUrlPerfil(url),
    handle: rgExtraerHandle(url),
    creadoAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}
function rgEliminarPerfil(perfilId) {
  return rgEventoRef().collection("perfiles").doc(perfilId).delete();
}
function rgEscucharPerfiles(cb) {
  return rgEventoRef().collection("perfiles").orderBy("creadoAt", "asc")
    .onSnapshot(snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

/* ---- participantes (se anotan al leer el QR) ---- */
function rgRegistrarParticipante(nombre) {
  return rgEventoRef().collection("participantes").add({
    nombre: nombre.trim(),
    isVip: false,
    registradoAt: firebase.firestore.FieldValue.serverTimestamp(),
    categoriasVotadas: {}
  }).then(ref => ref.id);
}
function rgEscucharParticipantes(cb) {
  return rgEventoRef().collection("participantes").orderBy("registradoAt", "asc")
    .onSnapshot(snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}
function rgObtenerParticipante(participanteId) {
  return rgEventoRef().collection("participantes").doc(participanteId).get()
    .then(doc => doc.exists ? { id: doc.id, ...doc.data() } : null);
}
async function rgMarcarVip(participanteId) {
  const db = rgInit();
  const col = rgEventoRef().collection("participantes");
  const actuales = await col.where("isVip", "==", true).get();
  const batch = db.batch();
  actuales.forEach(doc => { if (doc.id !== participanteId) batch.set(doc.ref, { isVip: false }, { merge: true }); });
  batch.set(col.doc(participanteId), { isVip: true }, { merge: true });
  return batch.commit();
}
function rgQuitarVip(participanteId) {
  return rgEventoRef().collection("participantes").doc(participanteId).set({ isVip: false }, { merge: true });
}

/* ---- votos ----
   Un voto por participante por categoría (votar de nuevo pisa el
   voto anterior en esa categoría, no crea duplicados). El peso
   (VIP x3 / normal x1) se aplica al calcular totales, no acá, para
   que marcar/desmarcar VIP en el dashboard afecte el resultado
   incluso sobre votos ya emitidos. */
function rgEmitirVoto(participanteId, categoriaId, perfilId, puntos) {
  const votoId = participanteId + "__" + categoriaId;
  const db = rgInit();
  const batch = db.batch();
  batch.set(rgEventoRef().collection("votos").doc(votoId), {
    participanteId, categoriaId, perfilId,
    puntos: Math.max(RULETA_CONFIG.puntosMin, Math.min(RULETA_CONFIG.puntosMax, Number(puntos) || 0)),
    actualizadoAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  batch.set(rgEventoRef().collection("participantes").doc(participanteId), {
    categoriasVotadas: { [categoriaId]: true }
  }, { merge: true });
  return batch.commit();
}
function rgEscucharVotos(cb) {
  return rgEventoRef().collection("votos").onSnapshot(snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

/* ---- estado del evento (activación / resultados revelados) ---- */
function rgEscucharEstado(cb) {
  return rgEventoRef().onSnapshot(doc => cb(doc.exists ? doc.data() : {}));
}
function rgRevelarCategoria(categoriaId, resultado) {
  return rgEventoRef().set({
    revelado: { [categoriaId]: resultado }
  }, { merge: true });
}
async function rgReiniciarRonda() {
  const db = rgInit();
  for (const coleccion of ["perfiles", "participantes", "votos"]) {
    const snap = await rgEventoRef().collection(coleccion).get();
    const batch = db.batch();
    snap.forEach(d => batch.delete(d.ref));
    if (!snap.empty) await batch.commit();
  }
  return rgEventoRef().set({ revelado: {} });
}

/* ---- totales ponderados por categoría ----
   total(perfil) = suma de (puntos del voto * peso del votante)
   peso: RULETA_CONFIG.pesoVip si el participante es VIP, si no pesoNormal. */
function rgCalcularTotales(perfiles, participantes, votos, categoriaId) {
  const pesoPorParticipante = {};
  participantes.forEach(p => { pesoPorParticipante[p.id] = p.isVip ? RULETA_CONFIG.pesoVip : RULETA_CONFIG.pesoNormal; });

  const totales = {};
  const votosPorPerfil = {};
  perfiles.forEach(pf => { totales[pf.id] = 0; votosPorPerfil[pf.id] = 0; });

  votos.filter(v => v.categoriaId === categoriaId).forEach(v => {
    const peso = pesoPorParticipante[v.participanteId] ?? RULETA_CONFIG.pesoNormal;
    if (!(v.perfilId in totales)) { totales[v.perfilId] = 0; votosPorPerfil[v.perfilId] = 0; }
    totales[v.perfilId] += (Number(v.puntos) || 0) * peso;
    votosPorPerfil[v.perfilId] += 1;
  });

  return perfiles
    .map(pf => ({ perfil: pf, total: totales[pf.id] || 0, votos: votosPorPerfil[pf.id] || 0 }))
    .sort((a, b) => b.total - a.total);
}
