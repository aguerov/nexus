import type { MatrixMessage } from "../matrix/client";

export function fmtTime(ts: number) {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function fmtSize(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function initials(mxid: string) {
  const name = mxid.replace(/^@/, "").split(":")[0];
  return name.slice(0, 2).toUpperCase();
}

type Props = { m: MatrixMessage; mine: boolean };

/**
 * Burbuja de mensaje: propias a la derecha (clase `mine`), ajenas a la izquierda con avatar.
 * Soporta texto, imágenes (miniatura enlazada), archivos y notas de audio.
 */
export function MessageBubble({ m, mine }: Props) {
  return (
    <div className={mine ? "bubble-row mine" : "bubble-row theirs"}>
      {!mine && (
        <div className="avatar" title={m.sender}>
          {initials(m.sender)}
        </div>
      )}
      <div className="bubble">
        {!mine && <div className="sender">{m.sender}</div>}
        {m.kind === "text" && (
          <div className="text-line">
            <div className="text">{m.body}</div>
            <time className="ts" dateTime={new Date(m.ts).toISOString()}>{fmtTime(m.ts)}</time>
          </div>
        )}
        {m.kind === "image" && (
          <a href={m.url} target="_blank" rel="noreferrer">
            <img className="img" src={m.thumbUrl || m.url} alt={m.body} loading="lazy" />
          </a>
        )}
        {m.kind === "file" && (
          <a className="file" href={m.url} download={m.body} target="_blank" rel="noreferrer">
            <span className="file-icon">📄</span>
            <span className="file-name">{m.body}</span>
            <span className="meta">{fmtSize(m.info?.size)}</span>
          </a>
        )}
        {m.kind === "audio" && <audio controls src={m.url} preload="metadata" />}
        {m.kind !== "text" && <div className="ts">
          <time dateTime={new Date(m.ts).toISOString()}>{fmtTime(m.ts)}</time>
          {m.sha256 && (
            <span className="sha" title={`SHA-256: ${m.sha256}`}>
              {" "}· SHA-256 ✓
            </span>
          )}
        </div>}
      </div>
    </div>
  );
}
