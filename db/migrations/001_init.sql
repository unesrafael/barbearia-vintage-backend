-- =============================================================
-- Barbearia Vintage - schema inicial
-- =============================================================
-- Quatro entidades cobrem todo o escopo pedido pelo cliente:
--   users        -> funcionarios autorizados (nao existe cadastro publico)
--   clients      -> nome, email, telefone e observacoes gerais
--   services     -> os servicos oferecidos pela barbearia
--   appointments -> a agenda em si, ligando cliente + servico + horario
-- =============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Os quatro status pedidos na carta, como tipo nativo do banco.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'appointment_status') THEN
    CREATE TYPE appointment_status AS ENUM (
      'AGENDADO',
      'CONCLUIDO',
      'CANCELADO',
      'NAO_COMPARECEU'
    );
  END IF;
END $$;

-- Mantem updated_at coerente sem depender do codigo da aplicacao.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -------------------------------------------------------------
-- users
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text        NOT NULL,
  email         text        NOT NULL UNIQUE,
  password_hash text        NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- -------------------------------------------------------------
-- clients
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clients (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  email      text        NOT NULL,          -- obrigatorio: alimenta a automacao do n8n
  phone      text,
  notes      text,                           -- "observacoes gerais" da carta
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clients_name  ON clients (lower(name));
CREATE INDEX IF NOT EXISTS idx_clients_email ON clients (lower(email));

DROP TRIGGER IF EXISTS trg_clients_updated ON clients;
CREATE TRIGGER trg_clients_updated
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- -------------------------------------------------------------
-- services
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS services (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL,
  duration_min integer     NOT NULL DEFAULT 30 CHECK (duration_min > 0),
  price_cents  integer     NOT NULL           CHECK (price_cents >= 0),
  active       boolean     NOT NULL DEFAULT true,  -- desativa sem apagar o historico
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- -------------------------------------------------------------
-- appointments
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS appointments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  starts_at     timestamptz        NOT NULL,   -- SEMPRE gravado em UTC
  status        appointment_status NOT NULL DEFAULT 'AGENDADO',
  notes         text,
  client_id     uuid NOT NULL REFERENCES clients(id)  ON DELETE RESTRICT,
  service_id    uuid NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  created_by_id uuid NOT NULL REFERENCES users(id)    ON DELETE RESTRICT,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appointments_starts_at ON appointments (starts_at);
CREATE INDEX IF NOT EXISTS idx_appointments_client    ON appointments (client_id);

-- =============================================================
-- A regra que resolve a dor numero 1 da carta: horarios duplicados.
-- O banco recusa dois agendamentos no mesmo horario, ignorando os que
-- foram cancelados ou marcados como nao comparecido (esse horario volta
-- a ficar livre). A API traduz a violacao em HTTP 409.
-- =============================================================
CREATE UNIQUE INDEX IF NOT EXISTS uniq_horario_ativo
  ON appointments (starts_at)
  WHERE status IN ('AGENDADO', 'CONCLUIDO');

DROP TRIGGER IF EXISTS trg_appointments_updated ON appointments;
CREATE TRIGGER trg_appointments_updated
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
