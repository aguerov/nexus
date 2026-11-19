import type { Presence } from "../matrix/client";

export const presenceLabels: Record<Presence, string> = {
  online: "En línea",
  offline: "Desconectado",
  unavailable: "No disponible",
  unknown: "Sin estado",
};

export function PresenceBadge({ status }: { status: Presence }) {
  return <span className={`presence-badge ${status}`}>{presenceLabels[status]}</span>;
}
