-- Update Projects table
ALTER TABLE Projects ADD COLUMN travel_duration TEXT;
ALTER TABLE Projects ADD COLUMN tour_duration TEXT;

-- 8.2 TripStops: Multiple route stops
CREATE TABLE IF NOT EXISTS TripStops (
    stop_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    stop_date TEXT, -- YYYY-MM-DD
    time TEXT, -- HH:MM
    city TEXT,
    accommodation TEXT,
    restaurants TEXT, -- JSON array of restaurant names or text
    notes TEXT,
    is_starred INTEGER DEFAULT 0, -- 0 or 1
    latitude REAL,
    longitude REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES Projects(project_id) ON DELETE CASCADE
);

-- 8.3 TripBudgets: Budget by category
CREATE TABLE IF NOT EXISTS TripBudgets (
    budget_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    category_id TEXT NOT NULL,
    amount REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES Projects(project_id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES Categories(category_id)
);

-- 8.4 TripDocuments: Attach documents (flight tickets, hotel bookings)
CREATE TABLE IF NOT EXISTS TripDocuments (
    document_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    related_entity_id TEXT, -- Can be stop_id or trip_expense_id
    file_url TEXT NOT NULL,
    description TEXT,
    type TEXT DEFAULT 'general', -- 'ticket', 'booking', 'receipt', 'general'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES Projects(project_id) ON DELETE CASCADE
);
