/* ============================================================
   KHEDMAH — Data Layer  (khedmah-data.js)
   All Supabase read/write operations live here.
   Pages import this after supabase-client.js.
   ============================================================ */

/* ── Resolve current user from session ─────────────────────── */
function _session() {
  try { return JSON.parse(localStorage.getItem('khedmah_demo')) || {}; }
  catch(e) { return {}; }
}

/* ── Supabase client shortcut ───────────────────────────────── */
function _sb() {
  if (typeof sb !== 'undefined' && sb) return sb;
  return null;
}


/* ══════════════════════════════════════════════════════════════
   BOOKINGS
   ══════════════════════════════════════════════════════════════ */
const Bookings = {

  /** Create a new booking (customer side) */
  async create(fields) {
    const s = _session();
    const client = _sb();
    if (!client) return { ok: false, error: 'Supabase not ready' };

    const payload = {
      customer_id:  s.id,
      status:       'pending',
      ...fields
    };

    const { data, error } = await client
      .from('bookings')
      .insert(payload)
      .select()
      .single();

    if (error) { console.error('Bookings.create:', error); return { ok: false, error }; }
    return { ok: true, data };
  },

  /** List bookings for current user (customer or provider) */
  async list(role) {
    const s = _session();
    const client = _sb();
    if (!client) return { ok: false, data: [] };

    const col = (role || s.role) === 'provider' ? 'provider_id' : 'customer_id';

    const { data, error } = await client
      .from('bookings')
      .select(`
        *,
        customer:profiles!bookings_customer_id_fkey(id, full_name, phone),
        provider:profiles!bookings_provider_id_fkey(id, full_name, phone),
        service:services(id, title, category, price, price_type)
      `)
      .eq(col, s.id)
      .order('created_at', { ascending: false });

    if (error) { console.error('Bookings.list:', error); return { ok: false, data: [] }; }
    return { ok: true, data: data || [] };
  },

  /** Get single booking by id */
  async get(id) {
    const client = _sb();
    if (!client) return { ok: false, data: null };

    const { data, error } = await client
      .from('bookings')
      .select(`
        *,
        customer:profiles!bookings_customer_id_fkey(id, full_name, phone),
        provider:profiles!bookings_provider_id_fkey(id, full_name, phone),
        service:services(id, title, category, price, price_type)
      `)
      .eq('id', id)
      .single();

    if (error) { console.error('Bookings.get:', error); return { ok: false, data: null }; }
    return { ok: true, data };
  },

  /** Update booking status */
  async updateStatus(id, status, extra) {
    const client = _sb();
    if (!client) return { ok: false };

    const { error } = await client
      .from('bookings')
      .update({ status, ...extra })
      .eq('id', id);

    if (error) { console.error('Bookings.updateStatus:', error); return { ok: false, error }; }
    return { ok: true };
  }
};


/* ══════════════════════════════════════════════════════════════
   SERVICES  (provider's offered services)
   ══════════════════════════════════════════════════════════════ */
const Services = {

  /** List services for current provider */
  async listMine() {
    const s = _session();
    const client = _sb();
    if (!client) return { ok: false, data: [] };

    const { data, error } = await client
      .from('services')
      .select('*')
      .eq('provider_id', s.id)
      .order('created_at', { ascending: false });

    if (error) { console.error('Services.listMine:', error); return { ok: false, data: [] }; }
    return { ok: true, data: data || [] };
  },

  /** Search active services (customer marketplace) */
  async search(query, category) {
    const client = _sb();
    if (!client) return { ok: false, data: [] };

    let q = client
      .from('services')
      .select(`*, provider:profiles!services_provider_id_fkey(id, full_name, phone)`)
      .eq('is_active', true);

    if (category) q = q.eq('category', category);
    if (query)    q = q.ilike('title', `%${query}%`);

    const { data, error } = await q.order('created_at', { ascending: false }).limit(50);
    if (error) { console.error('Services.search:', error); return { ok: false, data: [] }; }
    return { ok: true, data: data || [] };
  },

  /** Create service */
  async create(fields) {
    const s = _session();
    const client = _sb();
    if (!client) return { ok: false };

    const { data, error } = await client
      .from('services')
      .insert({ provider_id: s.id, ...fields })
      .select().single();

    if (error) { console.error('Services.create:', error); return { ok: false, error }; }
    return { ok: true, data };
  },

  /** Update service */
  async update(id, fields) {
    const client = _sb();
    if (!client) return { ok: false };

    const { error } = await client.from('services').update(fields).eq('id', id);
    if (error) { console.error('Services.update:', error); return { ok: false, error }; }
    return { ok: true };
  },

  /** Delete service */
  async remove(id) {
    const client = _sb();
    if (!client) return { ok: false };

    const { error } = await client.from('services').delete().eq('id', id);
    if (error) { console.error('Services.remove:', error); return { ok: false, error }; }
    return { ok: true };
  }
};


/* ══════════════════════════════════════════════════════════════
   NOTIFICATIONS
   ══════════════════════════════════════════════════════════════ */
const Notifications = {

  /** List notifications for current user */
  async list() {
    const s = _session();
    const client = _sb();
    if (!client) return { ok: false, data: [] };

    const { data, error } = await client
      .from('notifications')
      .select('*')
      .eq('user_id', s.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) { console.error('Notifications.list:', error); return { ok: false, data: [] }; }
    return { ok: true, data: data || [] };
  },

  /** Count unread */
  async unreadCount() {
    const s = _session();
    const client = _sb();
    if (!client) return 0;

    const { count } = await client
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', s.id)
      .eq('is_read', false);

    return count || 0;
  },

  /** Mark one as read */
  async markRead(id) {
    const client = _sb();
    if (!client) return;
    await client.from('notifications').update({ is_read: true }).eq('id', id);
  },

  /** Mark all as read */
  async markAllRead() {
    const s = _session();
    const client = _sb();
    if (!client) return;
    await client.from('notifications')
      .update({ is_read: true })
      .eq('user_id', s.id)
      .eq('is_read', false);
  },

  /** Insert a notification (called internally after booking events) */
  async send(userId, type, titleAr, bodyAr, link) {
    const client = _sb();
    if (!client) return;
    await client.from('notifications').insert({
      user_id: userId, type, title_ar: titleAr, body_ar: bodyAr, link
    });
  }
};


/* ══════════════════════════════════════════════════════════════
   COMPLAINTS
   ══════════════════════════════════════════════════════════════ */
const Complaints = {

  async list() {
    const s = _session();
    const client = _sb();
    if (!client) return { ok: false, data: [] };

    const { data, error } = await client
      .from('complaints')
      .select('*, messages:complaint_messages(count)')
      .eq('customer_id', s.id)
      .order('created_at', { ascending: false });

    if (error) { console.error('Complaints.list:', error); return { ok: false, data: [] }; }
    return { ok: true, data: data || [] };
  },

  async create(fields) {
    const s = _session();
    const client = _sb();
    if (!client) return { ok: false };

    const { data, error } = await client
      .from('complaints')
      .insert({ customer_id: s.id, ...fields })
      .select().single();

    if (error) { console.error('Complaints.create:', error); return { ok: false, error }; }
    return { ok: true, data };
  },

  async getMessages(complaintId) {
    const client = _sb();
    if (!client) return { ok: false, data: [] };

    const { data, error } = await client
      .from('complaint_messages')
      .select('*, sender:profiles(full_name, role)')
      .eq('complaint_id', complaintId)
      .order('created_at', { ascending: true });

    if (error) { console.error('Complaints.getMessages:', error); return { ok: false, data: [] }; }
    return { ok: true, data: data || [] };
  },

  async sendMessage(complaintId, body) {
    const s = _session();
    const client = _sb();
    if (!client) return { ok: false };

    const { error } = await client.from('complaint_messages').insert({
      complaint_id: complaintId,
      sender_id:    s.id,
      sender_role:  s.role || 'customer',
      body
    });

    if (error) { console.error('Complaints.sendMessage:', error); return { ok: false, error }; }
    return { ok: true };
  }
};


/* ══════════════════════════════════════════════════════════════
   CHAT
   ══════════════════════════════════════════════════════════════ */
const Chat = {

  async getOrCreateSession(bookingId, customerId, providerId) {
    const client = _sb();
    if (!client) return { ok: false, data: null };

    // Try existing session
    const { data: existing } = await client
      .from('chat_sessions')
      .select('*')
      .eq('booking_id', bookingId)
      .maybeSingle();

    if (existing) return { ok: true, data: existing };

    // Create new
    const { data, error } = await client
      .from('chat_sessions')
      .insert({ booking_id: bookingId, customer_id: customerId, provider_id: providerId })
      .select().single();

    if (error) { console.error('Chat.getOrCreateSession:', error); return { ok: false, data: null }; }
    return { ok: true, data };
  },

  async getMessages(sessionId) {
    const client = _sb();
    if (!client) return { ok: false, data: [] };

    const { data, error } = await client
      .from('chat_messages')
      .select('*, sender:profiles(id, full_name, role)')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) { console.error('Chat.getMessages:', error); return { ok: false, data: [] }; }
    return { ok: true, data: data || [] };
  },

  async send(sessionId, body, msgType) {
    const s = _session();
    const client = _sb();
    if (!client) return { ok: false };

    const { error } = await client.from('chat_messages').insert({
      session_id: sessionId,
      sender_id:  s.id,
      body,
      msg_type:   msgType || 'text'
    });

    if (error) { console.error('Chat.send:', error); return { ok: false, error }; }
    return { ok: true };
  },

  /** Subscribe to new messages in real-time */
  subscribe(sessionId, callback) {
    const client = _sb();
    if (!client) return null;

    return client
      .channel('chat_' + sessionId)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'chat_messages',
        filter: 'session_id=eq.' + sessionId
      }, payload => callback(payload.new))
      .subscribe();
  }
};


/* ══════════════════════════════════════════════════════════════
   SERVICE CATEGORIES
   ══════════════════════════════════════════════════════════════ */
const Categories = {

  async list() {
    const client = _sb();
    if (!client) return { ok: false, data: [] };

    const { data, error } = await client
      .from('service_categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');

    if (error) { console.error('Categories.list:', error); return { ok: false, data: [] }; }
    return { ok: true, data: data || [] };
  }
};


/* ══════════════════════════════════════════════════════════════
   AI SESSION LAYER (mock — no provider connected yet)
   ══════════════════════════════════════════════════════════════ */
const AiChat = {

  async startSession() {
    const s = _session();
    const client = _sb();
    if (!client) return { ok: false, data: null };

    const { data, error } = await client
      .from('ai_sessions')
      .insert({ user_id: s.id, context: {}, status: 'active' })
      .select().single();

    if (error) { console.error('AiChat.startSession:', error); return { ok: false, data: null }; }
    return { ok: true, data };
  },

  async sendMessage(sessionId, body, role) {
    const client = _sb();
    if (!client) return { ok: false };

    const { error } = await client.from('ai_messages').insert({
      session_id: sessionId,
      role:       role || 'user',
      body
    });

    if (error) { console.error('AiChat.sendMessage:', error); return { ok: false, error }; }
    return { ok: true };
  },

  async getHistory(sessionId) {
    const client = _sb();
    if (!client) return { ok: false, data: [] };

    const { data, error } = await client
      .from('ai_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) { console.error('AiChat.getHistory:', error); return { ok: false, data: [] }; }
    return { ok: true, data: data || [] };
  },

  /** Mock AI response — to be replaced with real AI provider at launch */
  async mockRespond(userMessage) {
    const msg = userMessage.toLowerCase();
    if (msg.includes('تسريب') || msg.includes('سباك') || msg.includes('ماء'))
      return { intent: 'plumbing',   reply: 'يبدو أنك تحتاج سباكاً. هل تريد أن أجد لك أقرب مزود؟' };
    if (msg.includes('كهرب') || msg.includes('تيار') || msg.includes('فيوز'))
      return { intent: 'electrical', reply: 'مشكلة كهربائية؟ سأساعدك في إيجاد كهربائي معتمد.' };
    if (msg.includes('تكييف') || msg.includes('مكيف'))
      return { intent: 'ac',         reply: 'يحتاج المكيف لصيانة؟ عندي قائمة بأفضل فنيي تكييف.' };
    if (msg.includes('تنظيف') || msg.includes('نظاف'))
      return { intent: 'cleaning',   reply: 'تحتاج خدمة تنظيف؟ يسعدني مساعدتك.' };
    return { intent: null, reply: 'أخبرني أكثر عن المشكلة وسأحاول مساعدتك في إيجاد الخدمة المناسبة.' };
  }
};


/* ══════════════════════════════════════════════════════════════
   COMPANIES  (contractor/client company profiles)
   ══════════════════════════════════════════════════════════════ */
const Companies = {

  /** Get the company associated with the current user */
  async myCompany() {
    const s = _session();
    const client = _sb();
    if (!client) return { ok: false, data: null };

    const { data, error } = await client
      .from('companies')
      .select('*')
      .eq('owner_id', s.id)
      .maybeSingle();

    if (error) { console.error('Companies.myCompany:', error); return { ok: false, data: null }; }
    return { ok: true, data };
  },

  async get(id) {
    const client = _sb();
    if (!client) return { ok: false, data: null };

    const { data, error } = await client
      .from('companies')
      .select('*')
      .eq('id', id)
      .single();

    if (error) { console.error('Companies.get:', error); return { ok: false, data: null }; }
    return { ok: true, data };
  },

  async create(fields) {
    const s = _session();
    const client = _sb();
    if (!client) return { ok: false };

    const { data, error } = await client
      .from('companies')
      .insert({ owner_id: s.id, ...fields })
      .select().single();

    if (error) { console.error('Companies.create:', error); return { ok: false, error }; }
    return { ok: true, data };
  },

  async update(id, fields) {
    const client = _sb();
    if (!client) return { ok: false };

    const { error } = await client.from('companies').update(fields).eq('id', id);
    if (error) { console.error('Companies.update:', error); return { ok: false, error }; }
    return { ok: true };
  }
};


/* ══════════════════════════════════════════════════════════════
   TENDERS
   ══════════════════════════════════════════════════════════════ */
const Tenders = {

  /** List tenders — optional filters: { category, region, status } */
  async list(filters) {
    const client = _sb();
    if (!client) return { ok: false, data: [] };

    let q = client
      .from('tenders')
      .select(`
        *,
        company:companies(id, name, logo_url, verified),
        bids_count:tender_bids(count)
      `)
      .order('created_at', { ascending: false })
      .limit(50);

    if (filters) {
      if (filters.category) q = q.eq('category', filters.category);
      if (filters.region)   q = q.eq('region', filters.region);
      if (filters.status)   q = q.eq('status', filters.status);
    }

    const { data, error } = await q;
    if (error) { console.error('Tenders.list:', error); return { ok: false, data: [] }; }
    return { ok: true, data: data || [] };
  },

  async get(id) {
    const client = _sb();
    if (!client) return { ok: false, data: null };

    const { data, error } = await client
      .from('tenders')
      .select(`
        *,
        company:companies(id, name, logo_url, verified, rating),
        bids:tender_bids(
          id, amount, duration_months, note, terms_accepted, terms_accepted_at, created_at, status,
          company:companies(id, name, classification, years_experience, rating)
        )
      `)
      .eq('id', id)
      .single();

    if (error) { console.error('Tenders.get:', error); return { ok: false, data: null }; }
    return { ok: true, data };
  },

  async create(fields) {
    const s = _session();
    const client = _sb();
    if (!client) return { ok: false };

    // Get company for current user
    const { data: co } = await client
      .from('companies')
      .select('id')
      .eq('owner_id', s.id)
      .maybeSingle();

    const { data, error } = await client
      .from('tenders')
      .insert({ company_id: co ? co.id : null, created_by: s.id, status: 'open', ...fields })
      .select().single();

    if (error) { console.error('Tenders.create:', error); return { ok: false, error }; }
    return { ok: true, data };
  },

  async update(id, fields) {
    const client = _sb();
    if (!client) return { ok: false };

    const { error } = await client.from('tenders').update(fields).eq('id', id);
    if (error) { console.error('Tenders.update:', error); return { ok: false, error }; }
    return { ok: true };
  },

  /** Award tender: mark winning bid, reject others, set tender to 'awarded' */
  async award(tenderId, winningBidId) {
    const client = _sb();
    if (!client) return { ok: false };

    // Mark winner
    const { error: e1 } = await client
      .from('tender_bids')
      .update({ status: 'won' })
      .eq('id', winningBidId);
    if (e1) { console.error('Tenders.award winner:', e1); return { ok: false, error: e1 }; }

    // Reject others
    await client
      .from('tender_bids')
      .update({ status: 'rejected' })
      .eq('tender_id', tenderId)
      .neq('id', winningBidId);

    // Update tender
    const { error: e2 } = await client
      .from('tenders')
      .update({ status: 'awarded', winning_bid_id: winningBidId, awarded_at: new Date().toISOString() })
      .eq('id', tenderId);
    if (e2) { console.error('Tenders.award tender:', e2); return { ok: false, error: e2 }; }

    return { ok: true };
  }
};


/* ══════════════════════════════════════════════════════════════
   TENDER BIDS
   ══════════════════════════════════════════════════════════════ */
const TenderBids = {

  /** Submit a bid — fields must include termsAccepted:true */
  async submit(tenderId, fields) {
    const s = _session();
    const client = _sb();
    if (!client) return { ok: false };
    if (!fields.terms_accepted) return { ok: false, error: 'يجب قبول الشروط والأحكام قبل التقديم' };

    // Get company
    const { data: co } = await client
      .from('companies')
      .select('id')
      .eq('owner_id', s.id)
      .maybeSingle();

    const payload = {
      tender_id:          tenderId,
      company_id:         co ? co.id : null,
      submitted_by:       s.id,
      status:             'pending',
      terms_accepted:     true,
      terms_accepted_at:  new Date().toISOString(),
      ...fields
    };

    const { data, error } = await client
      .from('tender_bids')
      .insert(payload)
      .select().single();

    if (error) { console.error('TenderBids.submit:', error); return { ok: false, error }; }
    return { ok: true, data };
  },

  async listMine() {
    const s = _session();
    const client = _sb();
    if (!client) return { ok: false, data: [] };

    const { data, error } = await client
      .from('tender_bids')
      .select(`
        *,
        tender:tenders(id, title, category, region, status, budget_max, deadline)
      `)
      .eq('submitted_by', s.id)
      .order('created_at', { ascending: false });

    if (error) { console.error('TenderBids.listMine:', error); return { ok: false, data: [] }; }
    return { ok: true, data: data || [] };
  },

  async listForTender(tenderId) {
    const client = _sb();
    if (!client) return { ok: false, data: [] };

    const { data, error } = await client
      .from('tender_bids')
      .select(`
        *,
        company:companies(id, name, classification, years_experience, rating, logo_url)
      `)
      .eq('tender_id', tenderId)
      .order('amount', { ascending: true });

    if (error) { console.error('TenderBids.listForTender:', error); return { ok: false, data: [] }; }
    return { ok: true, data: data || [] };
  }
};


/* ══════════════════════════════════════════════════════════════
   COMMISSIONS  (2% platform commission on awarded tenders)
   ══════════════════════════════════════════════════════════════ */
const Commissions = {

  RATE: 0.02,

  /** Calculate commission amount from tender value */
  calc(tenderValue) {
    return Math.round(Number(tenderValue) * this.RATE);
  },

  /** Create commission record — commission_amount is auto-calculated */
  async create(fields) {
    const client = _sb();
    if (!client) return { ok: false };

    const commission_amount = this.calc(fields.tender_value || 0);

    const { data, error } = await client
      .from('commissions')
      .insert({
        commission_rate:   this.RATE,
        commission_amount,
        status:            'pending',
        ...fields
      })
      .select().single();

    if (error) { console.error('Commissions.create:', error); return { ok: false, error }; }
    return { ok: true, data };
  },

  /** List commissions — optional filters: { status, company_id } */
  async list(filters) {
    const client = _sb();
    if (!client) return { ok: false, data: [] };

    let q = client
      .from('commissions')
      .select(`
        *,
        tender:tenders(id, title, category, region),
        company:companies(id, name, rating)
      `)
      .order('created_at', { ascending: false });

    if (filters) {
      if (filters.status)     q = q.eq('status', filters.status);
      if (filters.company_id) q = q.eq('company_id', filters.company_id);
    }

    const { data, error } = await q;
    if (error) { console.error('Commissions.list:', error); return { ok: false, data: [] }; }
    return { ok: true, data: data || [] };
  },

  async updateStatus(id, status, extra) {
    const client = _sb();
    if (!client) return { ok: false };

    const timestamps = {
      in_progress:    { project_started_at: new Date().toISOString() },
      completed:      { project_completed_at: new Date().toISOString() },
      invoice_issued: { invoice_issued_at: new Date().toISOString() },
      paid:           { paid_at: new Date().toISOString() },
    };

    const { error } = await client
      .from('commissions')
      .update({ status, ...(timestamps[status] || {}), ...extra })
      .eq('id', id);

    if (error) { console.error('Commissions.updateStatus:', error); return { ok: false, error }; }
    return { ok: true };
  }
};


/* ══════════════════════════════════════════════════════════════
   PROJECT REQUIREMENTS  (NLP-extracted from chat)
   ══════════════════════════════════════════════════════════════ */
const ProjectRequirements = {

  async create(fields) {
    const s = _session();
    const client = _sb();
    if (!client) return { ok: false };

    const { data, error } = await client
      .from('project_requirements')
      .insert({ requested_by: s.id, status: 'open', ...fields })
      .select().single();

    if (error) { console.error('ProjectRequirements.create:', error); return { ok: false, error }; }
    return { ok: true, data };
  },

  async list(tenderId) {
    const client = _sb();
    if (!client) return { ok: false, data: [] };

    const { data, error } = await client
      .from('project_requirements')
      .select(`
        *,
        offers:supplier_offers(count)
      `)
      .eq('tender_id', tenderId)
      .order('created_at', { ascending: false });

    if (error) { console.error('ProjectRequirements.list:', error); return { ok: false, data: [] }; }
    return { ok: true, data: data || [] };
  },

  /**
   * NLP parser — extract equipment/manpower requirements from Arabic free text.
   * Returns array of requirement objects ready to display/save.
   */
  parse(text) {
    if (!text) return [];

    var EQUIPMENT = {
      'رافعة شوكية': 'رافعة شوكية', 'فوركليفت': 'رافعة شوكية',
      'رافعة برجية': 'رافعة برجية', 'كرين': 'رافعة برجية', 'رافعة': 'رافعة برجية',
      'حفارة': 'حفارة', 'حفار': 'حفارة',
      'لودر': 'لودر',
      'مولد كهربائي': 'مولد كهربائي', 'مولد': 'مولد كهربائي',
      'ضاغط هواء': 'ضاغط هواء', 'كمبريسور': 'ضاغط هواء',
      'خلاطة خرسانة': 'خلاطة خرسانة', 'خلاطة': 'خلاطة خرسانة',
      'شاحنة': 'شاحنة نقل', 'سيارة نقل': 'شاحنة نقل',
      'رافعة هيدروليكية': 'رافعة هيدروليكية',
      'مضخة مياه': 'مضخة مياه', 'مضخة': 'مضخة مياه',
      'سقالة': 'سقالة', 'سقالات': 'سقالة'
    };

    var MANPOWER = {
      'سباك': 'سباكة', 'سباكة': 'سباكة',
      'كهربائي': 'كهرباء', 'كهرباء': 'كهرباء',
      'لحام': 'لحام', 'لحامين': 'لحام',
      'مهندس مدني': 'هندسة مدنية', 'مهندس': 'هندسة',
      'مشرف': 'إشراف', 'مشرف مشروع': 'إشراف',
      'مشرف سلامة': 'سلامة', 'مسؤول سلامة': 'سلامة',
      'عامل': 'عمالة عامة', 'عمال': 'عمالة عامة', 'عمالة': 'عمالة عامة',
      'سائق': 'قيادة', 'سائقين': 'قيادة',
      'حارس': 'حراسة', 'حراسة': 'حراسة',
      'نجار': 'نجارة', 'حداد': 'حدادة',
      'رسام': 'دهان', 'دهان': 'دهان',
      'مساح': 'مساحة', 'مساحة': 'مساحة'
    };

    var results = [];
    var found = {};
    var words = text.split(/\s+/);

    // Try multi-word matches first (longest match)
    var allTerms = Object.keys(EQUIPMENT).concat(Object.keys(MANPOWER));
    allTerms.sort(function(a, b) { return b.length - a.length; });

    allTerms.forEach(function(term) {
      if (text.includes(term) && !found[term]) {
        var type   = EQUIPMENT[term] ? 'equipment' : 'manpower';
        var nameAr = EQUIPMENT[term] || MANPOWER[term];

        // Extract quantity: look for digit before/after the term
        var qtyRegex = new RegExp('(\\d+)\\s*' + term + '|' + term + '\\s*(\\d+)');
        var qtyMatch = text.match(qtyRegex);
        var quantity = qtyMatch ? parseInt(qtyMatch[1] || qtyMatch[2]) : 1;

        // Extract duration: شهر/أشهر/يوم/أيام/أسبوع/أسابيع after the term
        var durRegex = new RegExp(term + '[\\s\\S]{0,30}?(\\d+)\\s*(شهر|أشهر|يوم|أيام|أسبوع|أسابيع)');
        var durMatch = text.match(durRegex);
        var durationDays = null;
        if (durMatch) {
          var num = parseInt(durMatch[1]);
          var unit = durMatch[2];
          if (unit.includes('شهر') || unit.includes('أشهر')) durationDays = num * 30;
          else if (unit.includes('أسبوع') || unit.includes('أسابيع')) durationDays = num * 7;
          else durationDays = num;
        }

        results.push({ type, name_ar: nameAr, quantity, duration_days: durationDays, source_text: term });
        found[term] = true;

        // Mark sub-terms as found to avoid double-counting
        Object.keys(EQUIPMENT).concat(Object.keys(MANPOWER)).forEach(function(t2) {
          if (t2 !== term && term.includes(t2)) found[t2] = true;
        });
      }
    });

    return results;
  }
};


/* ══════════════════════════════════════════════════════════════
   SUPPLIER OFFERS  (bids on project requirements)
   ══════════════════════════════════════════════════════════════ */
const SupplierOffers = {

  async submit(requirementId, fields) {
    const s = _session();
    const client = _sb();
    if (!client) return { ok: false };

    const { data: co } = await client
      .from('companies')
      .select('id')
      .eq('owner_id', s.id)
      .maybeSingle();

    const { data, error } = await client
      .from('supplier_offers')
      .insert({
        requirement_id: requirementId,
        supplier_id:    s.id,
        company_id:     co ? co.id : null,
        status:         'pending',
        ...fields
      })
      .select().single();

    if (error) { console.error('SupplierOffers.submit:', error); return { ok: false, error }; }
    return { ok: true, data };
  },

  async listForReq(requirementId) {
    const client = _sb();
    if (!client) return { ok: false, data: [] };

    const { data, error } = await client
      .from('supplier_offers')
      .select(`
        *,
        company:companies(id, name, rating, verified)
      `)
      .eq('requirement_id', requirementId)
      .order('price_total', { ascending: true });

    if (error) { console.error('SupplierOffers.listForReq:', error); return { ok: false, data: [] }; }
    return { ok: true, data: data || [] };
  },

  /** Select winning offer — rejects all others for same requirement */
  async select(offerId, requirementId) {
    const client = _sb();
    if (!client) return { ok: false };

    const { error: e1 } = await client
      .from('supplier_offers')
      .update({ status: 'accepted' })
      .eq('id', offerId);
    if (e1) { console.error('SupplierOffers.select winner:', e1); return { ok: false, error: e1 }; }

    await client
      .from('supplier_offers')
      .update({ status: 'rejected' })
      .eq('requirement_id', requirementId)
      .neq('id', offerId);

    await client
      .from('project_requirements')
      .update({ status: 'awarded' })
      .eq('id', requirementId);

    return { ok: true };
  }
};
