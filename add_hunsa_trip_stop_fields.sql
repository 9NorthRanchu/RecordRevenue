-- Hunsa Trip itinerary metadata. Run once against the production D1 database.
ALTER TABLE TripStops ADD COLUMN end_time TEXT;
ALTER TABLE TripStops ADD COLUMN icon_asset TEXT;

-- A per-family image library is intentionally stored as URLs. Upload binaries belong in R2,
-- while D1 keeps only metadata and the immutable public URL.
CREATE TABLE IF NOT EXISTS TripIconAssets (
  asset_id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL,
  name TEXT NOT NULL,
  asset_url TEXT NOT NULL,
  prompt_note TEXT,
  created_by_user_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (family_id) REFERENCES Families(family_id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES Users(user_id) ON DELETE SET NULL
);
