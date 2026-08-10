-- รายการค่าใช้จ่ายย่อยประจำทริป (2026-08-10)
--
-- ทำไมต้องมีตารางนี้ แทนที่จะตั้งไอคอนที่ Categories ตรง ๆ:
--   Categories เป็นผังบัญชีระดับ "ครอบครัว" ใช้ร่วมกันทุกทริป ตั้งไอคอนตรงนั้น
--   ได้แค่ 1 หมวด = 1 ไอคอน ซึ่งหยาบเกินไปสำหรับการใช้งานจริง
--
--   ที่ต้องการคือระดับที่ละเอียดกว่านั้นและเป็นของแต่ละทริปเอง เช่น
--     Hokkaido: ราเมง / ขนม / เครื่องดื่ม  → ทั้งสามผูกหมวดบัญชี "อาหาร" เหมือนกัน
--     Beijing:  อาหาร / เป็ดปักกิ่ง        → ผูกหมวด "อาหาร"
--               Alcohol                    → ผูกหมวด "Alcohol"
--
--   แต่ละแถวคือ "ปุ่มหนึ่งปุ่ม" ที่มีชื่อและไอคอนของตัวเอง แล้วชี้กลับไปหมวดบัญชี
--   หนึ่งหมวดสำหรับตอนปิดทริป — หลายแถวชี้หมวดเดียวกันได้
--
-- ⚠️ บิลอ้าง preset_id ไม่ใช่ก๊อปชื่อ/ไอคอนไปเก็บ เพราะฉะนั้นแก้ไอคอนหรือชื่อ
--    ที่นี่ทีเดียว บิลเก่าทุกใบในทริปที่ใช้รายการนั้นจะเปลี่ยนตามทันที

CREATE TABLE IF NOT EXISTS TripExpensePresets (
    preset_id   TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL,
    label       TEXT NOT NULL,           -- ชื่อที่โชว์บนปุ่มและบนบิล เช่น 'ราเมง'
    icon_url    TEXT,                    -- ไอคอนของรายการนี้ (data: URL หรือ URL เต็ม)
    category_id TEXT,                    -- หมวดบัญชีที่ผูกไว้ (Categories.category_id)
    sort_order  INTEGER DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id)  REFERENCES Projects(project_id),
    FOREIGN KEY (category_id) REFERENCES Categories(category_id)
);
CREATE INDEX IF NOT EXISTS idx_tep_preset_project ON TripExpensePresets(project_id);

-- บิลอ้างกลับมาที่รายการย่อย เพื่อให้แก้ไอคอน/ชื่อทีหลังแล้วบิลเก่าเปลี่ยนตาม
-- (ถ้ารันแล้วเจอ "duplicate column name" แปลว่ามีอยู่แล้ว ข้ามได้)
ALTER TABLE TripExpenseCategories ADD COLUMN preset_id TEXT;

-- ตรวจผล
SELECT 'TripExpensePresets' AS t, COUNT(*) AS n FROM TripExpensePresets;
