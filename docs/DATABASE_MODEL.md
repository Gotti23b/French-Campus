# Modelo de datos de French Campus

La base de datos PostgreSQL del proyecto Supabase `wrjmnqdjbaskmmrindhw` contiene estas tablas:

| Tabla | Uso |
|---|---|
| `profiles` | Perfil vinculado a una cuenta de Supabase Auth |
| `subjects` | Materias |
| `courses` | Cursos, año lectivo y división |
| `course_subjects` | Materias que corresponden a cada curso |
| `teacher_assignments` | Docentes asignados a cursos y materias |
| `enrollments` | Alumnos inscriptos en cursos |
| `guardian_student_links` | Relación entre padres/tutores y uno o varios hijos |
| `grades` | Calificaciones académicas |
| `activities` | Actividades y trabajos |
| `submissions` | Entregas de alumnos |
| `submission_reviews` | Devoluciones y calificaciones de docentes |
| `materials` | Materiales de estudio |
| `announcements` | Comunicados con audiencia general, alumnos, familias o cursos |
| `conversations` | Conversaciones privadas de cada familia con Dirección |
| `messages` | Mensajes dentro de esas conversaciones |
| `message_reads` | Registro de lectura de cada mensaje |

## Reglas de acceso

- Las cuatro categorías de cuenta se asignan mediante `app_metadata.role`: `direccion`, `alumno`, `familia` y `docente`.
- Dirección administra la estructura académica y puede consultar las conversaciones de las familias.
- Un alumno solo puede consultar sus calificaciones y los contenidos de sus cursos.
- Una familia solo puede consultar los datos de los hijos vinculados explícitamente a su cuenta. Puede tener más de un hijo.
- Una conversación familiar solo es visible para esa familia y Dirección. Los mensajes y sus lecturas respetan la misma separación.
- Un docente solo accede a cursos, actividades y entregas correspondientes a sus asignaciones.

## Protección de la API

- RLS está habilitado en las 16 tablas.
- No hay permisos de lectura para `anon`.
- Las tablas requieren una sesión autenticada y además aplican políticas por usuario/rol.
- La aplicación usa una clave publishable. No se incluyó ninguna clave secreta ni `service_role` en el repositorio.
- Los privilegios predeterminados para tablas futuras revocan acceso anónimo; toda tabla nueva debe recibir sus grants y políticas RLS explícitamente.

## Estado

El esquema está creado y verificado. El frontend permite iniciar sesión, consultar paneles iniciales según el rol y mantener conversaciones privadas entre familias y Dirección. La gestión académica completa (altas, edición de cursos, carga de calificaciones, actividades, materiales y corrección de entregas) todavía necesita pantallas específicas.
