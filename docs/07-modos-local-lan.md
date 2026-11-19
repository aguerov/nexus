# NEXUS — Diseño de modo individual (LOCAL) y modo LAN

## 1. MODO LOCAL (individual)

### Contexto
- Un único usuario, un único equipo Windows 11.
- Sin dependencia de red externa ni de otros equipos.

### Topología y red
- Todos los componentes en el mismo host.
- Synapse y PostgreSQL enlazados a `127.0.0.1` (loopback) únicamente.
- Puertos internos no expuestos a la red.

### Identidad y acceso
- Homeserver local (ej. nombre de servidor local configurable, p. ej. `nexus.local` solo resolución local) — definir convención que no requiera DNS externo.
- Usuario(s) locales creados en primer inicio; autenticación local.
- Cliente Tauri conecta a `http://127.0.0.1:<puerto>` (o loopback seguro).

### Operación
- Inicio/detención controlados por NEXUS (supervisor/UI).
- Autoinicio opcional.
- Mensajería, grupos y archivos operan localmente.

### Datos
- Datos en directorio configurable del equipo; respaldos locales cifrados.

## 2. MODO LAN (servidor local + clientes)

### Contexto
- Red institucional/local sin requerir Internet.
- Un equipo Windows 11 actúa como **host servidor**; otros equipos Windows 11 ejecutan **NEXUS Desktop** como clientes.

### Roles
- **Host servidor:** instala stack completo (Desktop opcional + Synapse + PostgreSQL + supervisor). Fuente de verdad.
- **Cliente LAN:** instala NEXUS Desktop; configura dirección del homeserver (IP privada/hostname local).

### Topología y red
- Synapse escucha en IP privada del host (interfaz LAN) en puerto definido.
- Firewall Windows: permitir tráfico entrante del servicio solo en perfil de red **Privada** (no Pública).
- Sin federación pública. Sin conexión a Internet requerida para auth/mensajería/grupos/archivos.

### Descubrimiento y configuración
- **Base:** configuración manual de URL del servidor (IP/puerto) en cliente — funciona siempre sin servicios externos.
- **Opcional (a evaluar):** descubrimiento local (mDNS/LLMNR) solo si es fiable y no introduce dependencias externas; debe haber fallback manual.

### Confianza y transporte en LAN
- Riesgo de MITM en LAN: definir estrategia (TLS con certificado local generado en host y distribución/confianza controlada, o mecanismo equivalente) antes de producción LAN. MVP debe documentar el modelo elegido.

### Usuarios y dispositivos
- Cuentas gestionadas en el homeserver local; autenticación local.
- Verificación de dispositivos entre clientes para reforzar confianza E2EE.

### Disponibilidad
- Si el host servidor se apaga, los clientes no pueden sincronizar (modelo centralizado local). Respaldos y procedimiento de reinicio/recuperación en el host son críticos.

## 3. Conmutación y configuración
- La elección de modo se define en instalación/primer inicio (y debe poder reconfigurarse con procedimiento claro).
- **LOCAL → LAN:** requiere cambiar binding, reglas de firewall, certificados/confianza y comunicar URL a clientes.
- **LAN → LOCAL:** revertir exposición de red y asegurar binding a loopback.
- Configuración persistida localmente; sin depender de servicios externos.

## 4. Matriz de funcionamiento sin Internet

| Función | LOCAL | LAN |
|---|---|---|
| Autenticación | Sí | Sí (contra host local) |
| Mensajería | Sí | Sí |
| Grupos/salas | Sí | Sí |
| Archivos | Sí | Sí |
| Inicio/parada | Sí | Sí (host); clientes conectan cuando host disponible |

## 5. Implicaciones para implementación y pruebas
- Pruebas obligatorias incluyen: mensajería entre 2 usuarios, mensajería entre 2 equipos LAN, transferencia de archivos y desconexión de Internet.
- El instalador y la UI deben guiar claramente la configuración de modo y dirección del servidor.
- Diseñar desde ahora para futura migración a servidor Linux centralizado sin reescribir cliente ni abandonar Matrix.
