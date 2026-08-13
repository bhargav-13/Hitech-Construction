-- Clear the Vyapar module's data so a migration lands on an empty set of books.
--
-- DESTRUCTIVE AND IRREVERSIBLE. Take a dump first:
--     pg_dump -h localhost -p 5433 -U hitech -d hitech_erp -Fc -f before-migration.dump
--
-- Run against LOCAL first. Only point this at production once the local migration has been
-- reconciled against Vyapar's own Sale / Purchase / Party Statement totals.
--
--     psql -h localhost -p 5433 -U hitech -d hitech_erp -f scripts/wipe-vyapar.sql
--
-- Scope: the Vyapar module only. Projects, users, payroll, tender, warehouse, tasks and audit
-- are untouched — this deliberately does not cascade outside the tables listed here.

BEGIN;

-- Children before parents; TRUNCATE ... CASCADE is avoided so nothing outside this list can be
-- dragged along by a foreign key we didn't think about.
TRUNCATE TABLE
    vyapar_payment_links,
    vyapar_invoice_history,
    vyapar_invoice_lines,
    vyapar_payments,
    vyapar_invoices,
    vyapar_stock_adjustments,
    vyapar_cash_bank_txns,
    vyapar_cheques,
    vyapar_loan_accounts,
    vyapar_items,
    vyapar_parties,
    vyapar_bank_accounts
    RESTART IDENTITY;

-- Settings and the firm profile are configuration, not books — left in place on purpose. Delete
-- these two lines' worth of comment only if you actually want them reset as well.

COMMIT;

-- Sanity check after running:
--   SELECT 'invoices' t, count(*) FROM vyapar_invoices
--   UNION ALL SELECT 'parties', count(*) FROM vyapar_parties
--   UNION ALL SELECT 'items',   count(*) FROM vyapar_items
--   UNION ALL SELECT 'payments',count(*) FROM vyapar_payments;
