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

  function login(message) {
    root.innerHTML = '<main class="fc-screen"><section class="fc-login"><div class="fc-brand"><span class="fc-mark">F</span><div><strong>French Campus</strong><small>COLEGIO FRENCH</small></div></div><div class="fc-kicker">TU ESPACIO ESCOLAR</div><h1>¡Qué bueno verte!</h1><p class="fc-muted">Ingresá con la cuenta que te proporcionó el colegio.</p><form id="fc-login-form" class="fc-form"><label for="fc-email">Correo electrónico</label><input id="fc-email" name="email" type="email" autocomplete="username" required placeholder="Tu correo"><label for="fc-password">Contraseña</label><input id="fc-password" name="password" type="password" autocomplete="current-password" required placeholder="Tu contraseña"><button class="fc-primary" type="submit">Iniciar sesión</button><p class="fc-message" id="fc-message" role="status">' + esc(message || '') + '</p></form><p class="fc-footnote">Las cuentas son habilitadas por el colegio. No hay registro público.</p></section></main>';
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
    root.innerHTML = '<main class="fc-screen"><section class="fc-card fc-pending"><div class="fc-brand"><span class="fc-mark">F</span><div><strong>French Campus</strong><small>COLEGIO FRENCH</small></div></div><div class="fc-pending-icon">⌛</div><h1>Tu cuenta todavía no está habilitada</h1><p class="fc-muted">La cuenta <strong>' + esc(user.email) + '</strong> inició sesión, pero Dirección todavía debe asignarle un rol.</p><p class="fc-footnote">Pedile a Dirección que habilite tu perfil. El rol no se puede elegir desde esta pantalla.</p><button id="fc-logout" class="fc-secondary">Cerrar sesión</button></section></main>';
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
      const [children,grades,news,conversations] = await Promise.all([
        ids.length ? rows(db.from('profiles').select('id,full_name').in('id',ids)) : [],
        ids.length ? rows(db.from('grades').select('id,student_id,title,score,max_score,recorded_at,subjects(name)').in('student_id',ids).order('recorded_at',{ascending:false})) : [],
        rows(db.from('announcements').select('id,title,body,published_at').order('published_at',{ascending:false})),
        rows(db.from('conversations').select('id,subject,updated_at').order('updated_at',{ascending:false}))
      ]);
      const names = Object.fromEntries(children.map(x=>[x.id,x.full_name]));
      counts = [['Hijos vinculados',children.length],['Calificaciones',grades.length],['Conversaciones',conversations.length]];
      content = section('Mis hijos',children,(c)=>row(c.full_name,'Alumno/a vinculado/a al grupo familiar',''),'Dirección todavía no vinculó alumnos.') +
        section('Calificaciones',grades,(g)=>row((names[g.student_id] || 'Alumno/a')+' · '+(g.subjects && g.subjects.name || 'Materia'),g.title+' · '+g.score+' / '+g.max_score,date(g.recorded_at)),'Todavía no hay calificaciones.') +
        section('Comunicaciones de Dirección',conversations,(c)=>row(c.subject,'Conversación privada con Dirección',date(c.updated_at)),'Todavía no hay conversaciones.') +
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
      counts = [['Cursos asignados',ids.length],['Actividades',activities.length],['Entregas recibidas',submissions.length]];
      content = section('Mis cursos y materias',assignments,(a)=>row(a.courses && a.courses.label || 'Curso',a.subjects && a.subjects.name || 'Materia asignada',''),'Dirección todavía no asignó cursos.') +
        section('Actividades',activities,(a)=>row(a.title,(a.subjects && a.subjects.name || 'Materia')+' · '+(a.courses && a.courses.label || 'Curso'),date(a.due_at)),'Todavía no hay actividades.') +
        section('Entregas recibidas',submissions,(s)=>row(s.content || 'Entrega sin texto','Actividad: '+(activities.find(a=>a.id===s.activity_id)?.title || 'Actividad'),'Alumno: '+s.student_id.slice(0,8)+'…'),date(s.submitted_at)),'Todavía no hay entregas.') +
        section('Alumnos en tus cursos',enrollments.map(x=>({student_id:x.student_id,course_id:x.course_id})),(e)=>row('Alumno/a', 'Curso asignado',e.student_id.slice(0,8)+'…'),'Todavía no hay alumnos inscritos.');
    } else if (role === 'direccion') {
      const [profileCount,courses,news,conversations] = await Promise.all([
        db.from('profiles').select('id',{count:'exact',head:true}),
        rows(db.from('courses').select('id,label,school_year')),
        rows(db.from('announcements').select('id,title,published_at').order('published_at',{ascending:false})),
        rows(db.from('conversations').select('id,subject,updated_at').order('updated_at',{ascending:false}))
      ]);
      if (profileCount.error) throw profileCount.error;
      counts = [['Perfiles',profileCount.count || 0],['Cursos',courses.length],['Comunicados',news.length],['Conversaciones privadas',conversations.length]];
      content = section('Cursos del colegio',courses,(c)=>row(c.label,'Año lectivo '+c.school_year,''),'Todavía no hay cursos.') +
        section('Comunicados recientes',news,(n)=>row(n.title,'Publicado para su audiencia',date(n.published_at)),'Todavía no hay comunicados.') +
        section('Bandeja de familias',conversations,(c)=>row(c.subject,'Conversación privada con una familia',date(c.updated_at)),'Todavía no hay conversaciones.');
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
    } catch (error) {
      root.innerHTML = '<main class="fc-screen"><section class="fc-card"><h1>No se pudo cargar el campus</h1><p class="fc-muted">'+esc(error.message || 'Error de conexión o permisos.')+'</p><button id="fc-retry" class="fc-primary">Volver a intentar</button><button id="fc-logout" class="fc-secondary">Cerrar sesión</button></section></main>';
      document.getElementById('fc-retry').addEventListener('click',()=>render(user));
      document.getElementById('fc-logout').addEventListener('click',()=>db.auth.signOut());
    }
  }

  db.auth.onAuthStateChange((event)=>{ if (event === 'SIGNED_OUT') login(''); });
  (async()=>{ const r = await db.auth.getSession(); if (r.error) login('No se pudo recuperar la sesión.'); else if (r.data.session) await render(r.data.session.user); else login(''); })();
})();