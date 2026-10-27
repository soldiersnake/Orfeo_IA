import 'reflect-metadata';
import { exec } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname } from 'node:path';
import { validateEnv } from '../config/env';
import { createOAuthClient, GMAIL_SCOPES } from '../gmail/gmail-auth';

/**
 * Autoriza a Orfeo a usar tu Gmail (se hace una sola vez).
 * Abre el navegador, inicias sesión con Google, y el token se guarda en .secrets/ (nunca se sube a git).
 */
async function main() {
  // Carga apps/server/.env si existe (como hace Nest con ConfigModule)
  try {
    process.loadEnvFile('.env');
  } catch {
    /* sin .env: valores por defecto */
  }
  const env = validateEnv(process.env);

  // Servidor local temporal que recibe la respuesta de Google
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const redirectUri = `http://127.0.0.1:${port}`;

  const client = createOAuthClient(env.GMAIL_CREDENTIALS_PATH, redirectUri);
  const url = client.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: GMAIL_SCOPES });

  console.log('\n🔐 Abre este enlace para autorizar a Orfeo (se intentará abrir solo):\n');
  console.log(url, '\n');
  const opener = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(opener);

  const code = await new Promise<string>((resolve, reject) => {
    server.on('request', (req, res) => {
      const params = new URL(req.url ?? '/', redirectUri).searchParams;
      const error = params.get('error');
      const code = params.get('code');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        code
          ? '<h2>🎵 ¡Listo! Orfeo ya puede acceder a tu Gmail. Puedes cerrar esta pestaña.</h2>'
          : `<h2>No se pudo autorizar: ${error ?? 'sin código'}</h2>`,
      );
      if (code) resolve(code);
      else if (error) reject(new Error(error));
    });
  });
  server.close();

  const { tokens } = await client.getToken(code);
  mkdirSync(dirname(env.GMAIL_TOKEN_PATH), { recursive: true });
  writeFileSync(env.GMAIL_TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log(`✅ Token guardado en ${env.GMAIL_TOKEN_PATH}. Ya puedes usar "pnpm chat".`);
}

main().catch((err) => {
  console.error(`⚠️  ${(err as Error).message}`);
  process.exit(1);
});
