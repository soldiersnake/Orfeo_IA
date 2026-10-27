# Conectar Orfeo con Gmail

Se hace **una sola vez** (unos 10 minutos). Es gratis.

## 1. Crear el proyecto en Google Cloud
1. Entra en <https://console.cloud.google.com> con tu cuenta de Gmail.
2. Arriba, en el selector de proyectos → **Proyecto nuevo** → nombre `Orfeo` → **Crear**. Asegúrate de tenerlo seleccionado.

## 2. Activar la API de Gmail
1. Menú → **APIs y servicios → Biblioteca**.
2. Busca **Gmail API** → **Habilitar**.

## 3. Pantalla de consentimiento (Google Auth Platform)
1. Menú → **APIs y servicios → Pantalla de consentimiento de OAuth** (o **Google Auth Platform**) → **Comenzar**.
2. Nombre de la app: `Orfeo`; correo de asistencia: el tuyo.
3. Público: **Externo**. Correo de contacto: el tuyo → **Crear**.
4. En **Público → Usuarios de prueba** → **Añadir usuarios** → tu Gmail → Guardar.

## 4. Crear las credenciales
1. **Clientes** (o *APIs y servicios → Credenciales*) → **Crear cliente** / *Crear credenciales → ID de cliente de OAuth*.
2. Tipo de aplicación: **Aplicación de escritorio**. Nombre: `Orfeo CLI` → **Crear**.
3. **Descargar JSON** y guárdalo como:
   ```
   apps/server/.secrets/gmail-credentials.json
   ```
   (La carpeta `.secrets/` está en `.gitignore`: nunca se sube a GitHub.)

## 5. Autorizar
```bash
pnpm gmail:auth
```
Se abre el navegador → elige tu cuenta → aviso *"Google no ha verificado esta aplicación"* → **Continuar** (la app es tuya) → marca los permisos → **Continuar**. Verás "¡Listo!".

Ya puedes usar `pnpm chat` y preguntarle por tus correos.

## Notas
- **Permisos pedidos:** leer correos y gestionar borradores (`gmail.readonly` + `gmail.compose`). Orfeo **no puede borrar** correos.
- **Caducidad:** mientras la app esté en modo *Prueba*, Google caduca la autorización a los **7 días**. Si Orfeo dice que no puede acceder, vuelve a ejecutar `pnpm gmail:auth`.
- **Revocar acceso** cuando quieras: <https://myaccount.google.com/permissions> → Orfeo → Quitar acceso.
