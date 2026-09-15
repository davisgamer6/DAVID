-- MODULO DE EVALUACION Y BASE DE DATOS LOCAL (SQLite)
-- ============================================================================

CREATE TABLE IF NOT EXISTS signals (
  id              TEXT PRIMARY KEY,
  created_at      TEXT NOT NULL,
  strategy_id     TEXT NOT NULL,
  symbol          TEXT NOT NULL,
  direction       TEXT NOT NULL CHECK (direction IN ('LONG', 'SHORT')),
  entry_price     REAL NOT NULL,
  stop_loss       REAL NOT NULL,
  take_profit     REAL NOT NULL,
  risk_reward     REAL NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('PENDING', 'WIN', 'LOSS', 'EXPIRED')) DEFAULT 'PENDING',
  resolved_at     TEXT,
  exit_price      REAL,
  mae             REAL,
  mfe             REAL,
  context_json    TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_signals_status ON signals(status);
CREATE INDEX IF NOT EXISTS idx_signals_symbol ON signals(symbol);
CREATE INDEX IF NOT EXISTS idx_signals_strategy ON signals(strategy_id);
CREATE INDEX IF NOT EXISTS idx_signals_created_at ON signals(created_at);

-- Historial de auto-critica / recomendaciones generadas por Claude en el
-- bucle de aprendizaje. Queda auditado incluso si no se aplican en runtime.
CREATE TABLE IF NOT EXISTS strategy_adjustments (
  id                          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at                  TEXT NOT NULL,
  analysis_window_start       TEXT NOT NULL,
  analysis_window_end         TEXT NOT NULL,
  sample_size                 INTEGER NOT NULL,
  win_rate                    REAL,
  claude_summary              TEXT NOT NULL,
  recommended_filters_json    TEXT NOT NULL,
  applied                     INTEGER NOT NULL DEFAULT 0
);
