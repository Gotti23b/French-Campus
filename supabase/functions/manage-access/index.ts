import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

const allowedRoles = new Set(["alumno", "docente", "familia"]);
const validAssignedRoles = new Set(["direccion", "alumno", "docente", "familia"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);

  const authorization = request.headers.get("Authorization") || "";
  const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) return json({ error: "Sesión no válida." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "Falta configuración segura del servidor." }, 500);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(tokenMatch[1]);
  if (authError || !authData.user) return json({ error: "Sesión no válida." }, 401);

  const actor = authData.user;
  if (actor.app_metadata?.role !== "direccion") {
    return json({ error: "Solo Dirección puede administrar los accesos." }, 403);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body: { action?: string; userId?: string; role?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Solicitud inválida." }, 400);
  }

  if (body.action === "list") {
    const pendingUsers = [];
    for (let page = 1; page <= 100; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) return json({ error: "No se pudieron consultar las solicitudes." }, 500);
      const users = data.users || [];
      for (const user of users) {
        const role = user.app_metadata?.role;
        const status = user.app_metadata?.access_status;
        if (
          user.id !== actor.id &&
          !validAssignedRoles.has(role) &&
          status !== "rejected"
        ) {
          pendingUsers.push({
            id: user.id,
            email: user.email || "",
            created_at: user.created_at,
            full_name:
              user.user_metadata?.full_name ||
              user.user_metadata?.name ||
              (user.email ? user.email.split("@")[0] : "Cuenta nueva"),
          });
        }
      }
      if (users.length < 1000) break;
    }
    pendingUsers.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    return json({ requests: pendingUsers });
  }

  if (body.action !== "approve" && body.action !== "reject") {
    return json({ error: "Acción no reconocida." }, 400);
  }
  if (!body.userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.userId)) {
    return json({ error: "Cuenta seleccionada no válida." }, 400);
  }
  if (body.userId === actor.id) return json({ error: "No podés modificar tu propia cuenta desde esta sección." }, 400);
  if (body.action === "approve" && !allowedRoles.has(body.role || "")) {
    return json({ error: "Elegí un rol válido." }, 400);
  }

  const { data: targetData, error: targetError } = await admin.auth.admin.getUserById(body.userId);
  if (targetError || !targetData.user) return json({ error: "No se encontró esa cuenta." }, 404);
  const target = targetData.user;
  if (validAssignedRoles.has(target.app_metadata?.role)) {
    return json({ error: "Esa cuenta ya tiene un rol asignado." }, 409);
  }
  if (target.app_metadata?.access_status === "rejected" && body.action === "reject") {
    return json({ ok: true });
  }

  const nextMetadata = { ...(target.app_metadata || {}) };
  if (body.action === "approve") {
    nextMetadata.role = body.role;
    nextMetadata.access_status = "approved";
  } else {
    delete nextMetadata.role;
    nextMetadata.access_status = "rejected";
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(target.id, {
    app_metadata: nextMetadata,
  });
  if (updateError) return json({ error: "No se pudo actualizar el acceso." }, 500);

  return json({ ok: true, action: body.action, role: body.action === "approve" ? body.role : null });
});
