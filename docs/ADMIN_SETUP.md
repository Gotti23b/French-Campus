# Administración de French Campus

## Roles admitidos

Los valores exactos en `auth.users.raw_app_meta_data.role` son:

- `direccion`: Dirección (directora y director usan el mismo rol, con cuentas separadas).
- `alumno`: alumnos.
- `familia`: padres, madres y tutores.
- `docente`: docentes.

**No asignar roles desde `user_metadata` ni desde un formulario público.** La base de datos autoriza usando `app_metadata`, que debe modificar un administrador de confianza desde Supabase Auth Admin o el panel administrativo.

## Alta inicial de una cuenta

1. Crear o invitar la cuenta desde Supabase Authentication.
2. Asignar el rol correcto en los metadatos privados de la cuenta (`app_metadata`), por ejemplo:

```json
{ "role": "alumno" }
```

3. Pedir a la persona que vuelva a iniciar sesión para recibir un JWT actualizado.
4. Al ingresar, el campus crea su fila de perfil personal si todavía no existe.

No habilitar el registro público para estudiantes/familias sin aprobación del colegio.

## Vincular padres o tutores con sus hijos

Desde una cuenta de Dirección, crear una fila en `public.guardian_student_links` por cada vínculo:

- `guardian_id`: UUID de la cuenta familiar.
- `student_id`: UUID de la cuenta del alumno.
- `relationship`: vínculo opcional.

Una misma cuenta familiar puede tener varias filas, una por cada hijo. No compartir cuentas entre familias.

## Configuración académica

1. Crear materias en `subjects`.
2. Crear cursos en `courses` (año lectivo, año/grado y división).
3. Vincular materias a cursos en `course_subjects`.
4. Inscribir alumnos en `enrollments`.
5. Asignar docentes a cursos y materias en `teacher_assignments`.

## Seguridad

- Todas las tablas de `public` tienen RLS habilitado.
- No se concede acceso a `anon`; se requiere iniciar sesión.
- La web usa solamente una clave publishable. Nunca poner claves secretas o `service_role` en el navegador.
- Las conversaciones de familias están aisladas por cuenta: solo esa familia y Dirección pueden leerlas.
- Los alumnos ven sus propias calificaciones; las familias ven las de sus hijos vinculados.
- Los docentes acceden a cursos y entregas que tienen asignados.

## Límites actuales

La web permite iniciar sesión y consultar datos reales según el rol. La gestión completa de usuarios, carga de notas, publicación de actividades, corrección de entregas, adjuntos y respuestas avanzadas todavía requiere pantallas específicas. No cargar datos personales reales hasta que el colegio valide el sistema y su administración.
