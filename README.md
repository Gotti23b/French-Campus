# French Campus

**Versión:** 0.0.4  
**Estado:** primera conexión con Supabase y paneles iniciales por rol

French Campus es una propuesta de campus virtual para el Colegio French.

## Secciones disponibles

- Inicio: panel principal del estudiante.
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

El acceso se conecta al proyecto Supabase French Campus. La web permite iniciar sesión y muestra información según el rol asignado en `app_metadata`. No hay registro público. La estructura de datos y las políticas RLS están creadas, pero la gestión completa (altas, carga de notas, publicación, corrección de entregas y mensajería avanzada) sigue en desarrollo. No cargar datos personales reales hasta que el colegio valide el sistema.

## Configuración administrativa

Consultá [docs/ADMIN_SETUP.md](docs/ADMIN_SETUP.md) para asignar roles, vincular familias y configurar cursos. La clave incluida en `supabase-config.js` es una clave publishable, diseñada para el navegador; nunca agregues claves secretas ni service_role.

## Ver la interfaz

Abrí `index.html` en un navegador. Si GitHub Pages está habilitado, también se puede publicar como sitio estático desde la configuración del repositorio.
