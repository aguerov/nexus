// Cliente Matrix basado en matrix-js-sdk.
// IMPORTANTE: para ejecución sin Internet, las dependencias deben estar vendorizadas/empaquetadas en el instalador.
// Este módulo es la base para mensajería real; E2EE/crypto-store seguro y verificación de dispositivos
// deben endurecerse (ver docs/05-riesgos-seguridad.md) antes de uso en producción.

import * as sdk from "matrix-js-sdk";

export type MessageKind = "text" | "image" | "file" | "audio";

export type AttachmentInfo = {
  mimetype?: string;
  size?: number;
  w?: number;
  h?: number;
  /** Duración en milisegundos (mensajes de audio). */
  duration?: number;
};

export type MatrixMessage = {
  eventId: string;
  roomId: string;
  sender: string;
  kind: MessageKind;
  /** Texto del mensaje o nombre del archivo. */
  body: string;
  ts: number;
  /** URL HTTP del contenido (descarga directa legacy de Matrix). */
  url?: string;
  /** URL de miniatura para imágenes. */
  thumbUrl?: string;
  info?: AttachmentInfo;
  /** SHA-256 calculado en el cliente al adjuntar (integridad). */
  sha256?: string;
};

export type RoomAccess = "reader" | "member" | "moderator";
const accessLevels: Record<RoomAccess, number> = { reader: 0, member: 10, moderator: 50 };
export type Presence = "online" | "offline" | "unavailable" | "unknown";
export type Contact = { userId: string; name: string };
export type RoomMember = Contact & { access: RoomAccess; invited: boolean; owner: boolean };

export type RoomSummary = {
  roomId: string;
  name: string;
  isDirect: boolean;
  peerId?: string;
  memberCount: number;
  lastTs: number;
  /** `invite` = sala a la que te han invitado y todavía no te has unido. */
  membership: "join" | "invite";
  /** Mensajes ajenos desde la última vez que abriste la sala (0 = leída). */
  unread: number;
  roleGroup?: string;
  canWrite: boolean;
  canManage: boolean;
};

export type AttachmentOptions = {
  kind?: Exclude<MessageKind, "text">;
  /** Duración en ms (notas de voz). */
  duration?: number;
};

export type MatrixClient = {
  login: (user: string, password: string) => Promise<void>;
  start: () => Promise<void>;
  stop: () => void;
  logout: () => Promise<void>;
  isAdministrator: () => Promise<boolean>;
  joinRoom: (roomId: string) => Promise<void>;
  createDirectRoom: (mxid: string) => Promise<string>;
  createGroupRoom: (name: string, mxids: string[], roleGroup?: string) => Promise<string>;
  setRoomAccess: (roomId: string, mxid: string, access: RoomAccess) => Promise<void>;
  removeRoomAccess: (roomId: string, mxid: string) => Promise<void>;
  invite: (roomId: string, mxid: string) => Promise<void>;
  sendText: (roomId: string, body: string) => Promise<void>;
  sendAttachment: (roomId: string, file: File, opts?: AttachmentOptions) => Promise<MatrixMessage>;
  onMessage: (cb: (m: MatrixMessage) => void) => void;
  onSync: (cb: () => void) => void;
  /** Marca la sala abierta: los mensajes que lleguen ahí no cuentan como no leídos. */
  setActiveRoom: (roomId: string) => void;
  /** Envía el recibo de lectura y limpia el contador local de no leídos. */
  markRead: (roomId: string) => Promise<void>;
  listRooms: () => RoomSummary[];
  findDirectRoom: (mxid: string) => string | undefined;
  roomMembers: (roomId: string) => RoomMember[];
  contacts: () => Contact[];
  presence: (mxid: string) => Presence;
  findContact: (mxid: string) => Promise<Contact>;
  history: (roomId: string, limit?: number) => MatrixMessage[];
  selfUserId: () => string;
};

/** Límite de tamaño para adjuntos (se valida antes de subir). */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/**
 * Acepta un MXID completo (`@bob:nexus.local`) o un nombre corto (`bob`, `@bob`)
 * y devuelve un MXID válido. Evita el error 400 "user id must be in the form
 * @localpart:domain" al crear grupos/invitar.
 */
export function normalizeMxid(raw: string, selfId: string): string {
  let s = String(raw ?? "").trim().replace(/[,;]+$/, "");
  if (!s) throw new Error("Indica un usuario (ej. @bob:nexus.local o bob)");
  const domain = selfId.includes(":") ? selfId.slice(selfId.indexOf(":") + 1) : "nexus.local";
  // Acepta también el formato correo «bob@nexus.local».
  if (s.startsWith("@@")) s = s.slice(1);
  if (!s.startsWith("@")) s = `@${s}`;
  if (s.indexOf("@", 1) >= 0 && !s.includes(":")) {
    s = `@${s.slice(1).replace("@", ":")}`;
  }
  if (!s.includes(":")) s = `${s}:${domain}`;
  if (!/^@[^@:\s]+:[^@:\s]+$/.test(s)) {
    throw new Error(`Usuario no válido: "${raw}". Usa @nombre:dominio (o solo el nombre)`);
  }
  return s;
}

/** Normaliza el usuario del formulario de login usando el dominio configurado. */
export function normalizeLoginUser(raw: string, defaultDomain: string): string {
  return normalizeMxid(raw, `@_:${defaultDomain || "nexus.local"}`);
}

function newTxnId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function sha256Hex(file: File): Promise<string | undefined> {
  try {
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return undefined;
  }
}

async function imageSize(file: File): Promise<{ w?: number; h?: number }> {
  try {
    if (typeof createImageBitmap !== "function") return {};
    const bmp = await createImageBitmap(file);
    const out = { w: bmp.width, h: bmp.height };
    bmp.close?.();
    return out;
  } catch {
    return {};
  }
}

function guessKind(file: File): Exclude<MessageKind, "text"> {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("audio/")) return "audio";
  return "file";
}

export function createMatrixClient(baseUrl: string, defaultDomain = "nexus.local"): MatrixClient {
  const origin = new URL(baseUrl).origin;
  const fetchFromServer: typeof fetch = (input, options) => {
    const target = new URL(input instanceof Request ? input.url : String(input));
    if (target.origin !== origin) return Promise.reject(new Error("La solicitud salió del servidor configurado."));
    return fetch(input, { ...options, redirect: "error" });
  };
  let client: sdk.MatrixClient | null = null;
  let onMsg: ((m: MatrixMessage) => void) | null = null;
  let onSyncCb: (() => void) | null = null;
  let activeRoomId = "";
  /** Actividad forzada al enviar/recibir: garantiza que la sala suba al tope ya mismo. */
  const activity = new Map<string, number>();
  /** No leídos locales: no dependemos de push rules ni de que el servidor envíe recibos. */
  const unread = new Map<string, number>();
  /** Salas cuyo contador del servidor ya se tomó como punto de partida. */
  const seededUnread = new Set<string>();
  const pendingDirect = new Map<string, string>();
  const roleEvent = "local.nexus.role_group";
  const directEvent = "local.nexus.direct";
  let administrator = false;
  let presenceTimer: ReturnType<typeof setInterval> | undefined;

  function bump(roomId: string) {
    activity.set(roomId, Date.now());
  }

  function seedUnread(room: any) {
    if (seededUnread.has(room.roomId)) return;
    seededUnread.add(room.roomId);
    const fromServer = Number(room.getUnreadNotificationCount?.() ?? 0);
    if (fromServer > 0) unread.set(room.roomId, Math.max(unread.get(room.roomId) ?? 0, fromServer));
  }

  function lastMessageEvent(roomId: string): any | undefined {
    const room = client?.getRoom(roomId);
    if (!room) return undefined;
    return room
      .getLiveTimeline()
      .getEvents()
      .slice()
      .reverse()
      .find((e: any) => e.getType?.() === "m.room.message");
  }

  /** true solo si la sala tiene un evento m.room.name real (el SDK calcula un nombre ficticio para DMs). */
  function hasExplicitName(room: any): boolean {
    try {
      const ev = room.currentState?.getStateEvents?.("m.room.name", "");
      return Boolean(ev?.getContent?.()?.name);
    } catch {
      return false;
    }
  }

  /** Mapa MXID → salas DM según la cuenta (`m.direct`), igual que otros clientes Matrix. */
  function directMap(): Record<string, string[]> {
    if (!client) return {};
    try {
      const ev = client.getAccountData("m.direct" as any);
      const content = ev?.getContent?.() ?? {};
      return typeof content === "object" ? (content as Record<string, string[]>) : {};
    } catch {
      return {};
    }
  }

  function directPeer(room: sdk.Room, self: string): string | undefined {
    if (hasExplicitName(room)) return undefined;
    const pair: unknown = room.currentState.getStateEvents(directEvent, "")?.getContent()?.users;
    if (Array.isArray(pair) && pair.length === 2 && pair.includes(self)) {
      return pair.find((id): id is string => typeof id === "string" && id !== self);
    }
    const inviter = room.getMyMembership() === "invite" && room.getDMInviter();
    if (inviter && inviter !== self) return inviter;
    const activeMembers = room.getMembers().filter((member) => ["join", "invite"].includes(member.membership ?? ""));
    if (activeMembers.length === 2) return activeMembers.find((member) => member.userId !== self)?.userId;
    if (room.getInvitedAndJoinedMemberCount() === 2) {
      const guess = room.guessDMUserId();
      if (guess !== self) return guess;
    }
    return undefined;
  }

  /** Normaliza usando el dominio de la propia sesión (o el configurado antes del login). */
  function norm(raw: string): string {
    return normalizeMxid(raw, client?.getUserId() || `@_:${defaultDomain}`);
  }

  function mediaUrl(mxc?: string, w?: number, h?: number): string | undefined {
    if (!mxc || !client) return undefined;
    try {
      return client.mxcUrlToHttp(mxc, w, h, w ? "scale" : undefined) ?? undefined;
    } catch {
      return undefined;
    }
  }

  function toMessage(roomId: string, e: any): MatrixMessage {
    const c: any = e.getContent?.() || {};
    const msgtype: string = c.msgtype || "";
    const kind: MessageKind =
      msgtype === "m.image" ? "image" : msgtype === "m.audio" ? "audio" : msgtype === "m.file" ? "file" : "text";
    const mxc: string | undefined = c.url;
    return {
      eventId: e.getId?.() || `${e.getTs?.()}-${Math.random().toString(36).slice(2)}`,
      roomId,
      sender: e.getSender?.() || "",
      kind,
      body: c.body || "",
      ts: e.getTs?.() || Date.now(),
      url: mediaUrl(mxc),
      thumbUrl: kind === "image" ? mediaUrl(mxc, 420, 420) : undefined,
      info: c.info
        ? {
            mimetype: c.info.mimetype,
            size: c.info.size,
            w: c.info.w,
            h: c.info.h,
            duration: c.info.duration,
          }
        : undefined,
      sha256: typeof c["sha256"] === "string" ? c["sha256"] : undefined,
    };
  }

  return {
    async login(user: string, password: string) {
      const id = normalizeLoginUser(user, defaultDomain);
      const tmp = sdk.createClient({ baseUrl, fetchFn: fetchFromServer });
      const res = await tmp.login("m.login.password", { user: id, password });
      client = sdk.createClient({
        baseUrl,
        fetchFn: fetchFromServer,
        accessToken: res.access_token,
        userId: res.user_id,
        deviceId: res.device_id,
      });
      client.on(sdk.RoomEvent.Timeline as any, (event: any, room: any, toStart: boolean) => {
        if (toStart) return;
        const t = event.getType?.();
        if (t !== "m.room.message") {
          // Cambios de nombre/miembros: refrescar la lista de salas y miembros.
          if (["m.room.member", "m.room.name", "m.room.power_levels", roleEvent].includes(t)) onSyncCb?.();
          return;
        }
        const m = toMessage(room?.roomId || "", event);
        // Toda actividad (propia o ajena) sube la sala al tope de la lista.
        bump(m.roomId);
        if (m.sender === client?.getUserId()) {
          unread.set(m.roomId, 0);
        } else if (m.roomId !== activeRoomId) {
          unread.set(m.roomId, (unread.get(m.roomId) ?? 0) + 1);
        }
        onMsg?.(m);
        onSyncCb?.();
      });
      client.on(sdk.ClientEvent.Sync as any, (state: string) => {
        if (state === "PREPARED" || state === "SYNCING") onSyncCb?.();
      });
      client.on(sdk.UserEvent.Presence, () => onSyncCb?.());
    },
    async start() {
      if (!client) throw new Error("No autenticado");
      const active = client;
      await new Promise<void>((resolve, reject) => {
        const finish = (error?: unknown) => {
          clearTimeout(timer);
          active.removeListener(sdk.ClientEvent.Sync, ready);
          if (error) reject(error);
          else resolve();
        };
        const ready = (state: string) => {
          if (state === "PREPARED" || state === "SYNCING") finish();
        };
        const timer = setTimeout(() => finish(new Error("El servidor no completó la sincronización inicial.")), 15000);
        active.on(sdk.ClientEvent.Sync, ready);
        void active.startClient({ initialSyncLimit: 30, lazyLoadMembers: false }).catch(finish);
      });
      const publishOnline = () => {
        void active.setPresence({ presence: "online" }).catch(() => undefined);
      };
      publishOnline();
      clearInterval(presenceTimer);
      presenceTimer = setInterval(publishOnline, 60_000);
    },
    stop() {
      clearInterval(presenceTimer);
      client?.stopClient();
      client = null;
    },
    async logout() {
      if (!client) return;
      clearInterval(presenceTimer);
      const active = client;
      active.stopClient();
      client = null;
      await Promise.race([
        active.setPresence({ presence: "offline" }).catch(() => undefined),
        new Promise<void>((resolve) => setTimeout(resolve, 1500)),
      ]);
      await active.logout();
    },
    async isAdministrator() {
      if (!client) return false;
      try {
        const response = await fetchFromServer(`${origin}/_dendrite/admin/registrationTokens`, {
          headers: { Authorization: `Bearer ${client.getAccessToken()}` },
          signal: AbortSignal.timeout(3500),
        });
        administrator = response.ok;
      } catch {
        administrator = false;
      }
      return administrator;
    },
    async joinRoom(roomId: string) {
      if (!client) throw new Error("No autenticado");
      const self = client.getUserId();
      const invitedRoom = client.getRoom(roomId);
      const peer = self && invitedRoom && directPeer(invitedRoom, self);
      await client.joinRoom(roomId);
      if (peer) {
        const map = directMap();
        map[peer] = Array.from(new Set([...(map[peer] ?? []), roomId]));
        pendingDirect.set(peer, roomId);
        await client.setAccountData("m.direct" as any, map as any).catch(() => undefined);
      }
    },
    async createDirectRoom(mxid: string) {
      if (!client) throw new Error("No autenticado");
      const target = norm(mxid);
      if (target === client.getUserId()) throw new Error("No puedes abrir un chat privado contigo mismo");
      const pending = pendingDirect.get(target);
      if (pending) return pending;
      const res = await client.createRoom({
        preset: "trusted_private_chat" as any,
        invite: [target],
        is_direct: true,
        initial_state: [{ type: directEvent, state_key: "", content: { users: [client.getUserId(), target] } }],
      });
      pendingDirect.set(target, res.room_id);
      // Registrar el DM en la cuenta para reutilizarlo (como Element/otros clientes).
      const map = directMap();
      map[target] = Array.from(new Set([...(map[target] ?? []), res.room_id]));
      await client.setAccountData("m.direct" as any, map as any).catch(() => undefined);
      return res.room_id;
    },
    async createGroupRoom(name: string, mxids: string[], roleGroup?: string) {
      if (!client) throw new Error("No autenticado");
      if (roleGroup && !administrator) throw new Error("Se requiere una cuenta administradora de Matrix.");
      const self = client.getUserId() || "";
      const invites = Array.from(new Set(mxids.map(norm).filter((id) => id !== self)));
      const res = await client.createRoom({
        name: name.trim() || "Grupo NEXUS",
        preset: "private_chat" as any,
        invite: invites,
        ...(roleGroup ? {
          initial_state: [
            { type: roleEvent, state_key: "", content: { role: roleGroup.trim() } },
            { type: "m.room.history_visibility", state_key: "", content: { history_visibility: "joined" } },
          ],
          power_level_content_override: {
            users: { [self]: 100 }, users_default: 10, events_default: 10,
            state_default: 100, invite: 100, kick: 100, ban: 100, redact: 50,
          },
        } : {}),
      });
      return res.room_id;
    },
    async setRoomAccess(roomId, mxid, access) {
      if (!client || !administrator) throw new Error("Se requiere una cuenta administradora.");
      const target = norm(mxid);
      if (target === client.getUserId()) throw new Error("No puedes modificar tu propio acceso.");
      await client.setPowerLevel(roomId, target, accessLevels[access]);
    },
    async removeRoomAccess(roomId, mxid) {
      if (!client || !administrator) throw new Error("Se requiere una cuenta administradora.");
      const target = norm(mxid);
      if (target === client.getUserId()) throw new Error("No puedes retirar tu propio acceso.");
      await client.kick(roomId, target);
      await client.setPowerLevel(roomId, target, accessLevels.reader);
    },
    async invite(roomId: string, mxid: string) {
      if (!client) throw new Error("No autenticado");
      const target = norm(mxid);
      if (target === client.getUserId()) throw new Error("No puedes invitarte a ti mismo");
      await client.invite(roomId, target);
    },
    async sendText(roomId: string, body: string) {
      if (!client) throw new Error("No autenticado");
      // txnId único: si se reutiliza, el homeserver deduplica y descarta el mensaje.
      await client.sendEvent(roomId, "m.room.message" as any, { msgtype: "m.text", body }, newTxnId() as any);
      bump(roomId);
      unread.set(roomId, 0);
    },
    async sendAttachment(roomId: string, file: File, opts?: AttachmentOptions) {
      if (!client) throw new Error("No autenticado");
      if (file.size > MAX_UPLOAD_BYTES) {
        throw new Error(`El archivo supera el límite de ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB.`);
      }
      const kind = opts?.kind ?? guessKind(file);
      const mxc = await sha256Hex(file);
      const upload = await client.uploadContent(file, {
        type: file.type || "application/octet-stream",
        name: file.name,
        includeFilename: true,
      } as any);

      const info: Record<string, unknown> = {
        mimetype: file.type || "application/octet-stream",
        size: file.size,
      };
      if (kind === "image") {
        const { w, h } = await imageSize(file);
        if (w) info.w = w;
        if (h) info.h = h;
      }
      if (kind === "audio" && opts?.duration) info.duration = Math.round(opts.duration);

      const msgtype = kind === "image" ? "m.image" : kind === "audio" ? "m.audio" : "m.file";
      const content: Record<string, unknown> = {
        msgtype,
        body: kind === "file" ? file.name : kind === "image" ? file.name || "imagen" : "nota de voz",
        filename: file.name,
        url: upload.content_uri,
        info,
      };
      if (mxc) content["sha256"] = mxc;

      const res = await client.sendEvent(roomId, "m.room.message" as any, content as any, newTxnId() as any);
      bump(roomId);
      unread.set(roomId, 0);
      return {
        eventId: res.event_id,
        roomId,
        sender: client.getUserId() || "",
        kind,
        body: String(content.body),
        ts: Date.now(),
        url: mediaUrl(upload.content_uri),
        thumbUrl: kind === "image" ? mediaUrl(upload.content_uri, 420, 420) : undefined,
        info: info as AttachmentInfo,
        sha256: mxc,
      };
    },
    setActiveRoom(roomId) {
      activeRoomId = roomId;
      if (roomId) unread.set(roomId, 0);
    },
    async markRead(roomId) {
      if (!client) return;
      unread.set(roomId, 0);
      const ev = lastMessageEvent(roomId);
      const eventId = ev?.getId?.();
      if (!ev || !eventId) return;
      await client.sendReadReceipt(ev).catch(() => undefined);
      await client.setRoomReadMarkers(roomId, eventId).catch(() => undefined);
    },
    onMessage(cb) {
      onMsg = cb;
    },
    onSync(cb) {
      onSyncCb = cb;
    },
    listRooms() {
      if (!client) return [];
      const self = client.getUserId();
      const dmRooms = new Set(Object.values(directMap()).flat());
      return client
        .getRooms()
        .filter((r) => ["join", "invite"].includes(r.getMyMembership()))
        .map((r) => {
          seedUnread(r);
          const joined = r.getJoinedMembers();
          const others = joined.filter((m) => m.userId !== self);
          // En invitaciones aún no estás unido: usa todos los miembros para el nombre.
          const othersAny = r.getMembers().filter((m) => m.userId !== self);
          // DM: registrada en m.direct, o sala de 2 personas sin m.room.name explícito.
          const peer = self ? directPeer(r, self) : undefined;
          const isDirect = dmRooms.has(r.roomId) || Boolean(peer);
          const fallback = (others.length ? others : othersAny)
            .map((m) => m.name || m.userId)
            .join(", ") || peer;
          return {
            roomId: r.roomId,
            name: r.name || (isDirect ? fallback || r.roomId : fallback ? `Grupo: ${fallback}` : r.roomId),
            isDirect,
            peerId: peer,
            memberCount: joined.length,
            lastTs: Math.max(r.getLastActiveTimestamp?.() ?? 0, activity.get(r.roomId) ?? 0),
            membership: r.getMyMembership() === "invite" ? ("invite" as const) : ("join" as const),
            unread: unread.get(r.roomId) ?? 0,
            roleGroup: r.currentState.getStateEvents(roleEvent, "")?.getContent()?.role,
            canWrite: Boolean(self && r.currentState.maySendEvent("m.room.message", self)),
            canManage: Boolean(administrator && self && r.currentState.maySendStateEvent("m.room.power_levels", self)),
          };
        })
        .sort((a, b) => b.lastTs - a.lastTs);
    },
    findDirectRoom(mxid: string) {
      if (!client) return undefined;
      const self = client.getUserId();
      if (!self) return undefined;
      const pending = pendingDirect.get(mxid);
      if (pending) {
        const room = client.getRoom(pending);
        const membership = room?.getMember(self)?.membership;
        if (membership !== "leave" && membership !== "ban") return pending;
        pendingDirect.delete(mxid);
      }
      const known = directMap()[mxid] ?? [];
      for (const rid of known) {
        const r = client.getRoom(rid);
        if (r && r.getMyMembership() !== "leave") return rid;
      }
      for (const r of client.getRooms()) {
        if (["join", "invite"].includes(r.getMyMembership()) && directPeer(r, self) === mxid) return r.roomId;
      }
      return undefined;
    },
    roomMembers(roomId: string) {
      if (!client) return [];
      const room = client.getRoom(roomId);
      if (!room) return [];
      return room
        .getMembers()
        .filter((m) => m.membership === "join" || m.membership === "invite")
        .map((m) => ({
          userId: m.userId,
          name: m.name || m.userId,
          access: (m.powerLevel >= 50 ? "moderator" : m.powerLevel >= 10 ? "member" : "reader") as RoomAccess,
          invited: m.membership === "invite",
          owner: m.powerLevel >= 100,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    contacts() {
      if (!client) return [];
      const self = client.getUserId();
      const result = new Map<string, Contact>();
      for (const room of client.getRooms()) {
        if (room.getMyMembership() !== "join") continue;
        for (const member of room.getMembers()) {
          if (member.userId !== self && (member.membership === "join" || member.membership === "invite")) {
            result.set(member.userId, { userId: member.userId, name: member.name || member.userId });
          }
        }
      }
      return [...result.values()];
    },
    presence(mxid) {
      const user = client?.getUser(mxid);
      if (!user?.events.presence) return "unknown";
      const status = user.presence;
      return status === "online" || status === "offline" || status === "unavailable" ? status : "unknown";
    },
    async findContact(mxid) {
      if (!client) throw new Error("Inicia sesión primero.");
      const userId = norm(mxid);
      if (userId === client.getUserId()) throw new Error("Introduce el usuario de otra persona.");
      const domain = client.getUserId()?.slice(client.getUserId()?.indexOf(":") ?? 0);
      if (userId.slice(userId.indexOf(":")) !== domain) throw new Error("Busca una cuenta del servidor local.");
      const profile = await client.getProfileInfo(userId);
      return { userId, name: profile.displayname || userId };
    },
    history(roomId, limit = 200) {
      if (!client) return [];
      const room = client.getRoom(roomId);
      if (!room) return [];
      const seen = new Set<string>();
      return room
        .getLiveTimeline()
        .getEvents()
        .filter((e: any) => e.getType() === "m.room.message")
        .map((e: any) => toMessage(roomId, e))
        .filter((m) => {
          if (seen.has(m.eventId)) return false;
          seen.add(m.eventId);
          return true;
        })
        .slice(-limit);
    },
    selfUserId() {
      return client?.getUserId() || "";
    },
  };
}
