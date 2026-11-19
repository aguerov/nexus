import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  createMatrixClient,
  MAX_UPLOAD_BYTES,
  normalizeMxid,
  type MatrixClient,
  type MatrixMessage,
  type RoomMember,
  type RoomSummary,
  type RoomAccess,
  type Contact,
} from "./matrix/client";
import { MessageBubble } from "./components/MessageBubble";
import { Appearance } from "./components/Appearance";
import { PresenceBadge } from "./components/PresenceBadge";
import { defaultProfile, readConnection, saveConnection, validateConnection } from "./connection";

type ChatToast = {
  id: string;
  roomId: string;
  roomName: string;
  sender: string;
  body: string;
};
type PrivateChat = { roomId: string; name: string; peerId?: string };
const accessLabels: Record<RoomAccess, string> = {
  reader: "Solo lectura", member: "Participante", moderator: "Moderador",
};

function sameDay(a: number, b: number) {
  const x = new Date(a);
  const y = new Date(b);
  return x.toDateString() === y.toDateString();
}

export default function App() {
  // Conexión
  const [profile, setProfile] = useState(readConnection);
  const { endpoint: homeserver, user, domain } = profile;
  const [password, setPassword] = useState("");
  const [selfId, setSelfId] = useState("");
  const [error, setError] = useState<string>("");
  const [connecting, setConnecting] = useState(false);
  const [loginMode, setLoginMode] = useState<"client" | "admin">("client");
  const [administrator, setAdministrator] = useState(false);

  // Salas y mensajes
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [roomId, setRoomId] = useState("");
  const [privateChats, setPrivateChats] = useState<PrivateChat[]>([]);
  const [privateOpen, setPrivateOpen] = useState("");
  const [privateDrafts, setPrivateDrafts] = useState<Record<string, string>>({});
  const [privateSending, setPrivateSending] = useState<string[]>([]);
  const [privateError, setPrivateError] = useState("");
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [messages, setMessages] = useState<MatrixMessage[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");

  // Nuevos chats
  const [newDm, setNewDm] = useState("");
  const [sidebar, setSidebar] = useState<"rooms" | "contacts">("rooms");
  const [lookedUpContacts, setLookedUpContacts] = useState<Contact[]>([]);
  const [searchingContact, setSearchingContact] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupRole, setNewGroupRole] = useState("");
  const [newGroupInvites, setNewGroupInvites] = useState("");
  const [inviteId, setInviteId] = useState("");
  const [inviteAccess, setInviteAccess] = useState<RoomAccess>("member");
  const [panel, setPanel] = useState<"dm" | "group" | null>(null);

  // Audio
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);

  // Avisos emergentes de mensajes entrantes en otras salas.
  const [toasts, setToasts] = useState<ChatToast[]>([]);

  const clientRef = useRef<MatrixClient | null>(null);
  const roomIdRef = useRef("");
  const privateOpenRef = useRef("");
  const dmRequests = useRef(new Set<string>());
  const privateLogRef = useRef<HTMLDivElement | null>(null);
  const privateFileRef = useRef<HTMLInputElement | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const imageRef = useRef<HTMLInputElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recStartRef = useRef(0);
  const recTimerRef = useRef<number | null>(null);
  const syncTimerRef = useRef<number | null>(null);

  const loggedIn = Boolean(selfId);
  const currentRoom = rooms.find((r) => r.roomId === roomId);
  const privateChat = privateChats.find((chat) => chat.roomId === privateOpen);
  const privateRoom = rooms.find((r) => r.roomId === privateOpen);
  const privateMessages = privateOpen ? clientRef.current?.history(privateOpen) ?? [] : [];
  const writable = Boolean(roomId && (currentRoom?.canWrite ?? true));
  const canAssign = Boolean(currentRoom?.roleGroup && currentRoom.canManage);
  const presence = (id: string) => clientRef.current?.presence(id) ?? "unknown";
  const contacts = [...new Map([...lookedUpContacts, ...(clientRef.current?.contacts() ?? [])]
    .map((contact) => [contact.userId, contact])).values()]
    .sort((a, b) => Number(presence(b.userId) === "online") - Number(presence(a.userId) === "online") ||
      a.name.localeCompare(b.name));
  const serverName = domain.trim().toLowerCase();

  /** Convierte nombres cortos/MXID en una lista limpia, sin duplicados ni el propio usuario. */
  function parseInvites(raw: string): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const part of raw.split(/[,\s;]+/)) {
      if (!part.trim()) continue;
      const id = normalizeMxid(part, selfId || `@_:${serverName}`);
      if (id === selfId) continue;
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
    return out;
  }

  function refreshRooms(autoSelect = true) {
    const c = clientRef.current;
    if (!c) return;
    const list = c.listRooms();
    setRooms(list);
    setRoomId((prev) => {
      if (prev && list.some((r) => r.roomId === prev && r.membership === "join" && !r.isDirect)) return prev;
      // Nunca seleccionar automáticamente una invitación: no se puede escribir hasta unirse.
      if (!autoSelect && prev && !list.some((r) => r.roomId === prev)) return "";
      return list.find((r) => r.membership === "join" && !r.isDirect)?.roomId ?? "";
    });
  }

  function loadRoom(rid: string) {
    const c = clientRef.current;
    if (!c || !rid) return;
    setMessages(c.history(rid));
    setMembers(c.roomMembers(rid));
  }

  function scheduleRefresh() {
    if (syncTimerRef.current) return;
    syncTimerRef.current = window.setTimeout(() => {
      syncTimerRef.current = null;
      refreshRooms(false);
      const rid = roomIdRef.current;
      if (rid) loadRoom(rid);
    }, 400);
  }

  useEffect(() => {
    roomIdRef.current = roomId;
    privateOpenRef.current = privateOpen;
    const c = clientRef.current;
    const activeRoom = privateOpen || roomId;
    c?.setActiveRoom(activeRoom);
    if (activeRoom) void c?.markRead(activeRoom);
    if (roomId) loadRoom(roomId);
    else { setMessages([]); setMembers([]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, privateOpen]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, roomId]);

  useEffect(() => {
    const el = privateLogRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [privateMessages.length, privateOpen]);

  async function login() {
    if (connecting) return;
    setError("");
    if (!user.trim()) {
      setError("Indica el usuario (@usuario:servidor)");
      return;
    }
    let loginId = user.trim();
    let c: MatrixClient | undefined;
    setConnecting(true);
    try {
      const endpoint = validateConnection(profile);
      loginId = normalizeMxid(loginId, `@_:${serverName}`);
      const connectedClient = createMatrixClient(endpoint, serverName);
      c = connectedClient;
      await connectedClient.login(loginId, password);
      if (loginMode === "admin" && !(await c.isAdministrator())) {
        await c.logout().catch(() => undefined);
        throw new Error("La cuenta no tiene acceso administrativo en este servidor.");
      }
      setPassword("");
      const saved = { ...profile, endpoint, domain: serverName, user: loginId };
      setProfile(saved);
      saveConnection(saved);
      clientRef.current = c;
      c.onMessage((m) => {
        if (m.roomId === privateOpenRef.current) {
          scheduleRefresh();
          return;
        }
        // La sala con actividad sube al tope; `client.ts` ya actualizó el orden.
        if (m.roomId !== roomIdRef.current) {
          scheduleRefresh();
          if (m.sender !== connectedClient.selfUserId()) {
            const roomName = connectedClient.listRooms().find((r) => r.roomId === m.roomId)?.name || "Conversación";
            const toast: ChatToast = {
              id: m.eventId || `${m.roomId}-${m.ts}`,
              roomId: m.roomId,
              roomName,
              sender: m.sender,
              body: m.body || "(adjunto)",
            };
            setToasts((prev) => [...prev.filter((t) => t.id !== toast.id), toast].slice(-3));
            window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== toast.id)), 9000);
          }
          return;
        }
        setMessages((prev) => (prev.some((p) => p.eventId === m.eventId) ? prev : [...prev, m]));
        if (m.sender === connectedClient.selfUserId()) {
          setToasts((prev) => prev.filter((t) => t.roomId !== m.roomId));
        }
      });
      c.onSync(scheduleRefresh);
      await c.start();
      await invoke("set_session_active", { active: true }).catch(() => undefined);
      setAdministrator(loginMode === "admin");
      setSelfId(c.selfUserId());
      scheduleRefresh();
      setTimeout(() => refreshRooms(true), 900);
    } catch (e: any) {
      void c?.logout().catch(() => undefined);
      clientRef.current = null;
      setError(`No se pudo iniciar sesión como ${loginId} en ${homeserver}. Detalle: ${String(e?.message || e)}`);
    } finally {
      setConnecting(false);
    }
  }

  function logout() {
    const session = clientRef.current;
    clientRef.current = null;
    void invoke("set_session_active", { active: false }).catch(() => undefined);
    void session?.logout().catch(() => {
      if (!clientRef.current) setError("Sesión local cerrada. El servidor no confirmó el cierre de la sesión.");
    });
    const recorder = recorderRef.current;
    if (recorder?.state === "recording") {
      recorder.ondataavailable = null;
      chunksRef.current = [];
      recorder.stop();
    }
    setMessage("");
    setPanel(null);
    setNewDm("");
    setSidebar("rooms");
    setLookedUpContacts([]);
    setSearchingContact(false);
    setNewGroupName("");
    setNewGroupInvites("");
    setInviteId("");
    setError("");
    setSelfId("");
    setAdministrator(false);
    setPrivateChats([]);
    setPrivateOpen("");
    setPrivateDrafts({});
    setPrivateSending([]);
    setPrivateError("");
    dmRequests.current.clear();
    setRooms([]);
    setMessages([]);
    setMembers([]);
    setRoomId("");
    setToasts([]);
  }

  async function openDm(mxid: string) {
    setError("");
    try {
      const target = normalizeMxid(mxid, selfId || `@_:${serverName}`);
      if (target === selfId) throw new Error("No puedes abrir un chat privado contigo mismo");
      const c = clientRef.current;
      if (!c) throw new Error("Inicia sesión primero");
      if (dmRequests.current.has(target)) return;
      dmRequests.current.add(target);
      try {
        const rid = c.findDirectRoom(target) ?? await c.createDirectRoom(target);
        const existing = c.listRooms().find((room) => room.roomId === rid);
        if (existing?.membership === "invite") await c.joinRoom(rid);
        if (clientRef.current !== c) return;
        showPrivate(rid, contacts.find((contact) => contact.userId === target)?.name ?? shortName(target), target);
      } finally {
        dmRequests.current.delete(target);
      }
      setPanel(null);
      setNewDm("");
    } catch (e: any) {
      setError(String(e?.message || e));
    }
  }

  async function findContact() {
    const c = clientRef.current;
    if (!c || !newDm.trim() || searchingContact) return;
    setSearchingContact(true);
    setError("");
    try {
      const contact = await c.findContact(newDm);
      if (clientRef.current !== c) return;
      setLookedUpContacts((existing) => [...existing.filter((item) => item.userId !== contact.userId), contact]);
      setNewDm("");
    } catch (e) {
      if (clientRef.current === c) setError(`No se pudo encontrar la cuenta. ${e instanceof Error ? e.message : e}`);
    } finally {
      if (clientRef.current === c) setSearchingContact(false);
    }
  }

  function showPrivate(rid: string, name: string, peerId?: string) {
    setPrivateChats((chats) => chats.some((chat) => chat.roomId === rid) ? chats : [...chats, { roomId: rid, name, peerId }]);
    setPrivateError("");
    setPrivateOpen(rid);
    setToasts((items) => items.filter((toast) => toast.roomId !== rid));
    refreshRooms(false);
  }

  async function sendPrivate() {
    const c = clientRef.current;
    const rid = privateOpen;
    const body = privateDrafts[rid]?.trim();
    if (!c || !body || privateSending.includes(rid)) return;
    setPrivateSending((items) => [...items, rid]);
    setPrivateError("");
    try {
      await c.sendText(rid, body);
      if (clientRef.current === c) {
        setPrivateDrafts((drafts) => ({ ...drafts, [rid]: "" }));
        refreshRooms(false);
      }
    } catch (e) {
      if (clientRef.current === c) setPrivateError(String(e instanceof Error ? e.message : e));
    } finally {
      if (clientRef.current === c) setPrivateSending((items) => items.filter((id) => id !== rid));
    }
  }

  /** Acepta la invitación si la sala seleccionada todavía no está unida. */
  async function ensureJoined(r: RoomSummary | undefined) {
    if (!r || r.membership !== "invite") return Boolean(r);
    const c = clientRef.current;
    if (!c) return false;
    setBusy("Aceptando invitación…");
    try {
      await c.joinRoom(r.roomId);
      refreshRooms(false);
      return true;
    } catch (e: any) {
      setError(`No se pudo aceptar la invitación: ${String(e?.message || e)}`);
      return false;
    } finally {
      setBusy("");
    }
  }

  /** Abre una sala, la marca como leída y deja el foco en el compositor. */
  async function activateRoom(rid: string) {
    setError("");
    const c = clientRef.current;
    if (!c) return;
    const room = c.listRooms().find((r) => r.roomId === rid);
    if (!(await ensureJoined(room))) return;
    if (room?.isDirect) {
      showPrivate(rid, room.name, room.peerId);
      return;
    }
    c.setActiveRoom(rid);
    setRoomId(rid);
    setPanel(null);
    await c.markRead(rid);
    refreshRooms(false);
    loadRoom(rid);
    setTimeout(() => composerRef.current?.focus(), 80);
  }

  async function openRoom(r: RoomSummary) {
    await activateRoom(r.roomId);
  }

  async function openToast(t: ChatToast) {
    setToasts((prev) => prev.filter((x) => x.id !== t.id));
    await activateRoom(t.roomId);
  }

  async function createGroup() {
    setError("");
    try {
      const c = clientRef.current;
      if (!c) throw new Error("Inicia sesión primero");
      const invites = parseInvites(newGroupInvites);
      if (!newGroupName.trim()) throw new Error("Ponle un nombre al grupo");
      if (administrator && !newGroupRole.trim()) throw new Error("Indica el rol o tipo de usuario del grupo.");
      const rid = await c.createGroupRoom(newGroupName.trim(), invites, administrator ? newGroupRole : undefined);
      await c.joinRoom(rid).catch(() => undefined);
      refreshRooms(false);
      setRoomId(rid);
      setPanel(null);
      setNewGroupName("");
      setNewGroupRole("");
      setNewGroupInvites("");
      setTimeout(() => loadRoom(rid), 600);
    } catch (e: any) {
      setError(String(e?.message || e));
    }
  }

  async function inviteToRoom() {
    setError("");
    try {
      const c = clientRef.current;
      if (!c) throw new Error("Inicia sesión primero");
      if (!roomId) throw new Error("Selecciona una sala");
      if (!inviteId.trim()) throw new Error("Indica el usuario a invitar");
      const target = normalizeMxid(inviteId, selfId || `@_:${serverName}`);
      if (target === selfId) throw new Error("No puedes invitarte a ti mismo");
      if (canAssign) await c.setRoomAccess(roomId, target, inviteAccess);
      await c.invite(roomId, target);
      setInviteId("");
      setTimeout(() => loadRoom(roomId), 800);
    } catch (e: any) {
      setError(String(e?.message || e));
    }
  }

  async function updateAccess(target: string, access: RoomAccess | "remove") {
    const c = clientRef.current;
    if (!c || !canAssign || busy) return;
    setBusy("Actualizando acceso…");
    setError("");
    try {
      if (access === "remove") await c.removeRoomAccess(roomId, target);
      else await c.setRoomAccess(roomId, target, access);
      scheduleRefresh();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy("");
    }
  }

  async function send() {
    const text = message.trim();
    if (!text || !writable) return;
    setError("");
    try {
      const c = clientRef.current;
      if (!c) throw new Error("Inicia sesión primero");
      if (!roomId) throw new Error("Selecciona o crea una sala");
      if (!(await ensureJoined(currentRoom))) throw new Error("Acepta la invitación antes de escribir");
      setMessage("");
      await c.sendText(roomId, text);
      await c.markRead(roomId);
      refreshRooms(false);
    } catch (e: any) {
      setMessage(text);
      setError(String(e?.message || e));
    }
  }

  async function attach(file: File, kind?: "image" | "audio" | "file", durationMs?: number, target = roomId) {
    setError("");
    const c = clientRef.current;
    if (!c) {
      setError("Inicia sesión primero");
      return;
    }
    if (!target) {
      setError("Selecciona o crea una sala");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`El archivo supera el límite de ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB.`);
      return;
    }
    const destination = c.listRooms().find((r) => r.roomId === target);
    if (destination && (!destination.canWrite || !(await ensureJoined(destination)))) {
      setError("Esta conversación requiere permiso de escritura.");
      return;
    }
    try {
      setBusy(kind === "audio" ? "Enviando audio…" : "Subiendo archivo…");
      const m = await c.sendAttachment(target, file, { kind, duration: durationMs });
      if (target === roomIdRef.current) setMessages((prev) => (prev.some((p) => p.eventId === m.eventId) ? prev : [...prev, m]));
      await c.markRead(target);
      refreshRooms(false);
    } catch (e: any) {
      setError(`No se pudo enviar el archivo: ${String(e?.message || e)}`);
    } finally {
      setBusy("");
    }
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>, target = roomId) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) attach(f, f.type.startsWith("image/") ? "image" : undefined, undefined, target);
  }

  function onPaste(e: React.ClipboardEvent, target = roomId) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.kind === "file") {
        const f = item.getAsFile();
        if (f) {
          e.preventDefault();
          attach(f, f.type.startsWith("image/") ? "image" : undefined, undefined, target);
          return;
        }
      }
    }
  }

  function onDrop(e: React.DragEvent, target = roomId) {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f) attach(f, f.type.startsWith("image/") ? "image" : undefined, undefined, target);
  }

  async function toggleRecording(target = roomId) {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Este entorno no expone el micrófono.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const rec = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (recTimerRef.current) {
          clearInterval(recTimerRef.current);
          recTimerRef.current = null;
        }
        setRecording(false);
        setRecSecs(0);
        const duration = Date.now() - recStartRef.current;
        if (chunksRef.current.length === 0) return;
        const blob = new Blob(chunksRef.current, { type: mime.split(";")[0] });
        const file = new File([blob], `audio-${Date.now()}.webm`, { type: blob.type });
        void attach(file, "audio", duration, target);
      };
      recorderRef.current = rec;
      recStartRef.current = Date.now();
      setRecording(true);
      setRecSecs(0);
      recTimerRef.current = window.setInterval(() => setRecSecs(Math.floor((Date.now() - recStartRef.current) / 1000)), 500);
      rec.start(250);
    } catch (e: any) {
      setError(`No se pudo grabar audio: ${String(e?.message || e)}`);
    }
  }

  // ---------- Pantalla de conexión ----------
  if (!loggedIn) {
    return (
      <main className="login-shell">
        <form className="card login" onSubmit={(event) => { event.preventDefault(); void login(); }}>
          <div className="brand-row"><span className="brand-mark" aria-hidden="true">N</span><h1>NEXUS</h1><Appearance /></div>
          <h2>Iniciar sesión</h2>
          <div className="login-modes" aria-label="Tipo de acceso">
            <button type="button" aria-pressed={loginMode === "client"} disabled={connecting} onClick={() => { setLoginMode("client"); setError(""); }}>Usuario</button>
            <button type="button" aria-pressed={loginMode === "admin"} disabled={connecting} onClick={() => { setLoginMode("admin"); setError(""); }}>Administrador</button>
          </div>
          <fieldset disabled={connecting}>
            <legend>Conexión</legend>
            <label htmlFor="connection-mode">Modo</label>
            <select id="connection-mode" value={profile.mode} onChange={(e) => {
              const mode = e.target.value === "lan" ? "lan" : "local";
              setProfile({ ...profile, mode, endpoint: mode === "local" ? defaultProfile.endpoint : "" });
              setError("");
            }}>
              <option value="local">LOCAL · Este equipo</option>
              <option value="lan">LAN · Red institucional</option>
            </select>
            <div className="connection-fields">
              <div>
                <label htmlFor="endpoint">Dirección del servidor</label>
                <input id="endpoint" value={homeserver} required placeholder="http://192.168.1.50:8008"
                  onChange={(e) => setProfile({ ...profile, endpoint: e.target.value })} />
              </div>
              <div>
                <label htmlFor="domain">Dominio Matrix</label>
                <input id="domain" value={domain} required onChange={(e) => setProfile({ ...profile, domain: e.target.value })} />
              </div>
            </div>
          </fieldset>
          <label htmlFor="login-user">Usuario o ID de Matrix</label>
          <input id="login-user" value={user} required autoComplete="username" disabled={connecting}
            onChange={(e) => setProfile({ ...profile, user: e.target.value })} />
          <label htmlFor="login-password">Contraseña</label>
          <input id="login-password" type="password" value={password} required autoComplete="current-password"
            disabled={connecting} onChange={(e) => setPassword(e.target.value)} />
          {error && <p className="error" role="alert">{error}</p>}
          <button className="login-submit" disabled={connecting}>{connecting ? "Conectando…" : "Iniciar sesión"}</button>
        </form>
      </main>
    );
  }

  return (
    <div className="app wide">
      <header className="workspace-header">
        <div className="row">
          <span className="brand-mark" aria-hidden="true">N</span>
          <h1>NEXUS</h1>
        </div>
        <div className="row">
          <span className="pill" title={selfId}>{shortName(selfId)} · {administrator ? "Administrador" : "Usuario"}</span>
          <Appearance />
          <button className="secondary" onClick={logout}>Cerrar sesión</button>
        </div>
      </header>

      {error && <div className="error-box">{error}</div>}

      <div className="chat-shell">
        <aside className="sidebar card">
          <div className="sidebar-tabs">
            <button aria-pressed={sidebar === "rooms"} onClick={() => setSidebar("rooms")}>Conversaciones</button>
            <button aria-pressed={sidebar === "contacts"} onClick={() => { setSidebar("contacts"); setPanel(null); }}>Personas</button>
          </div>
          {sidebar === "contacts" ? <>
            <form className="contact-search" onSubmit={(e) => { e.preventDefault(); void findContact(); }}>
              <input aria-label="Buscar usuario local" placeholder="Usuario o ID de Matrix" value={newDm}
                onChange={(e) => setNewDm(e.target.value)} />
              <button type="submit" disabled={!newDm.trim() || searchingContact}>{searchingContact ? "Buscando…" : "Buscar"}</button>
            </form>
            <div className="room-list">
              {!contacts.length && <p className="meta">Busca un usuario o acepta una invitación de grupo para ver contactos.</p>}
              {contacts.map((contact) => <button key={contact.userId} className="room contact-item" title={contact.userId}
                onClick={() => void openDm(contact.userId)}>
                <span className="room-name">{contact.name}</span>
                <PresenceBadge status={presence(contact.userId)} />
              </button>)}
            </div>
          </> : <>
          <div className="row sidebar-actions">
            <button className="secondary" onClick={() => setPanel(panel === "dm" ? null : "dm")}>Nuevo chat</button>
            <button className="secondary" onClick={() => setPanel(panel === "group" ? null : "group")}>{administrator ? "Grupo por rol" : "Nuevo grupo"}</button>
          </div>

          {panel === "dm" && (
            <div className="panel">
              <label>Usuario (nombre o MXID)</label>
              <input value={newDm} onChange={(e) => setNewDm(e.target.value)} placeholder="beto o @beto:nexus.local" onKeyDown={(e) => e.key === "Enter" && openDm(newDm)} />
              <button onClick={() => openDm(newDm)} style={{ marginTop: 6, width: "100%" }}>Abrir chat privado</button>
            </div>
          )}

          {panel === "group" && (
            <div className="panel">
              <label>Nombre del grupo</label>
              <input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="Equipo de trabajo" />
              {administrator && <label>Rol del grupo<input value={newGroupRole} maxLength={60}
                onChange={(e) => setNewGroupRole(e.target.value)} placeholder="Ej. Operaciones" /></label>}
              <label>Invitados (nombres o MXID separados por coma)</label>
              <input value={newGroupInvites} onChange={(e) => setNewGroupInvites(e.target.value)} placeholder="beto, carla o @beto:nexus.local, @carla:nexus.local" />
              <button onClick={createGroup} style={{ marginTop: 6, width: "100%" }}>Crear grupo</button>
            </div>
          )}

          <h4>Grupos y privados</h4>
          <div className="room-list">
            {rooms.length === 0 && <p className="meta">Sin conversaciones. Crea un chat privado o un grupo.</p>}
            {rooms.map((r) => (
              <button
                key={r.roomId}
                className={[
                  "room",
                  r.roomId === roomId ? "active" : "",
                  r.membership === "invite" ? "invite" : "",
                  r.unread > 0 ? "unread" : "",
                ].filter(Boolean).join(" ")}
                onClick={() => openRoom(r)}
                title={r.roomId}
              >
                <span className="room-name">
                  {r.name}
                  {r.unread > 0 && <span className="unread-badge">{r.unread}</span>}
                </span>
                <span className="room-meta">
                  {r.membership === "invite"
                    ? "invitación · pulsa para unirte"
                    : r.isDirect
                      ? "privado"
                      : [r.roleGroup, `${r.memberCount} miembros`].filter(Boolean).join(" · ")}
                </span>
                {r.peerId && <PresenceBadge status={presence(r.peerId)} />}
              </button>
            ))}
          </div>
          </>}
        </aside>

        <main className="chat card" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
          <div className="chat-head">
            <div>
              <h3>{currentRoom?.name ?? "Selecciona una conversación"}</h3>
              <div className="members">
                {members.map((m) => (
                  <button
                    key={m.userId}
                    className={m.userId === selfId ? "chip me" : "chip"}
                    title={m.userId === selfId ? "Tú" : `Abrir chat privado con ${m.userId}`}
                    onClick={() => m.userId !== selfId && openDm(m.userId)}
                  >
                    {m.userId === selfId ? "tú" : <>{m.name}<PresenceBadge status={presence(m.userId)} /></>}
                  </button>
                ))}
              </div>
            </div>
            {roomId && (!currentRoom?.roleGroup || canAssign) && <div className="row invite">
              <input value={inviteId} onChange={(e) => setInviteId(e.target.value)} placeholder="invitar bob o @bob:nexus.local" />
              {canAssign && <select aria-label="Acceso de la cuenta invitada" value={inviteAccess}
                onChange={(e) => setInviteAccess(e.target.value as RoomAccess)}>
                {Object.entries(accessLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>}
              <button className="secondary" disabled={Boolean(busy)} onClick={inviteToRoom}>Invitar</button>
            </div>}
          </div>
          {canAssign && <details className="access-panel">
            <summary>Administrar acceso · {currentRoom?.roleGroup}</summary>
            <ul>
              {members.filter((member) => !member.owner).map((member) => (
                <li key={member.userId}>
                  <span title={member.userId}>{member.name}{member.invited && " · Invitación pendiente"}</span>
                  <select aria-label={`Acceso de ${member.userId}`} value={member.access} disabled={Boolean(busy)}
                    onChange={(e) => void updateAccess(member.userId, e.target.value as RoomAccess)}>
                    {Object.entries(accessLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  <button className="secondary" disabled={Boolean(busy)} onClick={() => void updateAccess(member.userId, "remove")}>Retirar acceso</button>
                </li>
              ))}
            </ul>
          </details>}

          <div className="log" ref={logRef}>
            {messages.map((m, i) => {
              const mine = m.sender === selfId;
              const prev = messages[i - 1];
              const showDay = !prev || !sameDay(prev.ts, m.ts);
              return (
                <div key={m.eventId}>
                  {showDay && <div className="day">{new Date(m.ts).toLocaleDateString()}</div>}
                  <MessageBubble m={m} mine={mine} />
                </div>
              );
            })}
            {!roomId && (
              <div className="empty-chat">
                <h3>Aún no tienes una conversación abierta</h3>
                <p className="meta">
                  Acepta una invitación desde la izquierda (pulsa sobre ella) o crea un chat privado/grupo.
                </p>
                <div className="row" style={{ justifyContent: "center" }}>
                  <button onClick={() => setPanel("dm")}>Nuevo chat</button>
                  <button className="secondary" onClick={() => setPanel("group")}>{administrator ? "Grupo por rol" : "Nuevo grupo"}</button>
                </div>
              </div>
            )}
            {messages.length === 0 && roomId && (
              <p className="meta" style={{ textAlign: "center", marginTop: 24 }}>
                Sin mensajes todavía. Escribe, adjunta un archivo o pega una captura con Ctrl+V.
              </p>
            )}
          </div>

          <div className="composer">
            <button className="icon" title="Adjuntar archivo" onClick={() => fileRef.current?.click()} disabled={!writable || Boolean(busy)}>📎</button>
            <button className="icon" title="Enviar imagen" onClick={() => imageRef.current?.click()} disabled={!writable || Boolean(busy)}>🖼️</button>
            <button
              className={recording ? "icon rec" : "icon"}
              title={recording ? "Detener grabación" : "Grabar nota de voz"}
              onClick={() => void toggleRecording()}
              disabled={!writable || Boolean(busy)}
            >
              {recording ? `⏹ ${recSecs}s` : "🎤"}
            </button>
            <input ref={fileRef} type="file" hidden onChange={onPickFile} />
            <input ref={imageRef} type="file" accept="image/*" hidden onChange={onPickFile} />
            <textarea
              ref={composerRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onPaste={onPaste}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={writable ? "Escribe un mensaje…" : roomId ? "Este grupo es de solo lectura" : "Abre o acepta un grupo para escribir"}
              disabled={!writable}
              rows={1}
            />
            <button onClick={send} disabled={!writable || !message.trim() || Boolean(busy)}>Enviar</button>
          </div>
          <div className="foot-meta">
            {busy || `${profile.mode.toUpperCase()} · ${new URL(homeserver).host}`}
          </div>
        </main>
      </div>

      {privateChats.length > 0 && <nav className="private-dock" aria-label="Chats privados abiertos">
        {privateChats.map((chat) => <button key={chat.roomId} className="secondary" aria-expanded={privateOpen === chat.roomId}
          onClick={() => privateOpen === chat.roomId ? setPrivateOpen("") : showPrivate(chat.roomId, chat.name, chat.peerId)}>
          {chat.name}
          {Boolean(rooms.find((r) => r.roomId === chat.roomId)?.unread) && <span className="unread-badge">Nuevo</span>}
        </button>)}
      </nav>}
      {privateChat && <section className="private-window card" aria-label={`Chat privado con ${privateChat.name}`}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop(e, privateOpen)}
        onKeyDown={(e) => { if (e.key === "Escape") setPrivateOpen(""); }}>
        <header className="private-header">
          <div className="row"><div className="avatar">{initials(privateChat.name)}</div><div><h3>{privateChat.name}</h3>
            {privateChat.peerId || privateRoom?.peerId ? <PresenceBadge status={presence(privateChat.peerId || privateRoom?.peerId || "")} /> : <span className="meta">Chat privado</span>}
          </div></div>
          <button className="secondary" aria-label="Minimizar chat privado" title="Minimizar" onClick={() => setPrivateOpen("")}>−</button>
        </header>
        <div className="log" ref={privateLogRef}>
          {privateMessages.map((m, i) => (
            <div key={m.eventId}>
              {(!i || !sameDay(privateMessages[i - 1].ts, m.ts)) && <div className="day">{new Date(m.ts).toLocaleDateString()}</div>}
              <MessageBubble m={m} mine={m.sender === selfId} />
            </div>
          ))}
          {!privateMessages.length && <p className="meta empty-chat">Puedes dejar un mensaje aunque esta persona no esté en línea.</p>}
        </div>
        {privateError && <p className="error" role="alert">{privateError}</p>}
        <form className="composer" onSubmit={(e) => { e.preventDefault(); void sendPrivate(); }}>
          <button type="button" className="icon" aria-label="Adjuntar archivo al chat privado" disabled={Boolean(busy) || privateRoom?.canWrite === false}
            onClick={() => privateFileRef.current?.click()}>📎</button>
          <input type="file" hidden ref={privateFileRef} onChange={(e) => onPickFile(e, privateOpen)} />
          <button type="button" className={recording ? "icon rec" : "icon"} aria-label="Grabar nota de voz privada"
            disabled={Boolean(busy) || privateRoom?.canWrite === false} onClick={() => void toggleRecording(privateOpen)}>{recording ? `⏹ ${recSecs}s` : "🎤"}</button>
          <textarea key={privateOpen} autoFocus rows={1} aria-label="Mensaje privado" placeholder="Escribe un mensaje privado…"
            value={privateDrafts[privateOpen] ?? ""} disabled={privateSending.includes(privateOpen) || privateRoom?.canWrite === false}
            onChange={(e) => setPrivateDrafts({ ...privateDrafts, [privateOpen]: e.target.value })}
            onPaste={(e) => onPaste(e, privateOpen)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendPrivate(); } }} />
          <button disabled={privateSending.includes(privateOpen) || !privateDrafts[privateOpen]?.trim() || privateRoom?.canWrite === false}>Enviar</button>
        </form>
      </section>}

      {toasts.length > 0 && (
        <div className="toast-stack" aria-live="polite">
          {toasts.map((t) => (
            <div className="toast" key={t.id}>
              <button className="toast-main" onClick={() => void openToast(t)} title="Abrir y responder">
                <strong>{t.roomName}</strong>
                <span>{shortName(t.sender)}: {t.body}</span>
                <small>Clic para abrir y responder</small>
              </button>
              <button
                className="toast-close"
                title="Cerrar aviso"
                onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function initials(mxid: string) {
  const name = mxid.replace(/^@/, "").split(":")[0];
  return name.slice(0, 2).toUpperCase();
}

function shortName(mxid: string) {
  return mxid.replace(/^@/, "").split(":")[0] || mxid;
}
