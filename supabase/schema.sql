-- =============================================
-- KHEDMAH — Supabase Database Schema
-- Run this entire file in:
--   Supabase Dashboard → SQL Editor → New Query
-- =============================================

-- Enable UUID generation
create extension if not exists "uuid-ossp";


-- ═══════════════════════════════════════════════
-- PROFILES (extends auth.users)
-- ═══════════════════════════════════════════════
create table public.profiles (
  id            uuid references auth.users(id) on delete cascade primary key,
  phone         text,
  email         text,
  name_ar       text,
  name_en       text,
  role          text not null default 'customer'
                  check (role in ('customer','provider','company','equipment','government','engineer','admin')),
  lang_pref     text not null default 'ar'
                  check (lang_pref in ('ar','en','ur','hi','bn','tl')),
  city          text,
  avatar_url    text,
  bio           text,
  verified      boolean not null default false,
  rating_avg    numeric(3,2) not null default 0,
  rating_count  integer not null default 0,
  referral_code text unique,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Auto-create profile row when a new user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  insert into public.profiles (id, phone, email)
  values (new.id, new.phone, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Auto-update updated_at on every change
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();


-- ═══════════════════════════════════════════════
-- SERVICES CATALOG
-- ═══════════════════════════════════════════════
create table public.services (
  id         text primary key,
  category   text not null,
  name_ar    text not null,
  name_en    text not null,
  icon       text not null,
  active     boolean not null default true,
  sort_order integer default 0
);


-- ═══════════════════════════════════════════════
-- BOOKINGS
-- ═══════════════════════════════════════════════
create table public.bookings (
  id             uuid default uuid_generate_v4() primary key,
  customer_id    uuid not null references auth.users(id),
  provider_id    uuid references auth.users(id),
  service_id     text references public.services(id),
  status         text not null default 'pending'
                   check (status in ('pending','quoted','accepted','in_progress','completed','cancelled','disputed')),
  city           text,
  description    text,
  indoor_outdoor text,
  size           text,
  phase          text,
  style          text,
  urgency        text,
  scheduled_at   timestamptz,
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger bookings_updated_at
  before update on public.bookings
  for each row execute procedure public.set_updated_at();


-- ═══════════════════════════════════════════════
-- QUOTES
-- ═══════════════════════════════════════════════
create table public.quotes (
  id                 uuid default uuid_generate_v4() primary key,
  booking_id         uuid not null references public.bookings(id) on delete cascade,
  provider_id        uuid not null references auth.users(id),
  amount             numeric(10,2) not null,
  includes_materials boolean not null default false,
  message            text,
  status             text not null default 'pending'
                       check (status in ('pending','accepted','rejected','negotiating','expired')),
  expires_at         timestamptz,
  created_at         timestamptz not null default now()
);


-- ═══════════════════════════════════════════════
-- PAYMENTS
-- ═══════════════════════════════════════════════
create table public.payments (
  id           uuid default uuid_generate_v4() primary key,
  booking_id   uuid not null references public.bookings(id),
  amount       numeric(10,2) not null,
  method       text check (method in ('mada','stc_pay','apple_pay','credit_card','wallet')),
  moyasar_ref  text unique,
  status       text not null default 'pending'
                 check (status in ('pending','paid','failed','refunded')),
  paid_at      timestamptz,
  created_at   timestamptz not null default now()
);

-- ESCROW
create table public.escrow (
  id          uuid default uuid_generate_v4() primary key,
  payment_id  uuid unique not null references public.payments(id),
  booking_id  uuid unique not null references public.bookings(id),
  amount      numeric(10,2) not null,
  status      text not null default 'held'
                check (status in ('held','released','refunded','disputed')),
  held_at     timestamptz not null default now(),
  released_at timestamptz,
  refunded_at timestamptz
);


-- ═══════════════════════════════════════════════
-- MESSAGES (Realtime chat)
-- ═══════════════════════════════════════════════
create table public.messages (
  id                 uuid default uuid_generate_v4() primary key,
  booking_id         uuid not null references public.bookings(id) on delete cascade,
  sender_id          uuid not null references auth.users(id),
  content            text not null,
  lang_original      text not null default 'ar',
  content_translated jsonb,          -- { "en": "...", "ar": "...", "ur": "..." }
  message_type       text not null default 'text'
                       check (message_type in ('text','image','voice','file')),
  media_url          text,
  read_at            timestamptz,
  created_at         timestamptz not null default now()
);


-- ═══════════════════════════════════════════════
-- RATINGS
-- ═══════════════════════════════════════════════
create table public.ratings (
  id         uuid default uuid_generate_v4() primary key,
  booking_id uuid not null references public.bookings(id),
  rater_id   uuid not null references auth.users(id),
  ratee_id   uuid not null references auth.users(id),
  score      integer not null check (score between 1 and 5),
  comment    text,
  photos     text[],
  created_at timestamptz not null default now(),
  unique(booking_id, rater_id)
);

-- Auto-recalculate rating average after every new rating
create or replace function public.update_rating_avg()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  update public.profiles
  set
    rating_avg   = (select round(avg(score)::numeric, 2) from public.ratings where ratee_id = new.ratee_id),
    rating_count = (select count(*) from public.ratings where ratee_id = new.ratee_id)
  where id = new.ratee_id;
  return new;
end;
$$;

create trigger after_rating_insert
  after insert on public.ratings
  for each row execute procedure public.update_rating_avg();


-- ═══════════════════════════════════════════════
-- REFERRALS
-- ═══════════════════════════════════════════════
create table public.referrals (
  id            uuid default uuid_generate_v4() primary key,
  referrer_id   uuid not null references auth.users(id),
  referee_id    uuid references auth.users(id),
  code          text not null,
  reward_amount numeric(10,2) not null default 50,
  reward_paid   boolean not null default false,
  created_at    timestamptz not null default now()
);


-- ═══════════════════════════════════════════════
-- NOTIFICATIONS
-- ═══════════════════════════════════════════════
create table public.notifications (
  id         uuid default uuid_generate_v4() primary key,
  user_id    uuid not null references auth.users(id),
  type       text not null,
  title_ar   text,
  title_en   text,
  body_ar    text,
  body_en    text,
  data       jsonb,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);


-- ═══════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════
create index idx_bookings_customer   on public.bookings(customer_id);
create index idx_bookings_provider   on public.bookings(provider_id);
create index idx_bookings_status     on public.bookings(status);
create index idx_bookings_created    on public.bookings(created_at desc);
create index idx_quotes_booking      on public.quotes(booking_id);
create index idx_messages_booking    on public.messages(booking_id);
create index idx_messages_created    on public.messages(created_at);
create index idx_ratings_ratee       on public.ratings(ratee_id);
create index idx_notifications_user  on public.notifications(user_id, read);


-- ═══════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════

-- Profiles: anyone can read, only owner can write
alter table public.profiles enable row level security;
create policy "profiles_select_all"  on public.profiles for select using (true);
create policy "profiles_insert_own"  on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own"  on public.profiles for update using (auth.uid() = id);

-- Services: public read-only
alter table public.services enable row level security;
create policy "services_select_all"  on public.services for select using (true);

-- Bookings: only the customer and assigned provider
alter table public.bookings enable row level security;
create policy "bookings_select_own" on public.bookings for select
  using (auth.uid() = customer_id or auth.uid() = provider_id);
create policy "bookings_insert_customer" on public.bookings for insert
  with check (auth.uid() = customer_id);
create policy "bookings_update_parties" on public.bookings for update
  using (auth.uid() = customer_id or auth.uid() = provider_id);

-- Quotes: provider + booking's customer
alter table public.quotes enable row level security;
create policy "quotes_select_involved" on public.quotes for select
  using (
    auth.uid() = provider_id or
    exists (select 1 from public.bookings b where b.id = booking_id and b.customer_id = auth.uid())
  );
create policy "quotes_insert_provider" on public.quotes for insert
  with check (auth.uid() = provider_id);
create policy "quotes_update_provider" on public.quotes for update
  using (auth.uid() = provider_id);

-- Payments: customer of the booking only
alter table public.payments enable row level security;
create policy "payments_select_own" on public.payments for select
  using (exists (select 1 from public.bookings b where b.id = booking_id and b.customer_id = auth.uid()));
create policy "payments_insert_customer" on public.payments for insert
  with check (exists (select 1 from public.bookings b where b.id = booking_id and b.customer_id = auth.uid()));

-- Escrow: booking parties only
alter table public.escrow enable row level security;
create policy "escrow_select_own" on public.escrow for select
  using (exists (
    select 1 from public.bookings b
    where b.id = booking_id and (b.customer_id = auth.uid() or b.provider_id = auth.uid())
  ));

-- Messages: booking parties only
alter table public.messages enable row level security;
create policy "messages_select_parties" on public.messages for select
  using (exists (
    select 1 from public.bookings b
    where b.id = booking_id and (b.customer_id = auth.uid() or b.provider_id = auth.uid())
  ));
create policy "messages_insert_sender" on public.messages for insert
  with check (
    auth.uid() = sender_id and
    exists (
      select 1 from public.bookings b
      where b.id = booking_id and (b.customer_id = auth.uid() or b.provider_id = auth.uid())
    )
  );

-- Ratings: public read, only rater can insert
alter table public.ratings enable row level security;
create policy "ratings_select_all"  on public.ratings for select using (true);
create policy "ratings_insert_own"  on public.ratings for insert with check (auth.uid() = rater_id);

-- Referrals: own only
alter table public.referrals enable row level security;
create policy "referrals_select_own" on public.referrals for select
  using (auth.uid() = referrer_id or auth.uid() = referee_id);
create policy "referrals_insert_own" on public.referrals for insert
  with check (auth.uid() = referrer_id);

-- Notifications: own only
alter table public.notifications enable row level security;
create policy "notifications_select_own" on public.notifications for select
  using (auth.uid() = user_id);
create policy "notifications_update_own" on public.notifications for update
  using (auth.uid() = user_id);


-- ═══════════════════════════════════════════════
-- REALTIME
-- Enable live updates for chat + notifications
-- ═══════════════════════════════════════════════
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.bookings;


-- ═══════════════════════════════════════════════
-- SEED: SERVICES CATALOG
-- ═══════════════════════════════════════════════
insert into public.services (id, category, name_ar, name_en, icon, sort_order) values
-- Maintenance
('plumber',      'maintenance',  'سباك',                  'Plumber',            'fas fa-faucet',           1),
('electrician',  'maintenance',  'كهربائي',               'Electrician',         'fas fa-bolt',             2),
('ac_tech',      'maintenance',  'فني تكييف',             'AC Technician',       'fas fa-snowflake',        3),
('painter',      'maintenance',  'دهان',                  'Painter',             'fas fa-paint-roller',     4),
('carpenter',    'maintenance',  'نجار',                  'Carpenter',           'fas fa-hammer',           5),
('cleaner',      'maintenance',  'تنظيف',                'Cleaning Service',    'fas fa-broom',            6),
('pest',         'maintenance',  'مكافحة حشرات',         'Pest Control',        'fas fa-bug',              7),
('tiling',       'maintenance',  'فني أرضيات وبلاط',     'Tiling Specialist',   'fas fa-border-all',       8),
('waterproof',   'maintenance',  'عزل مائي',             'Waterproofing',       'fas fa-water',            9),
('mover',        'maintenance',  'نقل عفش',              'Moving Company',      'fas fa-truck',            10),
-- Design
('interior',     'design',       'تصميم داخلي',          'Interior Designer',   'fas fa-couch',            11),
('architect',    'design',       'تصميم معماري',         'Architect',           'fas fa-drafting-compass', 12),
('lighting',     'design',       'تصميم إضاءة',          'Lighting Designer',   'fas fa-lightbulb',        13),
('landscaper',   'design',       'مصمم حدائق',           'Landscaper',          'fas fa-leaf',             14),
('furniture',    'design',       'تنسيق أثاث',           'Furniture Stylist',   'fas fa-chair',            15),
-- Construction
('contractor',   'construction', 'مقاول تنفيذ',          'Contractor',          'fas fa-hard-hat',         16),
('civil',        'construction', 'هندسة مدنية',          'Civil Engineer',      'fas fa-building',         17),
('mep',          'construction', 'هندسة MEP',             'MEP Engineer',        'fas fa-cogs',             18),
-- Commercial
('kitchen_spec', 'commercial',   'متخصص مطابخ',         'Kitchen Specialist',  'fas fa-utensils',         19),
('fitout',       'commercial',   'تجهيز محلات تجارية',  'Shop Fitout',         'fas fa-store',            20),
-- Advisory
('consultant',   'advisory',     'مستشار مشاريع',        'Project Consultant',  'fas fa-user-tie',         21);
