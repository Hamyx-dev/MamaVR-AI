import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function respond(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return respond({ error: 'Method not allowed.' }, 405);

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return respond({ error: 'Authentication required.' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return respond({ error: 'Server authentication is not configured.' }, 500);
  }

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: callerResult, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !callerResult.user) return respond({ error: 'Your session is invalid.' }, 401);

  const { data: callerProfile, error: profileError } = await serviceClient
    .from('profiles')
    .select('role,status')
    .eq('id', callerResult.user.id)
    .single();
  if (profileError || callerProfile?.role !== 'admin' || callerProfile?.status !== 'active') {
    return respond({ error: 'Administrator access is required.' }, 403);
  }

  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return respond({ error: 'Invalid JSON request.' }, 400);
  }

  if (input.action === 'create') {
    const email = String(input.email ?? '').trim().toLowerCase();
    const password = String(input.password ?? '');
    const username = String(input.username ?? '').trim();
    const fullName = String(input.full_name ?? '').trim();
    const role = input.role;
    if (!email || !password || !username || !fullName || !['admin', 'healthcare_worker'].includes(String(role))) {
      return respond({ error: 'Required account details are missing or invalid.' }, 400);
    }

    const { data: created, error: createError } = await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username, full_name: fullName },
    });
    if (createError || !created.user) return respond({ error: createError?.message ?? 'Unable to create account.' }, 400);

    const profile = {
      id: created.user.id,
      username,
      email,
      full_name: fullName,
      role,
      status: 'active',
      facility_id: input.facility_id ?? null,
      avatar_uri: null,
    };
    const { data, error } = await serviceClient.from('profiles').upsert(profile).select().single();
    if (error) {
      await serviceClient.auth.admin.deleteUser(created.user.id);
      return respond({ error: error.message }, 400);
    }
    return respond({ profile: data });
  }

  if (input.action === 'status') {
    const userId = String(input.user_id ?? '');
    const status = input.status;
    if (!userId || userId === callerResult.user.id || !['active', 'suspended'].includes(String(status))) {
      return respond({ error: 'Invalid account status change.' }, 400);
    }
    const { error } = await serviceClient.from('profiles').update({ status }).eq('id', userId);
    return error ? respond({ error: error.message }, 400) : respond({ ok: true });
  }

  if (input.action === 'reset_password') {
    const userId = String(input.user_id ?? '');
    const password = String(input.password ?? '');
    if (!userId || !password) return respond({ error: 'User ID and password are required.' }, 400);
    const { error } = await serviceClient.auth.admin.updateUserById(userId, { password });
    return error ? respond({ error: error.message }, 400) : respond({ ok: true });
  }

  if (input.action === 'avatar') {
    const userId = String(input.user_id ?? '');
    const avatarUri = input.avatar_uri;
    if (!userId || (avatarUri !== null && typeof avatarUri !== 'string')) {
      return respond({ error: 'User ID and avatar URL are required.' }, 400);
    }
    const { error } = await serviceClient
      .from('profiles')
      .update({ avatar_uri: avatarUri })
      .eq('id', userId);
    return error ? respond({ error: error.message }, 400) : respond({ ok: true });
  }

  return respond({ error: 'Unknown action.' }, 400);
});
