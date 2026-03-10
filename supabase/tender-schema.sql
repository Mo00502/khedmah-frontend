-- ============================================================
-- Khedmah — Tender System Schema
-- Run AFTER the main schema.sql
-- ============================================================

-- 1. COMPANIES
-- ============================================================
CREATE TABLE IF NOT EXISTS companies (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         UUID REFERENCES profiles(id) ON DELETE SET NULL,
  name             TEXT NOT NULL,
  name_en          TEXT,
  cr_number        TEXT,                          -- Commercial Registration
  vat_number       TEXT,
  classification   TEXT,                          -- G9, M7, etc.
  years_experience INTEGER DEFAULT 0,
  logo_url         TEXT,
  verified         BOOLEAN DEFAULT false,
  rating           NUMERIC(3,2) DEFAULT 0,
  total_tenders    INTEGER DEFAULT 0,
  total_projects   INTEGER DEFAULT 0,
  region           TEXT,
  description      TEXT,
  website          TEXT,
  phone            TEXT,
  email            TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "companies_read_all"   ON companies FOR SELECT USING (true);
CREATE POLICY "companies_owner_write" ON companies FOR ALL  USING (auth.uid() = owner_id);


-- 2. TENDERS
-- ============================================================
CREATE TABLE IF NOT EXISTS tenders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
  created_by      UUID REFERENCES profiles(id)  ON DELETE SET NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  scope           TEXT,
  category        TEXT NOT NULL,
  region          TEXT,
  status          TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('draft','open','closed','under_review','awarded','cancelled')),
  budget_min      NUMERIC(15,2),
  budget_max      NUMERIC(15,2),
  budget_mode     TEXT DEFAULT 'range',           -- 'range' | 'fixed'
  deadline        DATE,
  start_date      DATE,
  duration_months INTEGER,
  qualifications  JSONB DEFAULT '[]',
  milestones      JSONB DEFAULT '[]',
  documents       JSONB DEFAULT '[]',
  views           INTEGER DEFAULT 0,
  urgency         TEXT DEFAULT 'normal'
                  CHECK (urgency IN ('normal','medium','high')),
  winning_bid_id  UUID,                           -- set on award
  awarded_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tenders_status_idx  ON tenders(status);
CREATE INDEX IF NOT EXISTS tenders_category_idx ON tenders(category);
CREATE INDEX IF NOT EXISTS tenders_region_idx   ON tenders(region);

ALTER TABLE tenders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenders_read_all"      ON tenders FOR SELECT USING (true);
CREATE POLICY "tenders_creator_write" ON tenders FOR ALL   USING (auth.uid() = created_by);


-- 3. TENDER BIDS
-- ============================================================
CREATE TABLE IF NOT EXISTS tender_bids (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id          UUID REFERENCES tenders(id)  ON DELETE CASCADE,
  company_id         UUID REFERENCES companies(id) ON DELETE SET NULL,
  submitted_by       UUID REFERENCES profiles(id)  ON DELETE SET NULL,
  amount             NUMERIC(15,2) NOT NULL,
  duration_months    INTEGER,
  note               TEXT,
  technical_proposal TEXT,
  status             TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','shortlisted','won','rejected','withdrawn')),
  terms_accepted     BOOLEAN NOT NULL DEFAULT false,
  terms_accepted_at  TIMESTAMPTZ,
  score              NUMERIC(5,2),                 -- optional weighted score
  created_at         TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tender_bids_tender_idx ON tender_bids(tender_id);

ALTER TABLE tender_bids ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bids_submitter_read"  ON tender_bids FOR SELECT USING (auth.uid() = submitted_by);
CREATE POLICY "bids_submitter_write" ON tender_bids FOR INSERT WITH CHECK (auth.uid() = submitted_by);
-- Tender owners can read all bids on their tenders
CREATE POLICY "bids_tender_owner_read" ON tender_bids FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tenders t WHERE t.id = tender_id AND t.created_by = auth.uid()
    )
  );


-- 4. COMMISSIONS  (2% auto-calculated on award)
-- ============================================================
CREATE TABLE IF NOT EXISTS commissions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id            UUID REFERENCES tenders(id)      ON DELETE SET NULL,
  bid_id               UUID REFERENCES tender_bids(id)  ON DELETE SET NULL,
  company_id           UUID REFERENCES companies(id)    ON DELETE SET NULL,
  tender_value         NUMERIC(15,2) NOT NULL,
  commission_rate      NUMERIC(5,4)  NOT NULL DEFAULT 0.02,
  commission_amount    NUMERIC(15,2) NOT NULL,          -- = tender_value * 0.02
  status               TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','in_progress','completed','invoice_issued','paid','overdue')),
  terms_accepted       BOOLEAN DEFAULT false,
  terms_accepted_at    TIMESTAMPTZ,
  project_started_at   TIMESTAMPTZ,
  project_completed_at TIMESTAMPTZ,
  invoice_issued_at    TIMESTAMPTZ,
  invoice_number       TEXT,
  paid_at              TIMESTAMPTZ,
  payment_reference    TEXT,
  notes                TEXT,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS commissions_status_idx    ON commissions(status);
CREATE INDEX IF NOT EXISTS commissions_company_idx   ON commissions(company_id);

ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;
-- Only admin/founder and the company owner can read
CREATE POLICY "commissions_company_read" ON commissions FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM companies c WHERE c.id = company_id AND c.owner_id = auth.uid())
    OR
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );
CREATE POLICY "commissions_admin_write" ON commissions FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );


-- 5. PROJECT REQUIREMENTS  (NLP-extracted resource needs)
-- ============================================================
CREATE TABLE IF NOT EXISTS project_requirements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id       UUID REFERENCES tenders(id)   ON DELETE CASCADE,
  commission_id   UUID REFERENCES commissions(id) ON DELETE SET NULL,
  requested_by    UUID REFERENCES profiles(id)   ON DELETE SET NULL,
  type            TEXT NOT NULL
                  CHECK (type IN ('equipment','manpower','material','other')),
  name_ar         TEXT NOT NULL,
  quantity        INTEGER DEFAULT 1,
  unit            TEXT,
  duration_days   INTEGER,
  specifications  TEXT,
  status          TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open','awarded','fulfilled','cancelled')),
  source_text     TEXT,                           -- original chat extract
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS req_tender_idx ON project_requirements(tender_id);
CREATE INDEX IF NOT EXISTS req_status_idx ON project_requirements(status);

ALTER TABLE project_requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "req_read_all"          ON project_requirements FOR SELECT USING (true);
CREATE POLICY "req_requester_write"   ON project_requirements FOR INSERT WITH CHECK (auth.uid() = requested_by);
CREATE POLICY "req_requester_update"  ON project_requirements FOR UPDATE USING (auth.uid() = requested_by);


-- 6. SUPPLIER OFFERS  (bids on project requirements)
-- ============================================================
CREATE TABLE IF NOT EXISTS supplier_offers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_id   UUID REFERENCES project_requirements(id) ON DELETE CASCADE,
  supplier_id      UUID REFERENCES profiles(id)             ON DELETE SET NULL,
  company_id       UUID REFERENCES companies(id)            ON DELETE SET NULL,
  price_per_unit   NUMERIC(12,2),
  price_total      NUMERIC(12,2),
  available_from   DATE,
  duration_days    INTEGER,
  notes            TEXT,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','shortlisted','accepted','rejected')),
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS offers_req_idx ON supplier_offers(requirement_id);

ALTER TABLE supplier_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "offers_read_all"           ON supplier_offers FOR SELECT USING (true);
CREATE POLICY "offers_supplier_write"     ON supplier_offers FOR INSERT WITH CHECK (auth.uid() = supplier_id);
CREATE POLICY "offers_supplier_update"    ON supplier_offers FOR UPDATE USING (auth.uid() = supplier_id);


-- ============================================================
-- Helper: trigger to keep updated_at fresh
-- ============================================================
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tenders_updated_at') THEN
    CREATE TRIGGER tenders_updated_at    BEFORE UPDATE ON tenders    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'commissions_updated_at') THEN
    CREATE TRIGGER commissions_updated_at BEFORE UPDATE ON commissions FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
  END IF;
END $$;
