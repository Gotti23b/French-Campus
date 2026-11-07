(() => {
  const cfg = window.FRENCH_CAMPUS_CONFIG;
  const root = document.getElementById('live-app');
  if (!cfg || !window.supabase || !root) return;
  const db = window.supabase.createClient(cfg.url, cfg.publishableKey);
  const roles = { direccion: 'Dirección', alumno: 'Alumno/a', familia: 'Padre, madre o tutor', docente: 'Docente' };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date = (v) => v ? new Date(v).toLocaleString('es-AR', {dateStyle:'medium',timeStyle:'short'}) : 'Sin fecha';
  const row = (title, detail, meta) => '<article class="fc-row"><div><strong>' + esc(title) + '</strong>' + (detail ? '<p>' + esc(detail) + '</p>' : '') + '</div>' + (meta ? '<span class="fc-meta">' + esc(meta) + '</span>' : '') + '</article>';
  const section = (title, items, render, empty) => '<section class="fc-panel"><div class="fc-panel-head"><h2>' + esc(title) + '</h2><span>' + items.length + '</span></div>' + (items.length ? '<div class="fc-list">' + items.map(render).join('') + '</div>' : '<p class="fc-empty">' + esc(empty) + '</p>') + '</section>';
  async function rows(query) { const r = await query; if (r.error) throw r.error; return r.data || []; }

  async function markMessagesRead(messages, user) {
    const incoming = messages.filter((message) => message.sender_id !== user.id);
    if (!incoming.length) return [];
    const ids = incoming.map((message) => message.id);
    const existing = await rows(db.from('message_reads').select('message_id').eq('user_id', user.id).in('message_id', ids));
    const seen = new Set(existing.map((item) => item.message_id));
    const missing = ids.filter((id) => !seen.has(id));
    if (missing.length) {
      const result = await db.from('message_reads').insert(missing.map((id) => ({message_id:id,user_id:user.id})));
      if (result.error) throw result.error;
    }
    return rows(db.from('message_reads').select('message_id,user_id').in('message_id', ids));
  }

  function communicationPanel(conversations, messages, receipts, user, role, familyNames) {
    const cards = conversations.map((conversation) => {
      const thread = messages.filter((message) => message.conversation_id === conversation.id);
      const history = thread.map((message) => {
        const mine = message.sender_id === user.id;
        const sender = mine ? 'Vos' : (role === 'familia' ? 'Dirección' : (familyNames[conversation.parent_user_id] || 'Familia'));
        const readByOther = receipts.some((receipt) => receipt.message_id === message.id && (role === 'familia' ? receipt.user_id !== user.id : receipt.user_id === conversation.parent_user_id));
        return '<div class="fc-message-bubble ' + (mine ? 'mine' : '') + '"><strong>' + esc(sender) + '</strong><p>' + esc(message.body) + '</p><small>' + esc(date(message.created_at)) + (mine && readByOther ? ' · Leído' : '') + '</small></div>';
      }).join('');
      return '<article class="fc-thread"><div class="fc-thread-title"><strong>' + esc(conversation.subject) + '</strong><small>' + esc(date(conversation.updated_at || conversation.created_at)) + '</small></div>' +
        (history || '<p class="fc-empty">Todavía no hay mensajes.</p>') +
        '<form class="fc-reply-form" data-conversation="' + esc(conversation.id) + '"><textarea name="body" rows="2" required maxlength="5000" placeholder="Escribí una respuesta…"></textarea><button class="fc-primary" type="submit">Enviar</button><small class="fc-form-status" aria-live="polite"></small></form></article>';
    }).join('');
    return '<section class="fc-panel"><div class="fc-panel-head"><h2>' + (role === 'familia' ? 'Comunicaciones de Dirección' : 'Bandeja de familias') + '</h2><span>' + conversations.length + '</span></div>' +
      (cards || '<p class="fc-empty">Todavía no hay conversaciones.</p>') + '</section>';
  }

  function newConversationBlock(user, role, children, guardians) {
    let recipient = '';
    if (role === 'familia') {
      recipient = '<label>Hijo/a relacionado/a (opcional)</label><select name="student_id"><option value="">Consulta general</option>' +
        children.map((child) => '<option value="' + esc(child.id) + '">' + esc(child.full_name) + '</option>').join('') + '</select>';
    } else {
      recipient = '<label>Familia destinataria</label><select name="recipient" required><option value="">Elegí una familia</option>' +
        guardians.map((guardian) => '<option value="' + esc(guardian.id) + '">' + esc(guardian.full_name || guardian.id) + '</option>').join('') + '</select>';
    }
    return '<section class="fc-panel"><div class="fc-panel-head"><h2>' + (role === 'familia' ? 'Nueva consulta a Dirección' : 'Iniciar conversación con una familia') + '</h2></div>' +
      '<form id="fc-new-conversation" class="fc-new-conversation">' + recipient +
      '<label>Asunto</label><input name="subject" required maxlength="160" placeholder="Asunto de la consulta">' +
      '<label>Mensaje</label><textarea name="body" rows="3" required maxlength="5000" placeholder="Escribí tu mensaje…"></textarea>' +
      '<button class="fc-primary" type="submit">Enviar mensaje</button><small class="fc-form-status" aria-live="polite"></small></form></section>';
  }

  function attachCommunicationForms(user, role) {
    document.querySelectorAll('.fc-reply-form').forEach((form) => {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = form.querySelector('button');
        const status = form.querySelector('.fc-form-status');
        const body = form.querySelector('[name="body"]').value.trim();
        if (!body) return;
        button.disabled = true;
        const result = await db.from('messages').insert({
          conversation_id: form.dataset.conversation,
          sender_id: user.id,
          body
        });
        if (result.error) {
          status.textContent = 'No se pudo enviar. Revisá tus permisos o intentá nuevamente.';
          button.disabled = false;
          return;
        }
        await render(user);
      });
    });

    const form = document.getElementById('fc-new-conversation');
    if (form) form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('button');
      const status = form.querySelector('.fc-form-status');
      const subject = form.querySelector('[name="subject"]').value.trim();
      const body = form.querySelector('[name="body"]').value.trim();
      const parentId = role === 'familia' ? user.id : form.querySelector('[name="recipient"]').value;
      const studentId = role === 'familia' ? (form.querySelector('[name="student_id"]').value || null) : null;
      if (!parentId || !subject || !body) return;
      button.disabled = true;
      const conversation = await db.from('conversations').insert({
        parent_user_id: parentId,
        student_id: studentId,
        created_by: user.id,
        subject
      }).select('id').single();
      if (conversation.error) {
        status.textContent = 'No se pudo crear la conversación.';
        button.disabled = false;
        return;
      }
      const message = await db.from('messages').insert({
        conversation_id: conversation.data.id,
        sender_id: user.id,
        body
      });
      if (message.error) {
        status.textContent = 'La conversación se creó, pero no se pudo enviar el mensaje.';
        button.disabled = false;
        return;
      }
      await render(user);
    });
  }

  function login(message) {
    root.innerHTML = '<main class="fc-screen"><section class="fc-login"><div class="fc-brand"><span class="fc-mark">F</span><div><strong>French Campus</strong><small>COLEGIO FRENCH</small></div></div><div class="fc-kicker">TU ESPACIO ESCOLAR</div><h1>¡Qué bueno verte!</h1><p class="fc-muted">Ingresá con la cuenta autorizada para usar el campus.</p><button id="fc-google-login" type="button" class="fc-primary" style="width:100%;display:flex;align-items:center;justify-content:center;gap:10px;background:#fff;color:#26384b;border:1px solid #dce4ed;box-shadow:0 2px 8px #102b4610"><span style="font-weight:800;font-size:17px;color:#4285f4">G</span> Continuar con Google</button><div style="display:flex;align-items:center;gap:12px;margin:18px 0;color:#8a98a8;font-size:11px"><span style="height:1px;background:#e8edf3;flex:1"></span>O TAMBIÉN<span style="height:1px;background:#e8edf3;flex:1"></span></div><form id="fc-login-form" class="fc-form"><label for="fc-email">Correo electrónico</label><input id="fc-email" name="email" type="email" autocomplete="username" required placeholder="Tu correo"><label for="fc-password">Contraseña</label><input id="fc-password" name="password" type="password" autocomplete="current-password" required placeholder="Tu contraseña"><button class="fc-primary" type="submit">Iniciar sesión</button><p class="fc-message" id="fc-message" role="status">' + esc(message || '') + '</p></form><p class="fc-footnote">El acceso requiere autorización de Dirección. No hay registro público.</p></section></main>';
    document.getElementById('fc-google-login').addEventListener('click', async () => {
      const button = document.getElementById('fc-google-login');
      const status = document.getElementById('fc-message');
      button.disabled = true;
      button.textContent = 'Conectando con Google…';
      const { error } = await db.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + window.location.pathname }
      });
      if (error) {
        status.textContent = 'No se pudo iniciar con Google. Revisá la configuración o intentá nuevamente.';
        button.disabled = false;
        button.innerHTML = '<span style="font-weight:800;font-size:17px;color:#4285f4">G</span> Continuar con Google';
      }
    });
    document.getElementById('fc-login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const button = e.currentTarget.querySelector('button');
      button.disabled = true; button.textContent = 'Ingresando…';
      const email = document.getElementById('fc-email').value.trim();
      const password = document.getElementById('fc-password').value;
      const result = await db.auth.signInWithPassword({email, password});
      if (result.error) {
        document.getElementById('fc-message').textContent = 'No se pudo iniciar sesión. Revisá el correo y la contraseña.';
        button.disabled = false; button.textContent = 'Iniciar sesión'; return;
      }
      const session = await db.auth.getSession();
      if (session.data.session) await render(session.data.session.user);
    });
  }

  function pending(user) {
    const rejected = user.app_metadata && user.app_metadata.access_status === 'rejected';
    root.innerHTML = '<main class="fc-screen"><section class="fc-card fc-pending"><div class="fc-brand"><span class="fc-mark">F</span><div><strong>French Campus</strong><small>COLEGIO FRENCH</small></div></div><div class="fc-pending-icon">' + (rejected ? '⛔' : '⌛') + '</div><h1>' + (rejected ? 'Acceso no autorizado' : 'Esperando confirmación de tu usuario') + '</h1><p class="fc-muted">La cuenta <strong>' + esc(user.email) + '</strong> ' + (rejected ? 'no fue autorizada para ingresar al campus.' : 'inició sesión correctamente, pero todavía necesita la aprobación de Dirección.') + '</p><p class="fc-footnote">' + (rejected ? 'Si creés que se trata de un error, comunicate con Dirección del Colegio French.' : 'Cuando Dirección apruebe tu cuenta y le asigne un rol, vas a poder ingresar al panel correspondiente.') + '</p>' + (rejected ? '' : '<button id="fc-refresh-access" class="fc-primary">Actualizar estado</button>') + '<button id="fc-logout" class="fc-secondary">Cerrar sesión</button></section></main>';
    const refresh = document.getElementById('fc-refresh-access');
    if (refresh) refresh.addEventListener('click', async () => {
      refresh.disabled = true;
      refresh.textContent = 'Actualizando…';
      const result = await db.auth.refreshSession();
      if (result.data && result.data.session) await render(result.data.session.user);
      else { refresh.disabled = false; refresh.textContent = 'No se pudo actualizar. Reintentar'; }
    });
    document.getElementById('fc-logout').addEventListener('click', () => db.auth.signOut());
  }

  async function getAccessRequests() {
    const result = await db.functions.invoke('manage-access', { body: { action: 'list' } });
    if (result.error) throw result.error;
    return result.data && result.data.requests || [];
  }

  function accessRequestsPanel(requests) {
    const cards = requests.map((request) =>
      '<article class="fc-access-request" style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:14px 0;border-bottom:1px solid #e8edf3">' +
        '<div><strong>' + esc(request.full_name || request.email || 'Cuenta nueva') + '</strong><p>' + esc(request.email || '') + '</p><small>' + esc(date(request.created_at)) + '</small></div>' +
        '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end"><select aria-label="Rol para ' + esc(request.email || 'la cuenta') + '" style="max-width:150px;padding:9px;border:1px solid #dce4ed;border-radius:9px;background:#fff" data-access-role><option value="alumno">Alumno</option><option value="docente">Docente</option><option value="familia">Familia</option></select><button type="button" class="fc-primary fc-access-approve" data-user-id="' + esc(request.id) + '">Aprobar</button><button type="button" class="fc-secondary fc-access-reject" data-user-id="' + esc(request.id) + '">Rechazar</button></div>' +
      '</article>'
    ).join('');
    return '<section class="fc-panel"><div class="fc-panel-head"><h2>Solicitudes de acceso</h2><span>' + requests.length + '</span></div>' +
      (cards || '<p class="fc-empty">No hay cuentas pendientes de aprobación.</p>') +
      '<p class="fc-footnote" style="margin-top:12px">Elegí el rol antes de aprobar cada cuenta. Los usuarios no pueden asignárselo por su cuenta.</p></section>';
  }

  function attachAccessRequestActions(user) {
    document.querySelectorAll('.fc-access-approve').forEach((button) => button.addEventListener('click', async () => {
      const card = button.closest('.fc-access-request');
      const role = card.querySelector('[data-access-role]').value;
      const buttons = card.querySelectorAll('button');
      buttons.forEach((item) => { item.disabled = true; });
      const result = await db.functions.invoke('manage-access', { body: { action: 'approve', userId: button.dataset.userId, role } });
      if (result.error) {
        buttons.forEach((item) => { item.disabled = false; });
        button.textContent = 'Error al aprobar';
        return;
      }
      await render(user);
    }));
    document.querySelectorAll('.fc-access-reject').forEach((button) => button.addEventListener('click', async () => {
      const card = button.closest('.fc-access-request');
      const buttons = card.querySelectorAll('button');
      buttons.forEach((item) => { item.disabled = true; });
      const result = await db.functions.invoke('manage-access', { body: { action: 'reject', userId: button.dataset.userId } });
      if (result.error) {
        buttons.forEach((item) => { item.disabled = false; });
        button.textContent = 'Error al rechazar';
        return;
      }
      await render(user);
    }));
  }

  async function profileFor(user) {
    let result = await db.from('profiles').select('id,full_name').eq('id', user.id).maybeSingle();
    if (result.error) throw result.error;
    if (result.data) return result.data;
    const name = user.user_metadata && user.user_metadata.full_name || (user.email || 'Usuario').split('@')[0];
    result = await db.from('profiles').insert({id:user.id,full_name:name}).select('id,full_name').single();
    if (result.error) throw result.error;
    return result.data;
  }


  function studentPortalContent(data) {
    const subjectNames = [...new Set([
      ...data.grades.map(x => x.subjects && x.subjects.name),
      ...data.activities.map(x => x.subjects && x.subjects.name),
      ...data.materials.map(x => x.subjects && x.subjects.name)
    ].filter(Boolean))];
    const subjectCards = subjectNames.map((name, i) => {
      const icons = ['📐','📖','🧪','🌎','🎨','⚽','🇬🇧','💻'];
      const tones = ['c-math','c-lang','c-sci','c-hist','c-art','c-sport','c-lang','c-math'];
      const count = data.activities.filter(x => x.subjects && x.subjects.name === name).length +
        data.materials.filter(x => x.subjects && x.subjects.name === name).length;
      return '<article class="fc-student-subject"><span class="fc-student-subject-icon ' + tones[i % tones.length] + '">' + icons[i % icons.length] + '</span><div><strong>' + esc(name) + '</strong><small>' + count + ' recursos y actividades</small></div></article>';
    }).join('');
    const activityRows = data.activities.slice(0, 6).map((item, i) =>
      '<article class="fc-student-list-row"><span class="fc-student-symbol tone-' + (i % 4) + '">▤</span><div class="fc-student-row-copy"><strong>' + esc(item.title) + '</strong><small>' + esc((item.subjects && item.subjects.name || 'Actividad') + ' · ' + (item.courses && item.courses.label || 'Colegio French')) + '</small></div><span class="fc-student-pill">Publicada</span></article>'
    ).join('');
    const gradeRows = data.grades.slice(0, 5).map(item =>
      '<article class="fc-student-list-row"><span class="fc-student-symbol tone-1">✓</span><div class="fc-student-row-copy"><strong>' + esc(item.title) + '</strong><small>' + esc(item.subjects && item.subjects.name || 'Materia') + ' · ' + esc(date(item.recorded_at)) + '</small></div><span class="fc-student-grade">' + esc(item.score) + ' / ' + esc(item.max_score) + '</span></article>'
    ).join('');
    const materialRows = data.materials.slice(0, 5).map((item, i) =>
      '<article class="fc-student-list-row"><span class="fc-student-symbol tone-' + (i % 4) + '">▧</span><div class="fc-student-row-copy"><strong>' + esc(item.title) + '</strong><small>' + esc((item.subjects && item.subjects.name || 'Materia') + ' · ' + (item.courses && item.courses.label || 'Recurso escolar')) + '</small></div><span class="fc-student-arrow">›</span></article>'
    ).join('');
    const newsRows = data.news.slice(0, 4).map((item, i) =>
      '<article class="fc-student-news-row"><span>' + ['📣','📅','📚','🏫'][i % 4] + '</span><div><strong>' + esc(item.title) + '</strong><small>' + esc(date(item.published_at)) + '</small><p>' + esc(item.body || 'Comunicado del Colegio French.') + '</p></div></article>'
    ).join('');
    const empty = (message) => '<div class="fc-student-empty">' + esc(message) + '</div>';
    return '<section class="fc-student-hero"><div class="fc-student-hero-copy"><span>✦ TU ESPACIO ESCOLAR</span><h2>Todo tu recorrido escolar, en un solo lugar.</h2><p>Consultá tus actividades, revisá tus calificaciones y encontrá los materiales de tus materias.</p></div><div class="fc-student-hero-art" aria-hidden="true">📚<i>✦</i></div></section>' +
      '<section class="fc-student-section" id="student-materias"><div class="fc-student-section-head"><div><span>ESPACIO ACADÉMICO</span><h2>Mis materias</h2></div><b>' + subjectNames.length + '</b></div><div class="fc-student-subject-grid">' + (subjectCards || empty('Todavía no hay materias vinculadas a tus actividades o materiales.')) + '</div></section>' +
      '<div class="fc-student-two-col"><section class="fc-student-panel" id="student-actividades"><div class="fc-student-section-head"><div><span>ORGANIZÁ TU TRABAJO</span><h2>Actividades</h2></div><b>' + data.activities.length + '</b></div>' + (activityRows || empty('Todavía no hay actividades publicadas.')) + '</section>' +
      '<section class="fc-student-panel" id="student-calificaciones"><div class="fc-student-section-head"><div><span>SEGUIMIENTO ACADÉMICO</span><h2>Mis calificaciones</h2></div><b>' + data.grades.length + '</b></div>' + (gradeRows || empty('Todavía no hay calificaciones cargadas.')) + '</section></div>' +
      '<div class="fc-student-two-col"><section class="fc-student-panel" id="student-materiales"><div class="fc-student-section-head"><div><span>RECURSOS DE ESTUDIO</span><h2>Materiales</h2></div><b>' + data.materials.length + '</b></div>' + (materialRows || empty('Todavía no hay materiales publicados.')) + '</section>' +
      '<section class="fc-student-panel" id="student-novedades"><div class="fc-student-section-head"><div><span>COMUNIDAD FRENCH</span><h2>Novedades del colegio</h2></div><b>' + data.news.length + '</b></div>' + (newsRows || empty('No hay novedades para mostrar.')) + '</section></div>';
  }

  function studentDashboardMarkup(profile, data, preview) {
    const firstName = (profile.full_name || 'Estudiante').split(' ')[0];
    const stats = data.counts.map((item, i) =>
      '<article class="fc-student-stat"><span class="fc-student-stat-icon tone-' + i + '">' + ['▦','▤','▧','✓'][i] + '</span><div><strong>' + esc(item[1]) + '</strong><small>' + esc(item[0]) + '</small></div></article>'
    ).join('');
    return '<main class="fc-student-app"><header class="fc-student-top"><div class="fc-brand"><span class="fc-mark">F</span><div><strong>French Campus</strong><small>COLEGIO FRENCH</small></div></div><div class="fc-student-user"><div><strong>' + esc(profile.full_name || 'Estudiante') + '</strong><small>Alumno/a</small></div>' +
      (preview ? '<button id="fc-preview-exit" class="fc-secondary" type="button">Volver a Dirección</button>' : '<button id="fc-logout" class="fc-secondary" type="button">Salir</button>') +
      '</div></header><div class="fc-student-layout"><aside class="fc-student-sidebar"><div class="fc-student-school">🏫 <span><strong>Colegio French</strong><small>Campus educativo</small></span></div><nav aria-label="Secciones del campus"><a href="#student-inicio">⌂ <span>Inicio</span></a><a href="#student-materias">▦ <span>Mis materias</span></a><a href="#student-actividades">▤ <span>Actividades</span></a><a href="#student-calificaciones">✓ <span>Calificaciones</span></a><a href="#student-materiales">▧ <span>Materiales</span></a><a href="#student-novedades">♧ <span>Novedades</span></a></nav><div class="fc-student-sidebar-note">Tu espacio para aprender y organizarte.</div></aside><div class="fc-student-main" id="student-inicio"><div class="fc-student-welcome"><div><span>MI CAMPUS · CICLO LECTIVO</span><h1>¡Hola, ' + esc(firstName) + '! 👋</h1><p>Este es tu espacio para aprender, organizarte y estar al día.</p></div><span class="fc-student-date">COLEGIO FRENCH</span></div><section class="fc-student-stats">' + stats + '</section>' + studentPortalContent(data) + '<footer class="fc-student-footer">French Campus · Un espacio para aprender.</footer></div></div></main>';
  }

  function attachStudentNavigation() {
    document.querySelectorAll('.fc-student-sidebar a').forEach(link => link.addEventListener('click', event => {
      const target = document.querySelector(link.getAttribute('href'));
      if (target) {
        event.preventDefault();
        target.scrollIntoView({behavior:'smooth',block:'start'});
      }
    }));
  }

  function studentPreviewData() {
    const demoDate = (days) => new Date(Date.now() + days * 86400000).toISOString();
    const subjects = ['Matemática','Lengua y Literatura','Science','Historia'];
    const courses = ['1.º año','1.º año','1.º año','1.º año'];
    return {
      grades: [
        {id:'demo-g1',title:'Trabajo práctico',score:8,max_score:10,recorded_at:demoDate(-5),subjects:{name:'Matemática'}},
        {id:'demo-g2',title:'Science — Practice',score:9,max_score:10,recorded_at:demoDate(-2),subjects:{name:'Science'}}
      ],
      activities: [
        {id:'demo-a1',title:'Resolución de problemas',due_at:demoDate(4),subjects:{name:subjects[0]},courses:{label:courses[0]}},
        {id:'demo-a2',title:'Lectura y análisis de texto',due_at:demoDate(6),subjects:{name:subjects[1]},courses:{label:courses[1]}},
        {id:'demo-a3',title:'Science — Practice',due_at:demoDate(8),subjects:{name:subjects[2]},courses:{label:courses[2]}}
      ],
      materials: [
        {id:'demo-m1',title:'Guía de ejercicios',subjects:{name:'Matemática'},courses:{label:'1.º año'}},
        {id:'demo-m2',title:'Material de estudio',subjects:{name:'Science'},courses:{label:'1.º año'}},
        {id:'demo-m3',title:'Lecturas de la unidad',subjects:{name:'Lengua y Literatura'},courses:{label:'1.º año'}}
      ],
      news: [
        {id:'demo-n1',title:'Bienvenidos a French Campus',body:'Un nuevo espacio para acompañar tu recorrido escolar.',published_at:demoDate(-1)},
        {id:'demo-n2',title:'Calendario escolar',body:'Consultá las fechas importantes del ciclo lectivo.',published_at:demoDate(-3)}
      ],
      counts: [['Materias',4],['Actividades',3],['Materiales',3],['Calificaciones',2]]
    };
  }

  async function dashboardData(user, role) {
    let content = '';
    let counts = [];
    if (role === 'alumno') {
      const [grades, activities, materials, news] = await Promise.all([
        rows(db.from('grades').select('id,title,score,max_score,recorded_at,subjects(name)').eq('student_id',user.id).order('recorded_at',{ascending:false})),
        rows(db.from('activities').select('id,title,description,due_at,courses(label),subjects(name)').eq('published',true).order('due_at')),
        rows(db.from('materials').select('id,title,description,created_at,courses(label),subjects(name)').eq('published',true).order('created_at',{ascending:false})),
        rows(db.from('announcements').select('id,title,body,published_at').order('published_at',{ascending:false}))
      ]);
      counts = [['Materias',new Set([...grades,...activities,...materials].map(x=>x.subjects && x.subjects.name).filter(Boolean)).size],['Actividades',activities.length],['Materiales',materials.length],['Calificaciones',grades.length]];
      content = studentPortalContent({grades,activities,materials,news});
    } else if (role === 'familia') {
      const links = await rows(db.from('guardian_student_links').select('student_id,relationship'));
      const ids = links.map(x=>x.student_id);
      const [children,grades,news,conversations,messages] = await Promise.all([
        ids.length ? rows(db.from('profiles').select('id,full_name').in('id',ids)) : [],
        ids.length ? rows(db.from('grades').select('id,student_id,title,score,max_score,recorded_at,subjects(name)').in('student_id',ids).order('recorded_at',{ascending:false})) : [],
        rows(db.from('announcements').select('id,title,body,published_at').order('published_at',{ascending:false})),
        rows(db.from('conversations').select('id,subject,parent_user_id,student_id,updated_at,created_at').order('created_at',{ascending:false})),
        rows(db.from('messages').select('id,conversation_id,sender_id,body,created_at').order('created_at'))
      ]);
      const names = Object.fromEntries(children.map(x=>[x.id,x.full_name]));
      const receipts = await markMessagesRead(messages,user);
      counts = [['Hijos vinculados',children.length],['Calificaciones',grades.length],['Conversaciones',conversations.length]];
      content = section('Mis hijos',children,(c)=>row(c.full_name,'Alumno/a vinculado/a al grupo familiar',''),'Dirección todavía no vinculó alumnos.') +
        section('Calificaciones',grades,(g)=>row((names[g.student_id] || 'Alumno/a')+' · '+(g.subjects && g.subjects.name || 'Materia'),g.title+' · '+g.score+' / '+g.max_score,date(g.recorded_at)),'Todavía no hay calificaciones.') +
        communicationPanel(conversations,messages,receipts,user,role,{}) +
        newConversationBlock(user,role,children,[]) +
        section('Novedades',news,(n)=>row(n.title,n.body,date(n.published_at)),'No hay comunicados nuevos.');
    } else if (role === 'docente') {
      const assignments = await rows(db.from('teacher_assignments').select('id,course_id,subject_id,courses(label),subjects(name)').eq('teacher_id',user.id));
      const ids = [...new Set(assignments.map(x=>x.course_id))];
      const [activities,enrollments] = await Promise.all([
        ids.length ? rows(db.from('activities').select('id,title,description,due_at,courses(label),subjects(name)').in('course_id',ids).order('due_at')) : [],
        ids.length ? rows(db.from('enrollments').select('student_id,course_id').in('course_id',ids)) : []
      ]);
      const activityIds = activities.map(x=>x.id);
      const submissions = activityIds.length ? await rows(db.from('submissions').select('id,activity_id,student_id,content,submitted_at').in('activity_id',activityIds).order('submitted_at',{ascending:false})) : [];
      const studentIds = [...new Set(enrollments.map(x=>x.student_id))];
      const students = studentIds.length ? await rows(db.from('profiles').select('id,full_name').in('id',studentIds)) : [];
      const studentNames = Object.fromEntries(students.map(x=>[x.id,x.full_name]));
      counts = [['Cursos asignados',ids.length],['Alumnos',students.length],['Entregas recibidas',submissions.length]];
      content = section('Mis cursos y materias',assignments,(a)=>row(a.courses && a.courses.label || 'Curso',a.subjects && a.subjects.name || 'Materia asignada',''),'Dirección todavía no asignó cursos.') +
        section('Actividades',activities,(a)=>row(a.title,(a.subjects && a.subjects.name || 'Materia')+' · '+(a.courses && a.courses.label || 'Curso'),date(a.due_at)),'Todavía no hay actividades.') +
        section('Entregas recibidas',submissions,(s)=>row(s.content || 'Entrega sin texto','Actividad: '+(activities.find(a=>a.id===s.activity_id)?.title || 'Actividad')+' · Alumno: '+(studentNames[s.student_id] || 'Alumno/a'),date(s.submitted_at)),'Todavía no hay entregas.') +
        section('Alumnos en tus cursos',students,(s)=>row(s.full_name,'Alumno/a inscripto/a',''),'Todavía no hay alumnos inscritos.');
    } else if (role === 'direccion') {
      const [courses,news,conversations,messages,guardianLinks,accessRequests] = await Promise.all([
        rows(db.from('courses').select('id,label,school_year')),
        rows(db.from('announcements').select('id,title,published_at').order('published_at',{ascending:false})),
        rows(db.from('conversations').select('id,subject,parent_user_id,student_id,updated_at,created_at').order('created_at',{ascending:false})),
        rows(db.from('messages').select('id,conversation_id,sender_id,body,created_at').order('created_at')),
        rows(db.from('guardian_student_links').select('guardian_id')),
        getAccessRequests()
      ]);
      const guardianIds = [...new Set(guardianLinks.map(x=>x.guardian_id))];
      const guardians = guardianIds.length ? await rows(db.from('profiles').select('id,full_name').in('id',guardianIds)) : [];
      const guardianNames = Object.fromEntries(guardians.map(x=>[x.id,x.full_name]));
      const receipts = await markMessagesRead(messages,user);
      const profileCount = await db.from('profiles').select('id',{count:'exact',head:true});
      if (profileCount.error) throw profileCount.error;
      counts = [['Perfiles',profileCount.count || 0],['Cursos',courses.length],['Comunicados',news.length],['Conversaciones privadas',conversations.length]];
      content = accessRequestsPanel(accessRequests) +
        section('Cursos del colegio',courses,(c)=>row(c.label,'Año lectivo '+c.school_year,''),'Todavía no hay cursos.') +
        section('Comunicados recientes',news,(n)=>row(n.title,'Publicado para su audiencia',date(n.published_at)),'Todavía no hay comunicados.') +
        communicationPanel(conversations,messages,receipts,user,role,guardianNames) +
        newConversationBlock(user,role,[],guardians);
    }
    return {content,counts};
  }

  function enterStudentPreview(user) {
    const data = studentPreviewData();
    const profile = {full_name:'Vista de ejemplo'};
    root.innerHTML = '<div class="fc-preview-notice"><div><strong>Vista previa de alumno</strong><span>Estás viendo datos ficticios. No se modificó ninguna cuenta ni información real.</span></div></div>' + studentDashboardMarkup(profile,data,true);
    document.getElementById('fc-preview-exit').addEventListener('click', () => render(user));
    attachStudentNavigation();
    document.title = 'Vista previa de alumno — French Campus';
    window.scrollTo({top:0});
  }

  async function render(user) {
    const role = user.app_metadata && user.app_metadata.role;
    if (!roles[role]) { pending(user); return; }
    try {
      const profile = await profileFor(user);
      const data = await dashboardData(user,role);
      if (role === 'alumno') {
        root.innerHTML = studentDashboardMarkup(profile,data,false);
        document.getElementById('fc-logout').addEventListener('click',()=>db.auth.signOut());
        attachStudentNavigation();
        return;
      }
      const stats = data.counts.map(x=>'<div class="fc-stat"><strong>'+esc(x[1])+'</strong><span>'+esc(x[0])+'</span></div>').join('');
      const previewButton = role === 'direccion' ? '<button id="fc-student-preview" class="fc-secondary" type="button">Vista de alumno</button>' : '';
      root.innerHTML = '<main class="fc-dashboard"><header class="fc-top"><div class="fc-brand"><span class="fc-mark">F</span><div><strong>French Campus</strong><small>COLEGIO FRENCH</small></div></div><div class="fc-user"><div><strong>'+esc(profile.full_name || user.email)+'</strong><small>'+esc(roles[role])+'</small></div>'+previewButton+'<button id="fc-logout" class="fc-secondary">Salir</button></div></header><section class="fc-welcome"><div class="fc-kicker">CAMPUS VIRTUAL</div><h1>Hola, '+esc((profile.full_name || '¡bienvenido/a!').split(' ')[0])+'</h1><p>Este es tu espacio de actividad en el Colegio French.</p></section><section class="fc-stats">'+stats+'</section><div class="fc-content">'+data.content+'</div><footer class="fc-footer">French Campus · Información visible según los permisos de tu cuenta.</footer></main>';
      document.getElementById('fc-logout').addEventListener('click',()=>db.auth.signOut());
      const preview = document.getElementById('fc-student-preview');
      if (preview) preview.addEventListener('click', () => enterStudentPreview(user));
      if (window.FCGestion) window.FCGestion.mount(db,user,role,()=>render(user));
      attachCommunicationForms(user,role);
      if (role === 'direccion') attachAccessRequestActions(user);
    } catch (error) {
      root.innerHTML = '<main class="fc-screen"><section class="fc-card"><h1>No se pudo cargar el campus</h1><p class="fc-muted">'+esc(error.message || 'Error de conexión o permisos.')+'</p><button id="fc-retry" class="fc-primary">Volver a intentar</button><button id="fc-logout" class="fc-secondary">Cerrar sesión</button></section></main>';
      document.getElementById('fc-retry').addEventListener('click',()=>render(user));
      document.getElementById('fc-logout').addEventListener('click',()=>db.auth.signOut());
    }
  }

  db.auth.onAuthStateChange((event)=>{ if (event === 'SIGNED_OUT') login(''); });
  (async()=>{ const r = await db.auth.getSession(); if (r.error) login('No se pudo recuperar la sesión.'); else if (r.data.session) await render(r.data.session.user); else login(''); })();
})();