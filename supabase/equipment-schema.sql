-- ============================================================
-- Khedmah — Equipment Marketplace Schema
-- Run after schema.sql and tender-schema.sql
-- ============================================================

-- ── EQUIPMENT ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS equipment (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Identity
  name             TEXT NOT NULL,
  category         TEXT NOT NULL CHECK (category IN (
                     'excavator','crane','mixer','bulldozer','loader',
                     'truck','compactor','forklift','generator','pump',
                     'scaffold','other'
                   )),
  brand            TEXT,
  year             INT,
  hours_used       INT,
  description      TEXT,
  emoji            TEXT,

  -- Location
  region           TEXT NOT NULL,
  city             TEXT,
  delivery_radius  INT DEFAULT 0,   -- km

  -- Specs
  capacity         TEXT,            -- e.g. "30 طن", "9 م³"

  -- Options
  has_operator     BOOLEAN DEFAULT true,
  has_delivery     BOOLEAN DEFAULT false,
  has_insurance    BOOLEAN DEFAULT false,
  has_maintenance  BOOLEAN DEFAULT false,

  -- Pricing (SAR)
  hour_price       NUMERIC(10,2),
  day_price        NUMERIC(10,2),
  week_price       NUMERIC(10,2),
  month_price      NUMERIC(10,2),
  delivery_cost    NUMERIC(10,2) DEFAULT 0,
  deposit          NUMERIC(10,2) DEFAULT 2000,

  -- Availability
  available_days   TEXT[],          -- e.g. ['أح','إث','ث','أر','خ']
  start_hour       TIME DEFAULT '07:00',
  end_hour         TIME DEFAULT '18:00',
  min_rental       TEXT DEFAULT '1day',
  notice_hours     INT DEFAULT 24,

  -- Admin
  visibility       TEXT DEFAULT 'public' CHECK (visibility IN ('public','verified')),
  status           TEXT DEFAULT 'pending' CHECK (status IN ('pending','active','archived','suspended')),
  is_available     BOOLEAN DEFAULT true,

  -- Stats
  rating           NUMERIC(3,2),
  review_count     INT DEFAULT 0,
  rental_count     INT DEFAULT 0,

  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;

-- Public can read active listings
CREATE POLICY "equipment_read_active" ON equipment
  FOR SELECT USING (status = 'active');

-- Owners can read all their own listings
CREATE POLICY "equipment_owner_read_own" ON equipment
  FOR SELECT USING (owner_id = auth.uid());

-- Owners can insert
CREATE POLICY "equipment_owner_insert" ON equipment
  FOR INSERT WITH CHECK (owner_id = auth.uid());

-- Owners can update their own
CREATE POLICY "equipment_owner_update" ON equipment
  FOR UPDATE USING (owner_id = auth.uid());


-- ── EQUIPMENT RENTALS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS equipment_rentals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id    UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  renter_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Period
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  days            INT NOT NULL DEFAULT 1,
  period          TEXT DEFAULT 'day' CHECK (period IN ('hour','day','week','month')),

  -- Options
  with_operator   BOOLEAN DEFAULT false,
  delivery_address TEXT,

  -- Financials (SAR)
  base_price      NUMERIC(10,2),
  operator_fee    NUMERIC(10,2) DEFAULT 0,
  delivery_fee    NUMERIC(10,2) DEFAULT 0,
  deposit         NUMERIC(10,2) DEFAULT 2000,
  total_price     NUMERIC(10,2) NOT NULL,

  -- Status lifecycle: pending → confirmed → active → completed | cancelled
  status          TEXT DEFAULT 'pending' CHECK (status IN (
                    'pending','confirmed','active','completed','cancelled'
                  )),

  -- Timestamps
  created_at      TIMESTAMPTZ DEFAULT now(),
  confirmed_at    TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ
);

ALTER TABLE equipment_rentals ENABLE ROW LEVEL SECURITY;

-- Renters can see their own rentals
CREATE POLICY "rental_renter_read" ON equipment_rentals
  FOR SELECT USING (renter_id = auth.uid());

-- Equipment owners can see rentals of their equipment
CREATE POLICY "rental_owner_read" ON equipment_rentals
  FOR SELECT USING (
    equipment_id IN (SELECT id FROM equipment WHERE owner_id = auth.uid())
  );

-- Renters can create rentals
CREATE POLICY "rental_renter_insert" ON equipment_rentals
  FOR INSERT WITH CHECK (renter_id = auth.uid());

-- Both parties can update status
CREATE POLICY "rental_update" ON equipment_rentals
  FOR UPDATE USING (
    renter_id = auth.uid()
    OR equipment_id IN (SELECT id FROM equipment WHERE owner_id = auth.uid())
  );


-- ── AUTO-UPDATE TIMESTAMP ─────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_equipment_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_equipment_updated_at
  BEFORE UPDATE ON equipment
  FOR EACH ROW EXECUTE FUNCTION touch_equipment_updated_at();


-- ── INDEXES ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_equipment_category    ON equipment(category);
CREATE INDEX IF NOT EXISTS idx_equipment_region      ON equipment(region);
CREATE INDEX IF NOT EXISTS idx_equipment_status      ON equipment(status);
CREATE INDEX IF NOT EXISTS idx_equipment_owner       ON equipment(owner_id);
CREATE INDEX IF NOT EXISTS idx_rentals_equipment     ON equipment_rentals(equipment_id);
CREATE INDEX IF NOT EXISTS idx_rentals_renter        ON equipment_rentals(renter_id);
CREATE INDEX IF NOT EXISTS idx_rentals_dates         ON equipment_rentals(start_date, end_date);
