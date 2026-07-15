import pg from 'pg';

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  // Mantém CURRENT_DATE e casts ::date no fuso da clínica (não em UTC)
  options: `-c TimeZone=${process.env.TZ || 'America/Sao_Paulo'}`,
});

export const query = (text, params) => pool.query(text, params);

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'attendant' CHECK (role IN ('admin', 'attendant')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS service_types (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  priority INT NOT NULL DEFAULT 1,
  color TEXT NOT NULL DEFAULT '#2563eb',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS counters (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS tickets (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  number INT NOT NULL,
  service_type_id INT NOT NULL REFERENCES service_types(id),
  customer_name TEXT,
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'called', 'in_service', 'done', 'no_show', 'cancelled')),
  counter_id INT REFERENCES counters(id),
  attendant_id INT REFERENCES users(id),
  recall_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  called_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_created ON tickets(created_at);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS ads (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  image TEXT NOT NULL,
  duration_sec INT NOT NULL DEFAULT 10,
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS
  permissions TEXT NOT NULL DEFAULT '["atendimento","senhas"]';

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS return_count INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS email_schedules (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  recipients TEXT NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  send_time TEXT NOT NULL DEFAULT '07:00',
  weekday INT NOT NULL DEFAULT 1,
  monthday INT NOT NULL DEFAULT 1,
  subject TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  include_summary BOOLEAN NOT NULL DEFAULT TRUE,
  include_attendants BOOLEAN NOT NULL DEFAULT TRUE,
  attach_pdf BOOLEAN NOT NULL DEFAULT TRUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_sent_at TIMESTAMPTZ,
  last_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

export async function migrate() {
  await query(SCHEMA);
}

export async function seed(bcrypt) {
  const { rows: u } = await query('SELECT COUNT(*)::int AS n FROM users');
  if (u[0].n === 0) {
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', 10);
    await query(
      'INSERT INTO users (name, username, password_hash, role) VALUES ($1, $2, $3, $4)',
      ['Superusuário', process.env.ADMIN_USERNAME || 'admin', hash, 'admin']
    );
    console.log('Usuário admin criado');
  }
  const { rows: s } = await query('SELECT COUNT(*)::int AS n FROM service_types');
  if (s[0].n === 0) {
    await query(
      `INSERT INTO service_types (name, prefix, priority, color) VALUES
       ('Atendimento Normal', 'N', 1, '#2563eb'),
       ('Atendimento Preferencial', 'P', 2, '#d97706')`
    );
  }
  const { rows: c } = await query('SELECT COUNT(*)::int AS n FROM counters');
  if (c[0].n === 0) {
    await query(`INSERT INTO counters (name) VALUES ('Guichê 1'), ('Guichê 2')`);
  }
  await query(
    `INSERT INTO settings (key, value) VALUES
     ('company_name', 'Clínica'),
     ('brand_color', '#2563eb'),
     ('logo', ''),
     ('totem_theme', 'dark'),
     ('panel_theme', 'dark'),
     ('panel_sound', 'on'),
     ('panel_last_calls', '5'),
     ('app_domain', ''),
     ('pwd_min_length', '6'),
     ('pwd_require_upper', '0'),
     ('pwd_require_lower', '0'),
     ('pwd_require_number', '0'),
     ('pwd_require_special', '0')
     ON CONFLICT (key) DO NOTHING`
  );
}
