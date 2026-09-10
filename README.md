# Bot de Alertas de Trading con Bucle de Aprendizaje Autónomo

Copiloto de análisis técnico **de solo lectura**: ingiere estrategias
cuantitativas en JSON (extraídas de transcripciones de YouTube), analiza el
mercado en tiempo real vía Binance (streams públicos), emite alertas
informativas, registra cada señal en SQLite, mide su rendimiento real y usa
Claude para auto-criticar y ajustar sus propios filtros periódicamente.

**Este proyecto no ejecuta órdenes de ningún tipo.** Ver
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) para el diseño completo y el
diagrama de flujo de datos.

## Arranque rápido

```bash
npm install
cp .env.example .env      # rellena solo lo que vayas a usar
npm run db:init           # crea data/trading-alerts.db con el esquema
npm run ingest:example    # valida la estrategia de ejemplo incluida
npm run dev                # arranca el bot (mercado + alertas + resolver + feedback loop)
```

Otros comandos:

```bash
npm run build   # compila a dist/
npm run start   # ejecuta dist/index.js
npm run resolve # ejecuta un ciclo de resolución de señales pendientes manualmente
npm run learn   # dispara manualmente el bucle de autocrítica de Claude
```

## Estructura

```
src/
  security/     -> guardarraíl que impide cualquier credencial de trading
  types/        -> esquema Zod de estrategia.json + tipos de señal
  strategies/   -> loader + ejemplo de estrategia (JSON)
  market/       -> cliente Binance de solo lectura + indicadores + killzones
  engine/       -> motor de confluencias y gestión de riesgo
  alerts/       -> despachador de alertas (consola / Telegram / Discord)
  db/           -> esquema y repositorios SQLite (better-sqlite3)
  resolver/     -> job en background que marca WIN/LOSS
  learning/     -> prompt de autocrítica + cliente Claude + orquestador
docs/
  ARCHITECTURE.md -> diagrama de flujo y detalle de cada módulo
scripts/         -> utilidades de línea de comandos
```

## Añadir una nueva estrategia extraída de YouTube

Coloca un archivo `*.json` en `STRATEGIES_DIR` (por defecto
`src/strategies/examples/`) que cumpla el esquema de
[`src/types/strategy.ts`](src/types/strategy.ts). El loader lo valida con
Zod y lo rechaza (con un log claro) si el JSON no es válido — así un
pipeline de extracción automática con errores nunca puede tumbar el bot ni
generar señales corruptas.

Tipos de condición soportados out-of-the-box: `LIQUIDITY_SWEEP`, `FVG`,
`ORDER_BLOCK`, `EMA_TREND_FILTER`, `ATR_VOLATILITY_FILTER`. Para añadir un
nuevo tipo (por ejemplo un patrón propio), registra un evaluador con
`registerConditionEvaluator()` en `src/engine/confluenceEvaluator.ts` — el
resto del sistema no necesita cambios.

## Nota sobre las etiquetas de alerta

Tal como se especificó en los requisitos, la etiqueta verde usa el texto
`SELL` para señales `LONG` y la roja usa `SHORT` para señales `SHORT`
(ver `src/types/signal.ts::DIRECTION_LABEL`). Si el texto pretendía ser
`BUY` para los largos, es un cambio de una sola línea en ese archivo.

## Seguridad / Solo lectura

- No existe en el código ninguna función que firme peticiones privadas de un
  exchange. Los únicos endpoints usados son públicos (streams de mercado y
  `GET /api/v3/ticker/price`).
- `assertReadOnlyEnvironment()` aborta el arranque si detecta variables de
  entorno propias de credenciales de trading (API secrets, claves privadas,
  etc.), como defensa en profundidad adicional.
- El bucle de aprendizaje de Claude solo puede escribir
  `data/runtime-filters.json` (percentil de ATR, R:R mínimo, killzones
  bloqueadas) y por defecto requiere aprobación humana
  (`FEEDBACK_LOOP_AUTO_APPLY=false`) antes de aplicarse.

## Bucle de aprendizaje: qué hace exactamente

Cada `FEEDBACK_LOOP_INTERVAL_HOURS` (o al ejecutar `npm run learn`):

1. Lee de SQLite las señales resueltas (WIN/LOSS) de la ventana.
2. Agrega localmente estadísticas por killzone, día de la semana y
   estrategia (Claude no hace aritmética, solo interpreta datos agregados).
3. Envía el prompt de autocrítica (`src/learning/prompts/selfCritique.ts`) a
   Claude, exigiendo una respuesta JSON estricta con hallazgos y filtros
   recomendados.
4. Guarda la recomendación en `strategy_adjustments` (auditoría permanente)
   y, si está autorizado, la fusiona en `runtime-filters.json`.
