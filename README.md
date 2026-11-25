# web-atleta — Página del atleta (Tu Bici)

Página estática donde el atleta revisa el registro del **momento 1** de su bicicleta y acepta los términos.
Abre desde el link que el operador le manda por WhatsApp: `https://bici.tubicidondequieras.com/#TOKEN`.

- HTML + CSS + JS sin frameworks, sin build y sin dependencias ni scripts de terceros (ni fuentes externas ni analítica).
  La única fuente propia (`fuentes/`) se sirve desde la misma carpeta; es libre (SIL OFL 1.1) y su licencia va al lado.
- El token va después de `#`: el navegador **no** lo envía a GitHub Pages; solo `app.js` lo lee y lo manda a Apps Script.
- `noindex,nofollow`, `Referrer-Policy: no-referrer` y una Content-Security-Policy que solo permite hablar con Apps Script.

## Archivos

| Archivo | Para qué |
|---|---|
| `index.html` | Estructura y plantillas de los estados |
| `styles.css` | Diseño móvil primero con la marca Tu Bici |
| `app.js` | Lee el token, llama a `verRegistro`, `verFoto` y `aceptar` |
| `config.js` | **Solo** la URL `/exec` de la Web App. Nunca la `API_KEY` |
| `CNAME` | Dominio propio para GitHub Pages: `bici.tubicidondequieras.com` |
| `404.html` | Página para rutas que no existen |
| `privacidad/` | Política de Tratamiento de Datos (pública, sin scripts) |
| `fuentes/` | Barlow Condensed Bold solo con los dígitos (5,6 KB) para el número del dorsal, y su licencia `OFL.txt` |

## Versión 1.1

- Debajo del M1 aparece cada momento **cerrado** (2 a 4) con su texto informativo, fotos (`verFoto`), comentarios y
  su aceptación (`aceptarMomento`). Los textos salen de la hoja «Aceptación» del Sheet (`docs/hoja_aceptacion.tsv`).
- M2: autorización de **Aliados** en una pregunta aparte, Sí/No sin valor por defecto (obligatoria; el No no impide aceptar).
- M4: tras aceptar, texto de reseña y botón **Calificar en Google** (pestaña nueva, `rel="noopener"`), para todos.
- Pie con **Política de Tratamiento de Datos** (`LINK_POLITICA`; si no llega, `privacidad/`).
- `privacidad/index.html`: página pública e indexable, generada con `node herramientas/generar_politica.js "<fecha>"`
  desde `docs/politica_datos.md`. No se edita a mano.
- Con un backend 1.0 (sin `momentos`) o un link que solo tiene el M1, la página se ve igual que antes.
- Publicar **después** de actualizar el Apps Script de producción (la página usa `aceptarMomento`).

## Estados de la página

| Estado | Cuándo |
|---|---|
| Cargando | Mientras responde `verRegistro` |
| Link no válido | Sin token, token mal formado o el servidor responde `NO_ENCONTRADO` (no se dan pistas) |
| No pudimos cargar | Error de red; botón **Reintentar** |
| Pendiente de aceptar | Número, 13 campos, fotos del M1 (carga diferida con `verFoto`), comentarios, T&C y formulario |
| Gracias | Tras aceptar: "Gracias por confiar en Tu Bici, nos vemos en Cartagena." y las respuestas en solo lectura |
| Ya aceptado | Todo en solo lectura, con las respuestas y la fecha; sin controles |

Los POST (`aceptar`) van con `Content-Type: text/plain;charset=utf-8`: es una petición "simple" y el navegador
no hace *preflight* de CORS, que Apps Script no soporta.

## Accesibilidad

- Contraste AA: texto principal 13,8:1, secundario 6,2:1, botón 6,0:1; bordes de controles ≥ 3:1.
- Todos los controles tienen etiqueta (`label`, `fieldset`/`legend` en las preguntas Sí/No) y errores asociados con `aria-describedby`.
- Áreas táctiles de 44 px o más (opciones Sí/No de 48 px, botón de 52 px).
- Foco visible, `aria-live` en el contenido, `prefers-reduced-motion` respetado.

## Publicar en GitHub Pages

> CLAUDE.md §10: este repositorio es **público**. Solo contiene esta carpeta; nunca datos de atletas, claves ni la `API_KEY`.

1. **Configura la URL.** En `config.js`, reemplaza `https://script.google.com/macros/s/EJEMPLO/exec` por la URL `/exec`
   del despliegue de producción de Apps Script (*Implementar → Administrar implementaciones*).
2. **Crea el repositorio público** en GitHub (por ejemplo `tubici-atleta`) y sube **solo el contenido de esta carpeta**
   a la raíz de la rama `main`:
   ```bash
   cd web-atleta
   git init -b main
   git add index.html styles.css app.js config.js CNAME 404.html README.md fuentes/ privacidad/
   git commit -m "Página del atleta"
   git remote add origin https://github.com/<usuario>/tubici-atleta.git
   git push -u origin main
   ```
   Cada vez que cambies `styles.css`, `app.js` o `config.js`, sube el `?v=N` de sus enlaces en `index.html`:
   GitHub Pages y los navegadores guardan caché y el atleta podría ver la versión anterior.
3. **Activa Pages:** *Settings → Pages → Build and deployment → Source: Deploy from a branch*, rama `main`, carpeta `/ (root)`.
4. **Dominio propio:** en la misma pantalla, *Custom domain* = `bici.tubicidondequieras.com` (el archivo `CNAME` ya lo trae).
   Espera la verificación de DNS y marca **Enforce HTTPS** (el certificado puede tardar hasta 24 h la primera vez).

### Registro CNAME en GoDaddy

1. Entra a GoDaddy → *Mis productos* → dominio `tubicidondequieras.com` → **DNS** (*Administrar DNS*).
2. **Agregar nuevo registro**:

   | Tipo | Nombre | Valor | TTL |
   |---|---|---|---|
   | CNAME | `bici` | `<usuario>.github.io` | 1 hora |

   - El **Nombre** es solo `bici` (GoDaddy agrega el dominio).
   - El **Valor** es tu usuario u organización de GitHub seguido de `.github.io`, **sin** el nombre del repositorio y sin `https://`.
3. Guarda. La propagación suele tardar minutos (hasta 48 h). Para comprobar:
   ```bash
   nslookup bici.tubicidondequieras.com
   ```
   Debe responder con un alias a `<usuario>.github.io`.
4. Recomendado: en GitHub, *Settings → Pages → Verified domains*, verifica `tubicidondequieras.com` (registro TXT que GitHub
   indica) para que nadie más pueda usar el subdominio desde otra cuenta.

No se cambian los registros `A`/`@` del dominio principal: solo se agrega el subdominio `bici`.

## Probar localmente

Contra el backend local (`backend-apps-script/test/servidor-local.js`, datos ficticios en memoria):

1. Copia la carpeta a un directorio temporal y, **solo en la copia**:
   - en `config.js` pon `apiUrl: 'http://127.0.0.1:8787/exec'`;
   - en `index.html` cambia `connect-src https://script.google.com https://script.googleusercontent.com` por `connect-src http://127.0.0.1:8787`.
2. Sirve la copia: `python -m http.server 8080 --bind 127.0.0.1`.
3. Obtén un token de un atleta con el momento 1 cerrado (por ejemplo con `obtenerLink`) y abre
   `http://127.0.0.1:8080/#TOKEN`. Desde un celular conectado por USB: `adb reverse tcp:8080 tcp:8080` y `adb reverse tcp:8787 tcp:8787`.

El servidor local registra cualquier petición `OPTIONS`: si aparece, la página provocó un preflight (no debería).
