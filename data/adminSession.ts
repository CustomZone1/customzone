import { LS_ADMIN_SESSION_KEY } from "./constants";

type AdminSession = {
  isAdmin: true;
  createdAt: string;
};

export function setAdminSession() {
  const session: AdminSession = { isAdmin: true, createdAt: new Date().toISOString() };
  localStorage.setItem(LS_ADMIN_SESSION_KEY, JSON.stringify(session));
}

export function clearAdminSession() {
  localStorage.removeItem(LS_ADMIN_SESSION_KEY);
}

export function hasAdminSession(): boolean {
  try {
    const raw = localStorage.getItem(LS_ADMIN_SESSION_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Partial<AdminSession>;
    return parsed.isAdmin === true;
  } catch {
    return false;
  }
}
