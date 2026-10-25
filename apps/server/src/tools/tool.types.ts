import type { z } from 'zod';

/**
 * Una herramienta que Orfeo puede usar.
 * `schema` valida los argumentos que manda el modelo (nunca confíes en ellos a ciegas)
 * y `parameters` es el mismo esquema en JSON Schema, que es lo que lee el modelo.
 */
export interface OrfeoTool<A = any> {
  name: string;
  description: string;
  parameters: object;
  schema: z.ZodType<A>;
  /** Devuelve texto que el modelo leerá como resultado. */
  execute(args: A): Promise<string>;
}

/** Token multi-proveedor: cada tool se registra con él y el registro las recoge todas. */
export const ORFEO_TOOLS = Symbol('ORFEO_TOOLS');
