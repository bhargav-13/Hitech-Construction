-- Put every Vyapar record under one project, and clear out the throwaway projects.
--
-- Why: the books were migrated out of Vyapar before the module was project-scoped, so all 577
-- documents and 428 receipts sit with project_id NULL. The client wants them all under a single
-- project called HITECHRAJKOT for now — Vyapar itself has no project concept, so there is nothing
-- in the source data to split them by, and one project is the honest representation.
--
-- DESTRUCTIVE. Take a dump first:
--     docker exec hitech-erp-postgres pg_dump -U hitech -d hitech_erp -Fc > before-hitechrajkot.dump
--
-- Run it wrapped so you can inspect before committing:
--     docker exec -i hitech-erp-postgres psql -U hitech -d hitech_erp < scripts/vyapar-project-hitechrajkot.sql
--
-- The script ends with ROLLBACK. Read the report it prints, then change the last line to COMMIT
-- and run it again. Nothing is written until you do that — that is deliberate.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The project everything lands under.
-- ---------------------------------------------------------------------------
-- Created only if it isn't already there, so re-running is safe.
INSERT INTO projects (name, created_at, updated_at)
SELECT 'HITECHRAJKOT', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM projects WHERE name = 'HITECHRAJKOT');

-- ---------------------------------------------------------------------------
-- 2. The throwaway projects.
-- ---------------------------------------------------------------------------
-- Listed by name, not by a LIKE pattern, so nothing can be swept up by accident.
--
-- NOT in this list, on purpose: ids 1–19 and 59 ("Construction of CC Road", the Gram Panchayat
-- sites, the RMC D.I. Pipeline phases, "Wankaner Water Supply Scheme", the Water Zone No.04 civil
-- works). Those read as the client's real sites and several carry live tasks. If any of them is in
-- fact scrap, add it below — but that is a decision for the client, not for this script.
CREATE TEMP TABLE scrap_projects ON COMMIT DROP AS
SELECT id, name FROM projects
WHERE name IN (
  'abcd',
  'ahmedabad site',
  'skvh',
  'ajbaxh',
  'Audit Test Project',
  'Test Address',
  'Demo · Project A', 'Demo · Project B', 'Demo · Project C', 'Demo · Project D',
  'Demo · Project E', 'Demo · Project F', 'Demo · Project G', 'Demo · Project H',
  'Demo · Project I', 'Demo · Project J', 'Demo · Project K', 'Demo · Project L'
);

\echo ''
\echo '--- Projects that will be deleted ---'
SELECT id, name FROM scrap_projects ORDER BY id;

-- ---------------------------------------------------------------------------
-- 3. Move every Vyapar record onto HITECHRAJKOT.
-- ---------------------------------------------------------------------------
-- This runs BEFORE the deletes, so the two invoices currently sitting on "Audit Test Project"
-- are rescued rather than orphaned.
CREATE TEMP TABLE target ON COMMIT DROP AS
SELECT id FROM projects WHERE name = 'HITECHRAJKOT';

UPDATE vyapar_invoices           SET project_id = (SELECT id FROM target);
UPDATE vyapar_payments           SET project_id = (SELECT id FROM target);
UPDATE vyapar_stock_adjustments  SET project_id = (SELECT id FROM target);

-- Parties and items are shared masters, not transactions: the same supplier and the same pipe are
-- used across every site. Vyapar keeps one list of each, and scoping them to a project would hide
-- them from every other project the moment a second one is created. Left global on purpose.
--   UPDATE vyapar_parties SET project_id = ...   -- deliberately NOT done
--   UPDATE vyapar_items   SET project_id = ...   -- deliberately NOT done

-- ---------------------------------------------------------------------------
-- 4. Clear out what pointed at the scrap projects.
-- ---------------------------------------------------------------------------
-- `tasks`, `tenders`, `audit_logs` and `project_members` reference projects without a foreign key,
-- so deleting the project alone would leave rows pointing at an id that no longer exists.
DELETE FROM tasks           WHERE project_id IN (SELECT id FROM scrap_projects);
DELETE FROM project_members WHERE project_id IN (SELECT id FROM scrap_projects);
UPDATE tenders    SET project_id = NULL WHERE project_id IN (SELECT id FROM scrap_projects);
UPDATE audit_logs SET project_id = NULL WHERE project_id IN (SELECT id FROM scrap_projects);
UPDATE payroll_locations SET project_id = NULL WHERE project_id IN (SELECT id FROM scrap_projects);
-- payroll_attendance is ON DELETE SET NULL and project_locations is ON DELETE CASCADE, so both
-- are handled by the delete below.

DELETE FROM projects WHERE id IN (SELECT id FROM scrap_projects);

-- ---------------------------------------------------------------------------
-- 5. Report — read this before committing.
-- ---------------------------------------------------------------------------
\echo ''
\echo '--- After (still inside the transaction) ---'
SELECT
  (SELECT count(*) FROM projects)                                       AS projects_left,
  (SELECT count(*) FROM vyapar_invoices WHERE project_id IS NULL)       AS invoices_unlinked,
  (SELECT count(*) FROM vyapar_payments WHERE project_id IS NULL)       AS payments_unlinked,
  (SELECT count(*) FROM vyapar_invoices
     WHERE project_id = (SELECT id FROM projects WHERE name='HITECHRAJKOT')) AS invoices_on_hitechrajkot,
  (SELECT count(*) FROM vyapar_payments
     WHERE project_id = (SELECT id FROM projects WHERE name='HITECHRAJKOT')) AS payments_on_hitechrajkot;

\echo ''
\echo '--- Projects remaining ---'
SELECT id, name FROM projects ORDER BY id;

\echo ''
\echo '*** ROLLED BACK — nothing was written. Change the last line to COMMIT to apply. ***'
ROLLBACK;
