import { auth } from '@googleapis/gmail';
import { existsSync, readFileSync } from 'node:fs';

/** Permisos que pedimos: leer correos y gestionar borradores (enviar un borrador también entra aquí). */
export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
];

export type OAuth2Client = InstanceType<typeof auth.OAuth2>;

interface DesktopCredentials {
  installed: { client_id: string; client_secret: string };
}

/** Crea el cliente OAuth a partir del JSON que descargas de Google Cloud. */
export function createOAuthClient(credentialsPath: string, redirectUri?: string): OAuth2Client {
  if (!existsSync(credentialsPath)) {
    throw new Error(`No encuentro ${credentialsPath}. Sigue los pasos de docs/gmail-setup.md`);
  }
  const { installed } = JSON.parse(readFileSync(credentialsPath, 'utf8')) as DesktopCredentials;
  if (!installed) throw new Error('El JSON no es de un cliente OAuth de tipo "Aplicación de escritorio".');
  return new auth.OAuth2(installed.client_id, installed.client_secret, redirectUri);
}
