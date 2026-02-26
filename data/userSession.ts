export type AuthUser = {
  id: string;
  username: string;
  createdAt?: string;
};

const SESSION_KEY = "cz_user_session_v1";
const SESSION_EVENT = "cz_user_session_changed";

function dispatchSessionChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SESSION_EVENT));
}

export function getUserSession(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthUser> | null;
    if (!parsed || !parsed.id || !parsed.username) return null;
    return {
      id: String(parsed.id),
      username: String(parsed.username),
      createdAt: parsed.createdAt ? String(parsed.createdAt) : undefined,
    };
  } catch {
    return null;
  }
}

export function setUserSession(user: AuthUser) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    SESSION_KEY,
    JSON.stringify({
      id: user.id,
      username: user.username,
      createdAt: user.createdAt,
    })
  );
  dispatchSessionChange();
}

export function clearUserSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_KEY);
  dispatchSessionChange();
}

export function hasUserSession() {
  return Boolean(getUserSession());
}

export function onUserSessionChange(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;

  const onStorage = (event: StorageEvent) => {
    if (event.key === SESSION_KEY) {
      listener();
    }
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener(SESSION_EVENT, listener);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(SESSION_EVENT, listener);
  };
}
