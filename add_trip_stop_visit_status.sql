-- เก็บการเปลี่ยนแผนโดยไม่ลบประวัติของ Stop
ALTER TABLE TripStops ADD COLUMN visit_status TEXT NOT NULL DEFAULT 'PLANNED';
ALTER TABLE TripStops ADD COLUMN skipped_reason TEXT;
ALTER TABLE TripStops ADD COLUMN highlight_text TEXT;

-- ชื่อแผนประจำวันเป็นข้อมูลระดับ Day ไม่ควรฝากไว้กับ Stop ใด Stop หนึ่ง
CREATE TABLE TripDayPlans (
  project_id TEXT NOT NULL,
  plan_date TEXT NOT NULL,
  title TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, plan_date),
  FOREIGN KEY (project_id) REFERENCES Projects(project_id) ON DELETE CASCADE
);
