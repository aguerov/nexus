export type ConnectionProfile = { mode: "local" | "lan"; endpoint: string; domain: string; user: string };

export const defaultProfile: ConnectionProfile = {
  mode: "local",
  endpoint: "http://127.0.0.1:8008",
  domain: "nexus.local",
  user: "",
};

const storageKey = "nexus.connection";

export function readConnection(): ConnectionProfile {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    if (saved && (saved.mode === "local" || saved.mode === "lan") &&
        [saved.endpoint, saved.domain, saved.user].every((value) => typeof value === "string")) {
      return saved;
    }
  } catch {
    // Se puede iniciar sesión aunque el perfil local no esté disponible.
  }
  return defaultProfile;
}

export function saveConnection(profile: ConnectionProfile) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(profile));
  } catch {
    // La sesión actual funciona sin almacenamiento local.
  }
}

export function validateConnection(profile: ConnectionProfile): string {
  const input = profile.endpoint.trim();
  const authority = /^https?:\/\/([a-z0-9.]+)(?::\d{1,5})?\/?$/i.exec(input);
  if (!authority) throw new Error("Introduce una URL HTTP o HTTPS con dirección y puerto.");
  const url = new URL(input);
  const host = authority[1].toLowerCase();
  const [a, b] = host.split(".").map(Number);
  const isLoopback = host === "localhost" || host === "127.0.0.1";
  const isPrivate = host === url.hostname && /^\d+\.\d+\.\d+\.\d+$/.test(host) &&
    (a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31));
  if (profile.mode === "local" ? !isLoopback : !isPrivate) {
    throw new Error(profile.mode === "local" ? "Usa localhost o 127.0.0.1." : "Usa la IPv4 privada del servidor.");
  }
  if (url.port === "0") throw new Error("El puerto debe estar entre 1 y 65535.");
  if (!/^[a-z\d](?:[a-z\d.-]*[a-z\d])?$/i.test(profile.domain.trim())) {
    throw new Error("Introduce el dominio Matrix indicado por el administrador.");
  }
  return url.origin;
}
