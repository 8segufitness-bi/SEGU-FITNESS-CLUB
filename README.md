# SEGU × Masterclass — Dossier comercial

Dossier comercial digital para invitar marcas a las Masterclass de SEGU Fitness Club.
Página única en HTML/CSS/JS vanilla, pensada para abrirse directamente en el navegador
(sin build, sin dependencias) o para publicarse como una página web privada.

## Cómo verlo

Abrir `index.html` directamente en cualquier navegador.

## Estructura

```
index.html                    → el dossier completo (una sola página, 9 secciones)
inscripcion-masterclass.html  → formulario público de inscripción a la Masterclass
ruleta-gay-inscripcion.html   → juego de fiesta: página del QR (registro + votación)
ruleta-gay-dashboard.html     → juego de fiesta: panel privado del anfitrión/moderador
assets/js/ruleta-gay.js       → datos compartidos (Firebase) de la Ruleta Gay Amigxs
assets/images/                → fotografías reales (ver README.md dentro de la carpeta)
assets/brand/segu-logo.png    → isotipo SEGU usado en el header y como favicon
```

## Para el equipo SEGU

- **Fotografías**: reemplazar los archivos en `assets/images/` siguiendo la guía de
  nombres en `assets/images/README.md`. No requiere tocar código.
- **Datos pendientes**: buscar "POR CONFIRMAR" dentro de `index.html` (WhatsApp, email,
  sitio web y la cantidad de participantes de Lunes 7 y Jueves 10).
- Instrucciones de edición más detalladas están comentadas al inicio de `index.html`.

## Ruleta Gay Amigxs (juego de fiesta)

Juego de votación por QR para eventos: la gente se anota con su nombre, ve los
perfiles de Instagram que carga el anfitrión y vota por categoría (La Más
Chistosa, La Más Social, La Más Curada, La Más Putonga) con puntaje de 1 a 7.
Une participante puede marcarse como VIP y su voto vale x3. El anfitrión activa
la ruleta desde `ruleta-gay-dashboard.html` para revelar a la ganadora de cada
categoría.

Como necesita sincronizar en vivo el celular del anfitrión con el de cada
invitade, usa Firebase Firestore (gratis) en vez de Airtable. **Antes de usarla
en una fiesta real hay que conectar un proyecto propio** — instrucciones paso a
paso al inicio de `assets/js/ruleta-gay.js`. Mientras ese paso no esté hecho,
ambas páginas avisan en vez de romperse.
