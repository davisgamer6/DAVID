# Bot de Alertas de Trading con Bucle de Aprendizaje Autónomo

Copiloto de análisis técnico **de solo lectura**: ingiere estrategias
cuantitativas en JSON (extraídas de transcripciones de YouTube), analiza el
mercado en tiempo real vía Binance (streams públicos), emite alertas
informativas, registra cada señal en SQLite, mide su rendimiento real y usa
Claude para auto-criticar y ajustar sus propios filtros periódicamente.

**Este proyecto no ejecuta órdenes de ningún tipo.** Ver
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) para el diseño completo y el
diagrama de flujo de datos.

## Modo fácil (sin usar la terminal)

Si no tienes experiencia programando:

1. Instala **Node.js** (una sola vez): entra a [nodejs.org](https://nodejs.org),
   descarga la versión **LTS** e instálala (Siguiente → Siguiente → Instalar).
2. Descarga este proyecto: en GitHub pulsa el botón verde **Code → Download ZIP**
   y descomprímelo en una carpeta (ej. tu Escritorio).
3. Abre esa carpeta y haz **doble clic** en:
   - `iniciar-bot.bat` si usas **Windows**
   - `iniciar-bot.command` si usas **Mac**
   - `iniciar-bot.sh` si usas **Linux**

Ese archivo hace todo por ti (instalar, preparar la base de datos, y encender
el bot) y te avisa si falta algo. La primera vez tarda 1-2 minutos; las
siguientes veces arranca casi al instante. Para apagarlo, cierra la ventana
negra que se abrió o presiona `Ctrl+C` dentro de ella.

Para añadir tus propias estrategias en este modo, solo copia tu archivo
`.json` dentro de la carpeta `src/strategies/examples` y vuelve a hacer
doble clic en el iniciador.

## Modo 24/7 (sin dejar una ventana abierta)

Los iniciadores de arriba (`iniciar-bot.*`) requieren dejar esa ventana
negra abierta todo el tiempo — si la cierras, el bot se apaga. Para que
corra en segundo plano de forma continua (y se reinicie solo si llegara a
fallar), usa en su lugar:

- `bot-24-7-iniciar.bat` (Windows) / `.command` (Mac) / `.sh` (Linux)
- `ver-alertas.bat` / `.command` / `.sh` — para ver las alertas en vivo cuando quieras
- `bot-24-7-apagar.bat` / `.command` / `.sh` — para apagarlo por completo

Esto usa [PM2](https://pm2.keymetrics.io/), un administrador de procesos
estándar de Node.js: descarga el bot como cualquier programa de segundo
plano (como los que usan las apps de escritorio), sin instalarlo de forma
permanente en tu sistema.

**Importante — qué significa "24/7" aquí:** el bot corre continuamente
**mientras la computadora esté encendida**. Si apagas la computadora, el
bot se apaga con ella (es lo esperado: es tu computadora, no un servidor).
Para que arranque solo cada vez que la enciendas:

1. Presiona `Win + R`, escribe `shell:startup` y presiona Enter (se abre
   una carpeta de Windows).
2. En la carpeta del bot, haz **clic derecho** sobre `bot-24-7-iniciar.bat`
   → **Crear acceso directo**.
3. Arrastra ese acceso directo a la carpeta que se abrió en el paso 1.

Listo — desde la próxima vez que enciendas la computadora, el bot arranca
solo en segundo plano.

Si en cambio quieres que corra de verdad las 24 horas sin depender de que
tu computadora esté prendida, la alternativa es alquilar un servidor barato
en la nube (VPS) que sí está siempre encendido, y correr ahí estos mismos
comandos — es una opción más avanzada, pregúntame si te interesa explorarla.

## Arranque rápido (modo terminal)

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
  db/           -> esquema y repositorios SQLite (node:sqlite, sin dependencias nativas)
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

Tipos de condición soportados out-of-the-box:

| Tipo | Qué detecta |
|---|---|
| `LIQUIDITY_SWEEP` | Mecha que rompe un máximo/mínimo reciente y el cuerpo cierra de vuelta adentro |
| `BREAK_OF_STRUCTURE` | MSS/CHoCH: el **cierre** de la vela (no solo la mecha) queda más allá de la estructura previa |
| `FVG` | Fair Value Gap; con `requireConsequentEncroachment: true` exige que el precio esté justo en el punto medio del hueco (CE) |
| `ORDER_BLOCK` | Vela de origen de un impulso fuerte, con línea proximal (apertura) y distal (mecha extrema); se invalida si una vela posterior cerró más allá de la distal |
| `OTE_FIBONACCI` | Retroceso del precio dentro de la banda 62%-79% (Optimal Trade Entry) del último tramo impulsivo |
| `VOLUME_CLIMACTIC_DELTA` | Pico de volumen (múltiplo configurable del promedio) + Delta comprador/vendedor, calculado con el volumen de takers que Binance ya reporta en el stream de klines |
| `EMA_TREND_FILTER` | Precio por encima/debajo de una media móvil exponencial |
| `RSI_FILTER` | RSI en sobrecompra/sobreventa (entradas en retroceso) |
| `ATR_VOLATILITY_FILTER` | Percentil de volatilidad (ATR) reciente |

Para añadir un nuevo tipo (por ejemplo un patrón propio), registra un
evaluador con `registerConditionEvaluator()` en
`src/engine/confluenceEvaluator.ts` — el resto del sistema no necesita
cambios.

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
