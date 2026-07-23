-- seed.sql
-- Seed script for testing record-revenue-db

-- 1. Seed Families
INSERT INTO Families (family_id, name) VALUES ('Fam_Default', 'ครอบครัวสุขสันต์');

-- 2. Seed Users
INSERT INTO Users (user_id, family_id, name, email, line_user_id, role, password) 
VALUES ('Usr_A', 'Fam_Default', 'นาย ก', 'user_a@example.com', 'U11111111111111111111111111111111', 'admin', '1234');

INSERT INTO Users (user_id, family_id, name, email, line_user_id, role, password) 
VALUES ('Usr_B', 'Fam_Default', 'นาย ข', 'user_b@example.com', 'U22222222222222222222222222222222', 'member', '1234');

-- 3. Seed Entities (Head Owners)
INSERT INTO Entities (entity_id, family_id, name, is_company) VALUES ('Ent_A_Personal', 'Fam_Default', 'นาย ก (ส่วนตัว)', 0);
INSERT INTO Entities (entity_id, family_id, name, is_company) VALUES ('Ent_Co_A', 'Fam_Default', 'บริษัท A', 1);
INSERT INTO Entities (entity_id, family_id, name, is_company) VALUES ('Ent_Co_B', 'Fam_Default', 'บริษัท B', 1);
INSERT INTO Entities (entity_id, family_id, name, is_company) VALUES ('Ent_Co_C', 'Fam_Default', 'บริษัท C', 1);
INSERT INTO Entities (entity_id, family_id, name, is_company) VALUES ('Ent_B_Personal', 'Fam_Default', 'นาย ข (ส่วนตัว)', 0);
INSERT INTO Entities (entity_id, family_id, name, is_company) VALUES ('Ent_Co_D', 'Fam_Default', 'บริษัท D', 1);

-- 4. Seed UserPermissions
-- นาย ก เข้าถึง นาย ก (ส่วนตัว), บริษัท A, B, C
INSERT INTO UserPermissions (user_id, entity_id) VALUES ('Usr_A', 'Ent_A_Personal');
INSERT INTO UserPermissions (user_id, entity_id) VALUES ('Usr_A', 'Ent_Co_A');
INSERT INTO UserPermissions (user_id, entity_id) VALUES ('Usr_A', 'Ent_Co_B');
INSERT INTO UserPermissions (user_id, entity_id) VALUES ('Usr_A', 'Ent_Co_C');

-- นาย ข เข้าถึง นาย ข (ส่วนตัว), บริษัท D
INSERT INTO UserPermissions (user_id, entity_id) VALUES ('Usr_B', 'Ent_B_Personal');
INSERT INTO UserPermissions (user_id, entity_id) VALUES ('Usr_B', 'Ent_Co_D');

-- 5. Seed Accounts
INSERT INTO Accounts (account_id, entity_id, name, bank_name, account_number, balance) 
VALUES ('Acc_A_Cash', 'Ent_A_Personal', 'เงินสด นาย ก', 'Cash', NULL, 5000.0);

INSERT INTO Accounts (account_id, entity_id, name, bank_name, account_number, balance) 
VALUES ('Acc_Co_A_KBank', 'Ent_Co_A', 'KBank บริษัท A', 'Kbank', '123-4-56789-0', 150000.0);

INSERT INTO Accounts (account_id, entity_id, name, bank_name, account_number, balance) 
VALUES ('Acc_B_Cash', 'Ent_B_Personal', 'เงินสด นาย ข', 'Cash', NULL, 2000.0);

INSERT INTO Accounts (account_id, entity_id, name, bank_name, account_number, balance) 
VALUES ('Acc_Co_D_SCB', 'Ent_Co_D', 'SCB บริษัท D', 'SCB', '987-6-54321-0', 85000.0);

-- 5.5 Seed Captions
INSERT INTO Captions (caption_id, family_id, name, behavior) VALUES ('Fam_Default_Cap_Revenue', 'Fam_Default', 'Revenue', 'REVENUE');
INSERT INTO Captions (caption_id, family_id, name, behavior) VALUES ('Fam_Default_Cap_Expense', 'Fam_Default', 'Expense', 'EXPENSE');
INSERT INTO Captions (caption_id, family_id, name, behavior) VALUES ('Fam_Default_Cap_Asset', 'Fam_Default', 'Asset', 'ASSET');
INSERT INTO Captions (caption_id, family_id, name, behavior) VALUES ('Fam_Default_Cap_Liability', 'Fam_Default', 'Liability', 'LIABILITY');
INSERT INTO Captions (caption_id, family_id, name, behavior) VALUES ('Fam_Default_Cap_Transfer', 'Fam_Default', 'Transfer', 'TRANSFER');

-- 6. Seed Categories
INSERT INTO Categories (category_id, family_id, name, default_type, caption_id) VALUES ('Cat_Audit', 'Fam_Default', 'รายได้ค่าตรวจสอบบัญชี', 'INCOME', 'Fam_Default_Cap_Revenue');
INSERT INTO Categories (category_id, family_id, name, default_type, caption_id) VALUES ('Cat_Account', 'Fam_Default', 'รายได้ค่าบริการบัญชี', 'INCOME', 'Fam_Default_Cap_Revenue');
INSERT INTO Categories (category_id, family_id, name, default_type, caption_id) VALUES ('Cat_Service', 'Fam_Default', 'รายได้ค่าบริการอื่นๆ', 'INCOME', 'Fam_Default_Cap_Revenue');
INSERT INTO Categories (category_id, family_id, name, default_type, caption_id) VALUES ('Cat_Food', 'Fam_Default', 'ค่าอาหารและเครื่องดื่ม', 'EXPENSE', 'Fam_Default_Cap_Expense');
INSERT INTO Categories (category_id, family_id, name, default_type, caption_id) VALUES ('Cat_Rent', 'Fam_Default', 'ค่าเช่าสถานที่', 'EXPENSE', 'Fam_Default_Cap_Expense');
INSERT INTO Categories (category_id, family_id, name, default_type, caption_id) VALUES ('Cat_AR_Cust', 'Fam_Default', 'ลูกหนี้หมุนเวียน (จ่ายแทนลูกค้า)', 'ASSET', 'Fam_Default_Cap_Asset');
INSERT INTO Categories (category_id, family_id, name, default_type, caption_id) VALUES ('Cat_AR_Friend', 'Fam_Default', 'เงินให้กู้ยืม (เพื่อน)', 'ASSET', 'Fam_Default_Cap_Asset');
INSERT INTO Categories (category_id, family_id, name, default_type, caption_id) VALUES ('Cat_Transfer', 'Fam_Default', 'โอนเงินระหว่างบัญชี', 'ASSET', 'Fam_Default_Cap_Transfer');
INSERT INTO Categories (category_id, family_id, name, caption_id) VALUES ('Cat_Uncategorized', 'Fam_Default', 'รอการระบุ (Uncategorized)', 'Fam_Default_Cap_Expense');

-- 7. Seed Contacts (Customers / Vendors)
INSERT INTO Contacts (contact_id, family_id, name, contact_type) VALUES ('Cont_Cust_LSDW', 'Fam_Default', '[W01] ACC LSDW', 'CUSTOMER');
INSERT INTO Contacts (contact_id, family_id, name, contact_type) VALUES ('Cont_Cust_SMLC', 'Fam_Default', '[W02] ACC SMLC', 'CUSTOMER');
INSERT INTO Contacts (contact_id, family_id, name, contact_type) VALUES ('Cont_Friend_Nick', 'Fam_Default', 'เพื่อน นิค', 'OTHER');

-- 8. Seed Projects (Trips)
INSERT INTO Projects (project_id, family_id, name, status) VALUES ('Proj_Hokkaido2025', 'Fam_Default', 'Hokkaido2025', 'active');
INSERT INTO Projects (project_id, family_id, name, status) VALUES ('Proj_HuaHin2026', 'Fam_Default', 'ทริปหัวหิน 2026', 'active');
