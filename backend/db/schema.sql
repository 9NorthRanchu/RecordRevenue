-- schema.sql
PRAGMA foreign_keys = OFF;

-- Drop tables if they exist (for clean deployment/updates)
DROP TABLE IF EXISTS Settlements;
DROP TABLE IF EXISTS TransactionDetails;
DROP TABLE IF EXISTS Transactions;
DROP TABLE IF EXISTS Accounts;
DROP TABLE IF EXISTS UserPermissions;
DROP TABLE IF EXISTS Entities;
DROP TABLE IF EXISTS Users;
DROP TABLE IF EXISTS Families;
DROP TABLE IF EXISTS Categories;
DROP TABLE IF EXISTS Captions;
DROP TABLE IF EXISTS Contacts;
DROP TABLE IF EXISTS Projects;

-- 1. Families: กลุ่มครอบครัวสำหรับแชร์ Master Data ร่วมกัน
CREATE TABLE Families (
    family_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Users: ข้อมูลผู้ใช้งานที่เข้าสู่ระบบ
CREATE TABLE Users (
    user_id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT UNIQUE,
    line_user_id TEXT UNIQUE,
    role TEXT DEFAULT 'member', -- 'admin' หรือ 'member'
    password TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (family_id) REFERENCES Families(family_id)
);

-- 3. Entities (Head Owners): บัญชีคุมระดับหน่วยงาน/เจ้าของรายการ (ส่วนตัว หรือ บริษัท A, B, C)
CREATE TABLE Entities (
    entity_id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL,
    name TEXT NOT NULL,
    is_company INTEGER DEFAULT 0, -- 0 = ส่วนตัว, 1 = บริษัท
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (family_id) REFERENCES Families(family_id)
);

-- 4. UserPermissions: ตารางระบุว่าผู้ใช้คนใดเข้าถึงข้อมูลของ Entity ใดได้บ้าง
CREATE TABLE UserPermissions (
    user_id TEXT,
    entity_id TEXT,
    PRIMARY KEY (user_id, entity_id),
    FOREIGN KEY (user_id) REFERENCES Users(user_id),
    FOREIGN KEY (entity_id) REFERENCES Entities(entity_id)
);

-- 5. Accounts (Statements): บัญชีการเงินสำหรับการทำรายการ (เช่น บัญชีธนาคาร, เงินสด, บัตรเครดิต)
CREATE TABLE Accounts (
    account_id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL,
    name TEXT NOT NULL, -- เช่น "KBank บริษัท A", "เงินสด นาย ก"
    bank_name TEXT, -- เช่น "Kbank", "SCB", "BAY", "KTB", "Cash"
    account_number TEXT,
    balance REAL DEFAULT 0.0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (entity_id) REFERENCES Entities(entity_id)
);

-- 6. Captions: หมวดหมู่หลัก (เช่น Asset, Liability, Revenue, Expense)
CREATE TABLE Captions (
    caption_id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL,
    name TEXT NOT NULL,
    behavior TEXT CHECK(behavior IN ('REVENUE', 'EXPENSE', 'ASSET', 'LIABILITY', 'TRANSFER')) NOT NULL,
    default_entity_id TEXT,
    default_contact_id TEXT,
    default_type TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (family_id) REFERENCES Families(family_id),
    FOREIGN KEY (default_entity_id) REFERENCES Entities(entity_id),
    FOREIGN KEY (default_contact_id) REFERENCES Contacts(contact_id)
);

-- 6.1 Categories (Group Details): ประเภทย่อย (เช่น ค่าบริการทำบัญชี, ค่าอาหาร, ลูกหนี้หมุนเวียน)
CREATE TABLE Categories (
    category_id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL,
    name TEXT NOT NULL,
    caption_id TEXT NOT NULL,
    default_entity_id TEXT,
    default_contact_id TEXT,
    default_type TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (family_id) REFERENCES Families(family_id),
    FOREIGN KEY (caption_id) REFERENCES Captions(caption_id),
    FOREIGN KEY (default_entity_id) REFERENCES Entities(entity_id),
    FOREIGN KEY (default_contact_id) REFERENCES Contacts(contact_id)
);

-- 7. Contacts (Customers): คู่ค้า/ลูกค้า/บุคคลภายนอก สำหรับใช้อ้างอิงและคุมลูกหนี้รายตัว
CREATE TABLE Contacts (
    contact_id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL,
    name TEXT NOT NULL,
    contact_type TEXT CHECK(contact_type IN ('CUSTOMER', 'VENDOR', 'OTHER')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (family_id) REFERENCES Families(family_id)
);

-- 8. Projects (Trips): รหัสกิจกรรม คุมการท่องเที่ยวหรือทริป (เช่น Hokkaido2025) หรือโปรเจกต์พิเศษ
CREATE TABLE Projects (
    project_id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'active', -- 'active' หรือ 'closed'
    start_date TEXT,
    end_date TEXT,
    destination TEXT,
    members TEXT, -- JSON array of members
    total_budget REAL,
    trip_password TEXT, -- Password for external guest login
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (family_id) REFERENCES Families(family_id)
);

-- 8.1 TripExpenses: บันทึกค่าใช้จ่ายรายวันสำหรับทริปโดยเฉพาะ
CREATE TABLE TripExpenses (
    trip_expense_id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    expense_date TEXT NOT NULL,
    member_id TEXT, -- ระบุคนจ่าย/ผู้ร่วมทริป
    type TEXT DEFAULT 'EXPENSE', -- 'TOPUP', 'EXPENSE', 'REFUND'
    category_id TEXT,
    amount_foreign REAL,
    amount_thb REAL NOT NULL,
    paid_from_account_id TEXT,
    latitude REAL,
    longitude REAL,
    receipt_image_url TEXT,
    note TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES Projects(project_id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES Categories(category_id),
    FOREIGN KEY (paid_from_account_id) REFERENCES Accounts(account_id)
);

-- 9. Transactions (Header): รายการหลักบันทึกยอดเงินเข้าออกบัญชีธนาคาร (อ้างอิงกับ Slip หรือ Statement)
CREATE TABLE Transactions (
    transaction_id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    ref_code TEXT, -- รหัสอ้างอิงธุรกรรมจากธนาคาร
    date TEXT NOT NULL, -- รูปแบบ YYYY-MM-DD
    time TEXT, -- รูปแบบ HH:MM:SS
    total_amount REAL NOT NULL, -- ยอดเงินรวมของธุรกรรม (ต้องเท่ากับผลรวมของรายการย่อยด้านล่าง)
    statement_desc TEXT, -- รายละเอียด/ช่องทางดั้งเดิมจากธนาคาร
    status TEXT CHECK(status IN ('PENDING_REVIEW', 'CONFIRMED')) DEFAULT 'PENDING_REVIEW',
    source TEXT CHECK(source IN ('LINE_SLIP', 'LINE_TEXT', 'PDF_IMPORT', 'WEB_GRID')) NOT NULL,
    slip_image_url TEXT,
    created_by_user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES Accounts(account_id),
    FOREIGN KEY (created_by_user_id) REFERENCES Users(user_id)
);

-- 10. TransactionDetails (Lines): รายการย่อยที่เกิดจากการบันทึกธุรกรรม (รองรับการ Split ยอดเงิน)
CREATE TABLE TransactionDetails (
    detail_id TEXT PRIMARY KEY,
    transaction_id TEXT NOT NULL,
    amount REAL NOT NULL, -- ยอดเงินย่อย
    fee REAL DEFAULT 0.0, -- ค่าธรรมเนียม (ถ้ามี)
    wht REAL DEFAULT 0.0, -- ภาษีหัก ณ ที่จ่าย (ถ้ามี)
    category_id TEXT NOT NULL,
    entity_id TEXT, -- ระบุบริษัท/บุคคลที่เป็นเจ้าของรายการย่อยนี้ (Head Owner)
    contact_id TEXT, -- ระบุลูกค้า (ถ้าเกี่ยวข้อง)
    project_id TEXT, -- ระบุทริป/โปรเจกต์ (ถ้าเกี่ยวข้อง เช่น Hokkaido2025)
    note TEXT, -- รายละเอียดเพิ่มเติมของรายการย่อย
    type TEXT CHECK(type IN ('DEBIT_AR', 'CREDIT_AR', 'INCOME', 'EXPENSE', 'TRANSFER', 'OTHER')) NOT NULL,
    FOREIGN KEY (transaction_id) REFERENCES Transactions(transaction_id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES Categories(category_id),
    FOREIGN KEY (entity_id) REFERENCES Entities(entity_id),
    FOREIGN KEY (contact_id) REFERENCES Contacts(contact_id),
    FOREIGN KEY (project_id) REFERENCES Projects(project_id)
);

-- 11. Settlements: การเชื่อมโยงการตัดชำระหนี้ (ยืมเงิน/จ่ายแทน และคืนเงินบางส่วนหรือทั้งหมด)
CREATE TABLE Settlements (
    settlement_id TEXT PRIMARY KEY,
    parent_detail_id TEXT NOT NULL, -- ID รายการที่ตั้งหนี้ (ประเภท DEBIT_AR หรือหนี้สิน)
    child_detail_id TEXT NOT NULL, -- ID รายการที่ชำระคืน (ประเภท CREDIT_AR หรือการตัดยอด)
    settled_amount REAL NOT NULL, -- ยอดชำระที่ใช้หักล้างในรอบนี้
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_detail_id) REFERENCES TransactionDetails(detail_id) ON DELETE CASCADE,
    FOREIGN KEY (child_detail_id) REFERENCES TransactionDetails(detail_id) ON DELETE CASCADE
);

-- 12. Debts: ทะเบียนหนี้สิน (เจ้าหนี้/ลูกหนี้)
CREATE TABLE Debts (
    debt_id TEXT PRIMARY KEY,
    family_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT CHECK(type IN ('PAYABLE', 'RECEIVABLE')) NOT NULL,
    contact_id TEXT NOT NULL,
    principal_category_id TEXT NOT NULL,
    interest_category_id TEXT,
    start_balance REAL NOT NULL,
    installment_amount REAL,
    start_date TEXT,
    icon_type TEXT DEFAULT 'credit_card',
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (family_id) REFERENCES Families(family_id),
    FOREIGN KEY (contact_id) REFERENCES Contacts(contact_id),
    FOREIGN KEY (principal_category_id) REFERENCES Categories(category_id),
    FOREIGN KEY (interest_category_id) REFERENCES Categories(category_id)
);
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
