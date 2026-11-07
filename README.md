# French Campus

**Versión:** 0.0.9  
**Estado:** gestión académica de Dirección y herramientas docentes (gestion.js)

French Campus es una propuesta de campus virtual para el Colegio French.

## Secciones disponibles

- Inicio: panel principal del estudiante.
- Vista previa de alumno disponible para Dirección, con datos de demostración y sin cambiar el rol de la cuenta.
- Mis materias: tarjetas de materias.
- Actividades: listado visual de tareas.
- Calendario: vista mensual de ejemplo.
- Materiales: biblioteca organizada por materias.
- Mensajes: pantalla de demostración.
- Novedades: comunicados del colegio.
- Información: presentación del campus.

## Interfaz

La navegación entre secciones funciona en la misma página, sin recargar el sitio. Incluye menú lateral en escritorio, barra de navegación inferior en celulares y estilos adaptados para todas las secciones. El diseño se adapta a computadoras, tablets y teléfonos.

## Importante

El acceso se conecta al proyecto Supabase French Campus. La web permite iniciar sesión con correo y contraseña o mediante Google. Las cuentas sin rol autorizado ven la pantalla «Esperando confirmación de tu usuario». El rol se asigna de forma segura desde `app_metadata`; no hay registro público. La estructura de datos y las políticas RLS están creadas, pero la gestión completa (altas, carga de notas, publicación, corrección de entregas y mensajería avanzada) sigue en desarrollo. No cargar datos personales reales hasta que el colegio valide el sistema.

## Modelo de datos

Consultá [docs/DATABASE_MODEL.md](docs/DATABASE_MODEL.md) para conocer las tablas y los límites de acceso.

## Configuración administrativa

Consultá [docs/ADMIN_SETUP.md](docs/ADMIN_SETUP.md) para asignar roles, vincular familias y configurar cursos. La clave incluida en `supabase-config.js` es una clave publishable, diseñada para el navegador; nunca agregues claves secretas ni service_role.

## Ver la interfaz

Abrí `index.html` en un navegador. Si GitHub Pages está habilitado, también se puede publicar como sitio estático desde la configuración del repositorio.
