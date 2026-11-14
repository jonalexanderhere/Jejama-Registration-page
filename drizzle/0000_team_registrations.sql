CREATE TABLE team_registrations (
  id TEXT PRIMARY KEY,
  team TEXT NOT NULL,
  participants TEXT NOT NULL,
  proof_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
