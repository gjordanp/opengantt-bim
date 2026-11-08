# Publicar una versión

## Cada versión

```bash
npm version minor        # sube la versión en package.json y crea la etiqueta v0.2.0
git push --follow-tags   # el workflow "Release" construye y publica el instalador
```

El workflow (`.github/workflows/release.yml`) corre los tests, construye el instalador de Windows y lo
adjunta a un release de GitHub junto con `latest.yml`. Las instalaciones existentes consultan ese release
(electron-updater) y se actualizan solas. Para que esto funcione sin sesión de GitHub, el repositorio tiene
que ser **público**.

## Firma del instalador (SignPath Foundation, gratis para código abierto)

Sin firma, Windows muestra el aviso de SmartScreen al instalar. SignPath Foundation firma gratis proyectos
de código abierto. Los requisitos salen de <https://signpath.org/terms> (verificados el 2026-11-07; las
condiciones están marcadas como borrador, vuelve a leerlas antes de solicitar):

- Licencia aprobada por la OSI para todo el proyecto (MIT cumple), sin código propietario.
- Proyecto mantenido activamente, **ya publicado** en la forma que se va a firmar (hace falta al menos un release)
  y con la funcionalidad descrita en la página de descarga.
- Sin software malicioso ni herramientas de hacking.
- Privacidad: si la app envía datos a sistemas que el usuario no eligió, hace falta una política de privacidad.
  Si no, hay que declarar que no transfiere información salvo que el usuario lo pida. (Esta app solo consulta
  GitHub para buscar actualizaciones: declararlo.)
- Autenticación en dos pasos para todos los miembros, en SignPath y en GitHub.
- Una sección "Code signing policy" en el README y en la página de descargas, con el texto
  "Free code signing provided by SignPath.io, certificate by SignPath Foundation", los roles del equipo
  (autor, revisor, aprobador) y una declaración de privacidad.
- Cada release se aprueba a mano en SignPath. El certificado se emite a nombre de SignPath Foundation.
- Los jobs previos a la firma deben correr en agentes alojados por GitHub (`windows-latest` lo es).
- El nombre del producto debe ser el del proyecto y la versión debe ser la misma en todos los archivos firmados.

Cómo solicitarlo: formulario en <https://signpath.org/apply> (no se ha leído; los campos y el tiempo de
aprobación no constan en el sitio). El repositorio tiene que ser público.

Cuando lo aprueben:

1. En SignPath crear el proyecto `opengantt-bim` y la política `release-signing` (los nombres están en el
   workflow; si usas otros, cámbialos allí). Crear una *artifact configuration* cuya raíz sea el zip que
   sube el workflow (`<zip-file>`) y que firme el `.exe` del instalador.
2. En GitHub (Settings → Secrets and variables → Actions):
   - **Secret** `SIGNPATH_API_TOKEN`: el token de la API de SignPath.
   - **Variable** `SIGNPATH_ORGANIZATION_ID`: el ID de tu organización en SignPath.

Mientras la variable `SIGNPATH_ORGANIZATION_ID` no exista, el workflow publica el instalador sin firmar.
Esa primera versión sin firmar sirve además como el "release ya publicado" que piden.

Cosas a tener en cuenta:
- El workflow firma el instalador, no el `.exe` de la aplicación que va dentro.
- Al firmar cambia el contenido del instalador: `scripts/write-latest-yml.mjs` recalcula `latest.yml`
  y el archivo `.blockmap` no se publica (las actualizaciones bajan el instalador completo).
- El paso de SignPath del workflow sigue sin probarse (usa la acción `signpath/github-action-submit-signing-request@v3`);
  la documentación no menciona electron-builder, aunque un instalador NSIS es un `.exe`.
- Que el certificado sea de SignPath Foundation no garantiza que SmartScreen deje de avisar de inmediato:
  el sitio no habla de reputación.
