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
    root.innerHTML = '<main class="fc-screen"><section class="fc-card fc-pending"><div class="fc-brand"><span class="fc-mark">F</span><div><strong>French Campus</strong><small>COLEGIO FRENCH</small></div></div><div class="fc-pending-icon">⌛</div><h1>Esperando confirmación de tu usuario</h1><p class="fc-muted">La cuenta <strong>' + esc(user.email) + '</strong> inició sesión correctamente, pero todavía necesita la aprobación de Dirección.</p><p class="fc-footnote">Cuando tu cuenta sea autorizada, vas a poder ingresar al panel que corresponda. No hace falta volver a registrarte.</p><button id="fc-logout" class="fc-secondary">Cerrar sesión</button></section></main>';
    document.getElementById('fc-logout').addEventListener('click', () => db.auth.signOut());
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
      counts = [['Calificaciones',grades.length],['Actividades',activities.length],['Materiales',materials.length]];
      content = section('Mis calificaciones',grades,(g)=>row((g.subjects && g.subjects.name || 'Materia')+' · '+g.title,'Calificación: '+g.score+' / '+g.max_score,date(g.recorded_at)),'Todavía no hay calificaciones.') +
        section('Actividades',activities,(a)=>row(a.title,(a.subjects && a.subjects.name || 'Materia')+' · '+(a.courses && a.courses.label || 'Curso')+' · '+(a.description || ''),date(a.due_at)),'No hay actividades publicadas.') +
        section('Materiales',materials,(m)=>row(m.title,(m.subjects && m.subjects.name || 'Materia')+' · '+(m.courses && m.courses.label || 'Curso'),date(m.created_at)),'No hay materiales publicados.') +
        section('Novedades',news,(n)=>row(n.title,n.body,date(n.published_at)),'No hay comunicados nuevos.');
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
      const [courses,news,conversations,messages,guardianLinks] = await Promise.all([
        rows(db.from('courses').select('id,label,school_year')),
        rows(db.from('announcements').select('id,title,published_at').order('published_at',{ascending:false})),
        rows(db.from('conversations').select('id,subject,parent_user_id,student_id,updated_at,created_at').order('created_at',{ascending:false})),
        rows(db.from('messages').select('id,conversation_id,sender_id,body,created_at').order('created_at')),
        rows(db.from('guardian_student_links').select('guardian_id'))
      ]);
      const guardianIds = [...new Set(guardianLinks.map(x=>x.guardian_id))];
      const guardians = guardianIds.length ? await rows(db.from('profiles').select('id,full_name').in('id',guardianIds)) : [];
      const guardianNames = Object.fromEntries(guardians.map(x=>[x.id,x.full_name]));
      const receipts = await markMessagesRead(messages,user);
      const profileCount = await db.from('profiles').select('id',{count:'exact',head:true});
      if (profileCount.error) throw profileCount.error;
      counts = [['Perfiles',profileCount.count || 0],['Cursos',courses.length],['Comunicados',news.length],['Conversaciones privadas',conversations.length]];
      content = section('Cursos del colegio',courses,(c)=>row(c.label,'Año lectivo '+c.school_year,''),'Todavía no hay cursos.') +
        section('Comunicados recientes',news,(n)=>row(n.title,'Publicado para su audiencia',date(n.published_at)),'Todavía no hay comunicados.') +
        communicationPanel(conversations,messages,receipts,user,role,guardianNames) +
        newConversationBlock(user,role,[],guardians);
    }
    return {content,counts};
  }

  async function render(user) {
    const role = user.app_metadata && user.app_metadata.role;
    if (!roles[role]) { pending(user); return; }
    try {
      const profile = await profileFor(user);
      const data = await dashboardData(user,role);
      const stats = data.counts.map(x=>'<div class="fc-stat"><strong>'+esc(x[1])+'</strong><span>'+esc(x[0])+'</span></div>').join('');
      root.innerHTML = '<main class="fc-dashboard"><header class="fc-top"><div class="fc-brand"><span class="fc-mark">F</span><div><strong>French Campus</strong><small>COLEGIO FRENCH</small></div></div><div class="fc-user"><div><strong>'+esc(profile.full_name || user.email)+'</strong><small>'+esc(roles[role])+'</small></div><button id="fc-logout" class="fc-secondary">Salir</button></div></header><section class="fc-welcome"><div class="fc-kicker">CAMPUS VIRTUAL</div><h1>Hola, '+esc((profile.full_name || '¡bienvenido/a!').split(' ')[0])+'</h1><p>Este es tu espacio de actividad en el Colegio French.</p></section><section class="fc-stats">'+stats+'</section><div class="fc-content">'+data.content+'</div><footer class="fc-footer">French Campus · Información visible según los permisos de tu cuenta.</footer></main>';
      document.getElementById('fc-logout').addEventListener('click',()=>db.auth.signOut());
      attachCommunicationForms(user,role);
    } catch (error) {
      root.innerHTML = '<main class="fc-screen"><section class="fc-card"><h1>No se pudo cargar el campus</h1><p class="fc-muted">'+esc(error.message || 'Error de conexión o permisos.')+'</p><button id="fc-retry" class="fc-primary">Volver a intentar</button><button id="fc-logout" class="fc-secondary">Cerrar sesión</button></section></main>';
      document.getElementById('fc-retry').addEventListener('click',()=>render(user));
      document.getElementById('fc-logout').addEventListener('click',()=>db.auth.signOut());
    }
  }

  db.auth.onAuthStateChange((event)=>{ if (event === 'SIGNED_OUT') login(''); });
  (async()=>{ const r = await db.auth.getSession(); if (r.error) login('No se pudo recuperar la sesión.'); else if (r.data.session) await render(r.data.session.user); else login(''); })();
})();