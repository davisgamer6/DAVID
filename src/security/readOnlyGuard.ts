/**
 * MODULO DE SEGURIDAD Y RESTRICCION DE OPERATIVA (HUMAN-IN-THE-LOOP)
 * ============================================================================
 * Este bot NUNCA debe poder colocar, modificar o cancelar ordenes. Es un
 * copiloto de analisis: su unica salida operativa es una ALERTA INFORMATIVA.
 *
 * Garantias de diseño (no solo de configuracion):
 *   1. En todo el codigo fuente no existe ninguna funcion que firme
 *      peticiones privadas de un exchange (no hay HMAC de API secret, no hay
 *      llamadas a /order, /trade, /withdraw, etc). Los unicos endpoints de
 *      Binance usados son PUBLICOS (streams de mercado y REST de solo
 *      lectura), que no requieren API key.
 *   2. `assertReadOnlyEnvironment()` se ejecuta al arrancar el proceso
 *      (ver src/index.ts) y aborta inmediatamente si detecta en el entorno
 *      cualquier variable que sugiera credenciales de trading (API secrets,
 *      claves privadas, tokens de retiro, etc.). Es una defensa en
 *      profundidad: aunque alguien añada dichas variables por error, el bot
 *      se niega a iniciar.
 *   3. El bucle de aprendizaje de Claude (ver src/learning) tampoco puede
 *      operar directamente: solo puede escribir un archivo de "filtros de
 *      runtime" que la estrategia lee de forma pasiva. Cualquier ajuste
 *      queda ademas registrado en SQLite para auditoria/aprobacion humana.
 */

const FORBIDDEN_ENV_PATTERNS: RegExp[] = [
  /API_SECRET/i,
  /SECRET_KEY/i,
  /PRIVATE_KEY/i,
  /WALLET_SEED/i,
  /WITHDRAW/i,
  /TRADE_KEY/i,
  /ORDER_KEY/i,
  /EXCHANGE_SECRET/i,
];

// Permitimos explicitamente variables que, aunque contengan "KEY", son
// inequivocamente de solo lectura / de terceros ajenos a exchanges.
const ALLOWLIST = new Set(["ANTHROPIC_API_KEY", "TELEGRAM_BOT_TOKEN"]);

export function assertReadOnlyEnvironment(): void {
  const offendingVars = Object.keys(process.env).filter((key) => {
    if (ALLOWLIST.has(key)) return false;
    return FORBIDDEN_ENV_PATTERNS.some((pattern) => pattern.test(key));
  });

  if (offendingVars.length > 0) {
    throw new Error(
      "[SECURITY-GUARD] Se detectaron variables de entorno propias de " +
        "credenciales de trading, lo cual esta prohibido en este sistema " +
        `(solo lectura / solo alertas): ${offendingVars.join(", ")}. ` +
        "Elimina esas variables. Este bot no debe tener nunca capacidad de " +
        "operar en un exchange."
    );
  }
}

/**
 * Lista blanca de "efectos" permitidos como resultado de una señal.
 * Cualquier cosa fuera de esta lista debe ser rechazada por diseño.
 */
export const ALLOWED_SIGNAL_OUTPUTS = Object.freeze([
  "CONSOLE_LOG",
  "TELEGRAM_MESSAGE",
  "DISCORD_MESSAGE",
  "SQLITE_RECORD",
] as const);

export type AllowedSignalOutput = (typeof ALLOWED_SIGNAL_OUTPUTS)[number];
