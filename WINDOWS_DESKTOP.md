# Generar el instalador `.exe` independiente para Windows (ÓpticaStudio)

## Paso previo en Google AI Studio
1. Arriba a la derecha de **Google AI Studio**, tocá **Share / Deploy** y publicá la app para que el enlace en la nube quede activo.
2. Descargá el proyecto en formato ZIP desde el botón de descarga/exportación de AI Studio y descomprimilo en una carpeta de tu PC con Windows (por ejemplo `C:\OpticaStudio`).

## Requisitos en tu PC con Windows
1. Descargá e instalá **Node.js (versión LTS)** desde `https://nodejs.org`.

## Comandos para generar el `.exe`
1. Abrí esa carpeta en Windows, hacé clic derecho en un espacio vacío → **Abrir en Terminal** (o abrí PowerShell y entrá a la carpeta).
2. Ejecutá estos tres comandos en orden:
   ```bash
   npm install
   npm install -D electron electron-builder
   npm run desktop:build
   ```
3. Cuando termine, abrí la subcarpeta **`release\`**: ahí vas a encontrar el instalador **`ÓpticaStudio Setup 1.0.0.exe`**.
4. Hacé doble clic en ese `.exe` para instalar **ÓpticaStudio** como un programa independiente de Windows en cualquier PC de tu óptica.
