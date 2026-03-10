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
