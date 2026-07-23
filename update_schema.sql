PRAGMA foreign_keys=OFF;
CREATE TABLE Categories_new (
    category_id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, 
    default_entity_id TEXT, 
    default_contact_id TEXT, 
    default_type TEXT, 
    caption_id TEXT REFERENCES Captions(type_id),
    FOREIGN KEY (family_id) REFERENCES Families(family_id)
);
INSERT INTO Categories_new SELECT category_id, family_id, name, created_at, default_entity_id, default_contact_id, default_type, caption_id FROM Categories;
DROP TABLE Categories;
ALTER TABLE Categories_new RENAME TO Categories;
DROP TABLE AccountTypes;
PRAGMA foreign_keys=ON;
