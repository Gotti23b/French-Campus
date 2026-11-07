/* French Campus · Gestión académica (Dirección y Docentes)
   Se carga antes de app.js y se monta desde render(). Todo respeta RLS:
   si una política no permite la operación, se muestra el error de Supabase. */
(() => {
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const rows = async (q) => { const r = await q; if (r.error) throw r.error; return r.data || []; };
  const sel = (n, label, items, opt) => ({ n, label, t: 'select', items, opt });
  const txt = (n, label, opt, t) => ({ n, label, t: t || 'text', opt });
  const names = (list) => list.map((p) => ({ v: p.id, l: p.full_name || p.id.slice(0, 8) }));

  function fieldHtml(f) {
    const req = f.opt ? '' : ' required';
    if (f.t === 'select') {
      return '<label>' + esc(f.label) + '</label><select name="' + f.n + '"' + req + '><option value="">Elegí…</option>' +
        f.items.map((i) => '<option value="' + esc(i.v) + '">' + esc(i.l) + '</option>').join('') + '</select>';
    }
    if (f.t === 'textarea') return '<label>' + esc(f.label) + '</label><textarea name="' + f.n + '" rows="3" maxlength="5000"' + req + '></textarea>';
    return '<label>' + esc(f.label) + '</label><input name="' + f.n + '" type="' + f.t + '"' + (f.def != null ? ' value="' + esc(f.def) + '"' : '') + (f.t === 'number' ? ' step="any"' : '') + ' maxlength="300"' + req + '>';
  }

  function formHtml(form, i) {
    return '<form class="fc-new-conversation fc-gestion-form" data-i="' + i + '"><h3>' + esc(form.title) + '</h3>' +
      form.fields.map(fieldHtml).join('') +
      '<button class="fc-primary" type="submit">Guardar</button><small class="fc-form-status" aria-live="polite"></small></form>';
  }

  function directionForms(s) {
    const year = new Date().getFullYear();
    return [
      { title: 'Nueva materia', table: 'subjects', fields: [txt('name', 'Nombre de la materia')] },
      { title: 'Nuevo curso', table: 'courses', fields: [txt('label', 'Curso (ej. 1.º A)'), txt('school_year', 'Año lectivo', false, 'number')].map((f) => f.n === 'school_year' ? { ...f, def: year } : f) },
      { title: 'Materia en un curso', table: 'course_subjects', fields: [sel('course_id', 'Curso', s.courses), sel('subject_id', 'Materia', s.subjects)] },
      { title: 'Inscribir alumno en un curso', table: 'enrollments', fields: [sel('student_id', 'Alumno/a', s.people), sel('course_id', 'Curso', s.courses)] },
      { title: 'Asignar docente', table: 'teacher_assignments', fields: [sel('teacher_id', 'Docente', s.people), sel('course_id', 'Curso', s.courses), sel('subject_id', 'Materia', s.subjects)] },
      { title: 'Vincular familia con alumno', table: 'guardian_student_links', fields: [sel('guardian_id', 'Familia (tutor)', s.people), sel('student_id', 'Alumno/a', s.people), txt('relationship', 'Vínculo (opcional)', true)] },
      { title: 'Publicar comunicado', table: 'announcements', fields: [txt('title', 'Título'), txt('body', 'Mensaje', false, 'textarea')] }
    ];
  }

  function teacherForms(s) {
    const split = (v) => v.split('|');
    return [
      { title: 'Nueva actividad', table: 'activities',
        fields: [sel('pair', 'Curso y materia', s.pairs), txt('title', 'Título'), txt('description', 'Consigna', true, 'textarea'), txt('due_at', 'Fecha de entrega', true, 'datetime-local')],
        map: (v) => { const [course_id, subject_id] = split(v.pair); return { course_id, subject_id, title: v.title, description: v.description, due_at: v.due_at ? new Date(v.due_at).toISOString() : null, published: true }; } },
      { title: 'Cargar calificación', table: 'grades',
        fields: [sel('pair', 'Curso y materia', s.pairs), sel('student_id', 'Alumno/a', s.people), txt('title', 'Concepto (ej. Trabajo práctico 1)'), txt('score', 'Nota', false, 'number'), txt('max_score', 'Nota máxima', false, 'number')].map((f) => f.n === 'max_score' ? { ...f, def: 10 } : f),
        map: (v) => ({ subject_id: split(v.pair)[1], student_id: v.student_id, title: v.title, score: Number(v.score), max_score: Number(v.max_score) }) }
    ];
  }

  async function sources(db, user, role) {
    if (role === 'direccion') {
      const [subjects, courses, people] = await Promise.all([
        rows(db.from('subjects').select('id,name').order('name')),
        rows(db.from('courses').select('id,label').order('label')),
        rows(db.from('profiles').select('id,full_name').order('full_name'))
      ]);
      return { subjects: subjects.map((x) => ({ v: x.id, l: x.name })), courses: courses.map((x) => ({ v: x.id, l: x.label })), people: names(people) };
    }
    const asg = await rows(db.from('teacher_assignments').select('course_id,subject_id,courses(label),subjects(name)').eq('teacher_id', user.id));
    const courseIds = [...new Set(asg.map((a) => a.course_id))];
    const enr = courseIds.length ? await rows(db.from('enrollments').select('student_id').in('course_id', courseIds)) : [];
    const ids = [...new Set(enr.map((e) => e.student_id))];
    const people = ids.length ? await rows(db.from('profiles').select('id,full_name').in('id', ids)) : [];
    return {
      pairs: asg.map((a) => ({ v: a.course_id + '|' + a.subject_id, l: ((a.courses && a.courses.label) || 'Curso') + ' · ' + ((a.subjects && a.subjects.name) || 'Materia') })),
      people: names(people)
    };
  }

  async function mount(db, user, role, onDone) {
    const host = document.querySelector('.fc-content');
    if (!host || (role !== 'direccion' && role !== 'docente')) return;
    const box = document.createElement('section');
    box.className = 'fc-panel fc-gestion';
    host.prepend(box);
    const draw = async () => {
      try {
        const s = await sources(db, user, role);
        const forms = role === 'direccion' ? directionForms(s) : teacherForms(s);
        const intro = role === 'direccion'
          ? 'Armá la estructura del colegio de arriba hacia abajo: materias, cursos, inscripciones y docentes.'
          : (s.pairs.length ? 'Publicá actividades y cargá calificaciones de tus cursos.' : 'Dirección todavía no te asignó cursos y materias.');
        box.innerHTML = '<div class="fc-panel-head"><h2>' + (role === 'direccion' ? 'Gestión académica' : 'Herramientas docentes') + '</h2></div><p class="fc-muted">' + intro + '</p>' +
          (role === 'docente' && !s.pairs.length ? '' : '<div class="fc-gestion-grid">' + forms.map(formHtml).join('') + '</div>');
        box.querySelectorAll('.fc-gestion-form').forEach((el) => el.addEventListener('submit', async (e) => {
          e.preventDefault();
          const form = forms[Number(el.dataset.i)];
          const status = el.querySelector('.fc-form-status');
          const btn = el.querySelector('button');
          const v = Object.fromEntries([...new FormData(el)].map(([k, x]) => [k, String(x).trim()]));
          const row = form.map ? form.map(v) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, x === '' ? null : (form.fields.find((f) => f.n === k).t === 'number' ? Number(x) : x)]));
          btn.disabled = true; status.textContent = 'Guardando…';
          const r = await db.from(form.table).insert(row);
          if (r.error) { status.textContent = 'No se pudo guardar: ' + r.error.message; btn.disabled = false; return; }
          if (onDone) await onDone(); else await draw();
        }));
      } catch (err) {
        box.innerHTML = '<p class="fc-empty">No se pudo cargar la gestión: ' + esc(err.message || err) + '</p>';
      }
    };
    await draw();
  }

  window.FCGestion = { mount };
})();
