CREATE TABLE IF NOT EXISTS qa_cases (
  id text PRIMARY KEY,
  title varchar(130) NOT NULL,
  description text NOT NULL DEFAULT '',
  severity varchar(12) NOT NULL CHECK (severity IN ('critical','high','medium','low')),
  source varchar(100) NOT NULL,
  steps jsonb NOT NULL CHECK (jsonb_typeof(steps) = 'array'),
  status varchar(20) NOT NULL DEFAULT 'ready',
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS qa_cases_severity_idx ON qa_cases (severity);
CREATE INDEX IF NOT EXISTS qa_cases_updated_idx ON qa_cases (updated_at DESC);

CREATE TABLE IF NOT EXISTS qa_runs (
  id text PRIMARY KEY,
  case_id text NOT NULL,
  case_title varchar(130) NOT NULL,
  status varchar(12) NOT NULL CHECK (status IN ('passed','failed')),
  source varchar(60) NOT NULL,
  duration_ms integer NOT NULL CHECK (duration_ms >= 0),
  events jsonb NOT NULL CHECK (jsonb_typeof(events) = 'array'),
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS qa_runs_case_idx ON qa_runs (case_id);
CREATE INDEX IF NOT EXISTS qa_runs_created_idx ON qa_runs (created_at DESC);

CREATE TABLE IF NOT EXISTS qa_projects (
  id uuid PRIMARY KEY,
  name varchar(90) NOT NULL,
  project_key varchar(12) NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  accent char(7) NOT NULL,
  status varchar(20) NOT NULL CHECK (status IN ('active','archived')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS app_sessions (
  token_hash char(64) PRIMARY KEY,
  user_id varchar(80) NOT NULL,
  role varchar(20) NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_sessions_expires_idx ON app_sessions (expires_at);

CREATE TABLE IF NOT EXISTS contact_messages (
  id uuid PRIMARY KEY,
  name varchar(100) NOT NULL,
  email varchar(180) NOT NULL,
  subject varchar(140) NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS contact_messages_created_idx ON contact_messages (created_at DESC);

CREATE TABLE IF NOT EXISTS platform_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
