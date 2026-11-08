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

Sin firma, Windows muestra el aviso de SmartScreen al instalar. Para firmar:

1. Hacer público el repositorio (la licencia MIT ya cumple el requisito de código abierto).
2. Solicitar el proyecto en <https://signpath.org/> (programa para proyectos de código abierto) y esperar la aprobación.
3. En SignPath crear el proyecto con el slug `opengantt-bim` y una política de firma `release-signing`
   (los nombres están en el workflow; si usas otros, cámbialos allí).
4. En el repositorio de GitHub (Settings → Secrets and variables → Actions):
   - **Secret** `SIGNPATH_API_TOKEN`: el token de la API de SignPath.
   - **Variable** `SIGNPATH_ORGANIZATION_ID`: el ID de tu organización en SignPath.

Mientras la variable `SIGNPATH_ORGANIZATION_ID` no exista, el workflow publica el instalador sin firmar.

Cosas a tener en cuenta:
- El workflow firma el instalador, no el `.exe` de la aplicación que va dentro.
- Al firmar cambia el contenido del instalador: `scripts/write-latest-yml.mjs` recalcula `latest.yml`
  y el archivo `.blockmap` no se publica (las actualizaciones bajan el instalador completo).
- Nada de esto se ha probado todavía en GitHub: la primera versión servirá de prueba.
