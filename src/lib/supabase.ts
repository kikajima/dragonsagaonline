const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://jxrsdacpywpnnpamgpbd.supabase.co';
const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_ZgUaQI6V4csnzsg__DCtUg_8XpaQQuH';

const SESSION_STORAGE_KEY = 'dso_supabase_session_v1';

export interface DsoAuthUser {
  id: string;
  email?: string;
}

export interface DsoSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: DsoAuthUser;
}

export interface CharacterRow {
  id: string;
  user_id: string;
  name: string;
  class_id: string;
  level: number;
  xp: number;
  hp: number;
  ki: number;
  gold: number;
  map_id: string;
  x: number;
  y: number;
  state: Record<string, unknown>;
  last_played_at: string | null;
  created_at: string;
  updated_at: string;
}

export type CharacterPayload = Omit<
  CharacterRow,
  'id' | 'created_at' | 'updated_at' | 'last_played_at'
> & {
  last_played_at: string;
};

type AuthPayload = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  expires_at?: number;
  user?: DsoAuthUser | null;
  message?: string;
  error?: string;
  error_description?: string;
};

let currentSession: DsoSession | null = null;

function authError(payload: AuthPayload, fallback: string): Error {
  return new Error(
    payload.error_description || payload.message || payload.error || fallback,
  );
}

function saveSession(session: DsoSession | null) {
  currentSession = session;
  if (typeof window === 'undefined') return;

  try {
    if (session) {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    // Keep the session in memory if browser storage is unavailable.
  }
}

function readStoredSession(): DsoSession | null {
  if (currentSession) return currentSession;
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as DsoSession;
    if (!parsed.access_token || !parsed.refresh_token || !parsed.user?.id) {
      return null;
    }

    currentSession = parsed;
    return parsed;
  } catch {
    return null;
  }
}

async function authFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('apikey', SUPABASE_PUBLISHABLE_KEY);
  headers.set('Content-Type', 'application/json');

  return fetch(`${SUPABASE_URL}/auth/v1${path}`, {
    ...init,
    headers,
  });
}

function sessionFromPayload(payload: AuthPayload): DsoSession | null {
  if (!payload.access_token || !payload.refresh_token || !payload.user?.id) {
    return null;
  }

  const expiresAt =
    payload.expires_at ||
    Math.floor(Date.now() / 1000) + (payload.expires_in || 3600);

  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_at: expiresAt,
    user: payload.user,
  };
}

async function refreshSession(
  session: DsoSession,
): Promise<DsoSession | null> {
  const response = await authFetch('/token?grant_type=refresh_token', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  const payload = (await response.json().catch(() => ({}))) as AuthPayload;

  if (!response.ok) {
    saveSession(null);
    return null;
  }

  const refreshed = sessionFromPayload(payload);
  saveSession(refreshed);
  return refreshed;
}

async function validateSession(
  session: DsoSession,
): Promise<DsoSession | null> {
  const now = Math.floor(Date.now() / 1000);
  let candidate = session;

  if (candidate.expires_at <= now + 60) {
    const refreshed = await refreshSession(candidate);
    if (!refreshed) return null;
    candidate = refreshed;
  }

  const response = await authFetch('/user', {
    headers: { Authorization: `Bearer ${candidate.access_token}` },
  });

  if (!response.ok) {
    const refreshed = await refreshSession(candidate);
    if (!refreshed) return null;
    candidate = refreshed;
  }

  const verified = await authFetch('/user', {
    headers: { Authorization: `Bearer ${candidate.access_token}` },
  });

  if (!verified.ok) {
    saveSession(null);
    return null;
  }

  const user = (await verified.json()) as DsoAuthUser;
  const validated = { ...candidate, user };
  saveSession(validated);
  return validated;
}

export async function restoreSession(): Promise<DsoSession | null> {
  const stored = readStoredSession();
  if (!stored) return null;
  return validateSession(stored);
}

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<DsoSession> {
  const response = await authFetch('/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const payload = (await response.json().catch(() => ({}))) as AuthPayload;

  if (!response.ok) {
    throw authError(payload, 'Não foi possível entrar.');
  }

  const session = sessionFromPayload(payload);
  if (!session) {
    throw new Error('O Supabase não retornou uma sessão válida.');
  }

  saveSession(session);
  return session;
}

export async function signUpWithPassword(
  email: string,
  password: string,
) {
  const response = await authFetch('/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const payload = (await response.json().catch(() => ({}))) as AuthPayload;

  if (!response.ok) {
    throw authError(payload, 'Não foi possível criar a conta.');
  }

  const session = sessionFromPayload(payload);
  if (session) saveSession(session);

  return {
    session,
    user: payload.user || null,
    requiresEmailConfirmation: !session,
  };
}

export async function signOut() {
  const session = readStoredSession();

  if (session) {
    await authFetch('/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    }).catch(() => undefined);
  }

  saveSession(null);
}

export async function getValidSession(): Promise<DsoSession> {
  return requireSession();
}

async function requireSession(): Promise<DsoSession> {
  const session = readStoredSession();
  if (!session) throw new Error('Você precisa entrar na sua conta.');

  const now = Math.floor(Date.now() / 1000);
  if (session.expires_at > now + 60) return session;

  const refreshed = await refreshSession(session);
  if (!refreshed) {
    throw new Error('Sua sessão expirou. Entre novamente.');
  }

  return refreshed;
}

async function dataFetch(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<Response> {
  const session = await requireSession();
  const headers = new Headers(init.headers);
  headers.set('apikey', SUPABASE_PUBLISHABLE_KEY);
  headers.set('Authorization', `Bearer ${session.access_token}`);
  headers.set('Content-Type', 'application/json');
  headers.set('Accept', 'application/json');

  const response = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...init,
    headers,
  });

  if (response.status === 401 && retry) {
    const refreshed = await refreshSession(session);
    if (refreshed) return dataFetch(path, init, false);
  }

  return response;
}

async function parseDataError(
  response: Response,
  fallback: string,
): Promise<never> {
  const payload = (await response.json().catch(() => ({}))) as {
    message?: string;
    details?: string;
    hint?: string;
    code?: string;
  };

  throw new Error(payload.message || payload.details || fallback);
}

export async function listCharacters(): Promise<CharacterRow[]> {
  const response = await dataFetch(
    '/characters?select=*&order=last_played_at.desc.nullslast,created_at.asc&limit=10',
  );

  if (!response.ok) {
    return parseDataError(
      response,
      'Não foi possível carregar os personagens.',
    );
  }

  return (await response.json()) as CharacterRow[];
}

export async function createCharacter(
  payload: CharacterPayload,
): Promise<CharacterRow> {
  const response = await dataFetch('/rpc/create_character_client', {
    method: 'POST',
    body: JSON.stringify({
      p_name: payload.name,
      p_class_id: payload.class_id,
    }),
  });

  if (!response.ok) {
    return parseDataError(
      response,
      'Não foi possível criar o personagem.',
    );
  }

  const result = (await response.json()) as CharacterRow | CharacterRow[];
  const row = Array.isArray(result) ? result[0] : result;
  if (!row?.id) {
    throw new Error('O personagem foi criado sem retorno do banco.');
  }

  return row;
}

export async function updateCharacter(
  id: string,
  payload: Partial<CharacterPayload>,
): Promise<CharacterRow> {
  const safePayload = {
    ...(typeof payload.hp === 'number' ? { hp: payload.hp } : {}),
    ...(typeof payload.ki === 'number' ? { ki: payload.ki } : {}),
    ...(typeof payload.map_id === 'string' ? { map_id: payload.map_id } : {}),
    ...(typeof payload.x === 'number' ? { x: payload.x } : {}),
    ...(typeof payload.y === 'number' ? { y: payload.y } : {}),
    ...(typeof payload.last_played_at === 'string'
      ? { last_played_at: payload.last_played_at }
      : {}),
  };

  const response = await dataFetch(
    `/characters?id=eq.${encodeURIComponent(id)}&select=*`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(safePayload),
    },
  );

  if (!response.ok) {
    return parseDataError(
      response,
      'Não foi possível salvar o personagem.',
    );
  }

  const rows = (await response.json()) as CharacterRow[];
  if (!rows[0]) {
    throw new Error('O personagem não foi encontrado para salvar.');
  }

  return rows[0];
}
