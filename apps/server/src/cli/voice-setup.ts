import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { validateEnv, type Env } from '../config/env';
import { SpeachesClient } from '../voice/speaches.client';

/**
 * Prepara la voz de Orfeo:
 * 1) comprueba que Speaches responde, 2) descarga los modelos, 3) prueba de ida y vuelta:
 * Orfeo dice una frase (Kokoro) y Whisper la transcribe. Si coincide, todo funciona.
 */
async function main() {
  try {
    process.loadEnvFile('.env');
  } catch {
    /* sin .env: valores por defecto */
  }
  const env = validateEnv(process.env);
  const speaches = new SpeachesClient(new ConfigService<Env, true>(env));

  console.log(`\n1) Conectando con Speaches en ${env.SPEACHES_URL}...`);
  await speaches.call('/v1/models', { method: 'GET' });
  console.log('   ✅ Responde');

  for (const model of [env.STT_MODEL, env.TTS_MODEL]) {
    console.log(`2) Descargando ${model} (la primera vez puede tardar unos minutos)...`);
    await speaches.call(`/v1/models/${model}`, { method: 'POST' }, 15 * 60_000);
    console.log('   ✅ Listo');
  }

  const tests = [
    { language: 'es' as const, text: 'Hola Mariano, soy Orfeo. Ya puedo hablar contigo.' },
    { language: 'en' as const, text: 'Hi Mariano, I am Orfeo. Ready to practice English?' },
  ];
  for (const { language, text } of tests) {
    console.log(`3) Prueba de voz (${language}): "${text}"`);
    const t0 = Date.now();
    const audio = await speaches.synthesize(text, language);
    const t1 = Date.now();
    const heard = await speaches.transcribe(audio.data, audio.mimeType);
    const t2 = Date.now();
    console.log(`   🗣️  Voz generada en ${t1 - t0} ms (${Math.round(audio.data.length / 1024)} KB)`);
    console.log(`   👂 Whisper oyó en ${t2 - t1} ms [${heard.language}]: "${heard.text}"`);
  }
  console.log('\n🎵 Voz lista. Arranca el servidor (pnpm dev) y la web (pnpm web).\n');
}

main().catch((err) => {
  console.error(`\n⚠️  ${(err as Error).message}\n`);
  process.exit(1);
});
