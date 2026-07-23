-- Clear all transactional data, keep master data
-- Master data kept: Families, Users, UserPermissions, Entities, Accounts,
--                   Captions, Categories, Contacts, Debts, Projects
-- Transactional data deleted: Settlements, TransactionDetails, Transactions,
--                              TripStops, TripExpenses, TripDocuments

DELETE FROM Settlements;
DELETE FROM TransactionDetails;
DELETE FROM Transactions;
DELETE FROM TripDocuments;
DELETE FROM TripExpenses;
DELETE FROM TripStops;
