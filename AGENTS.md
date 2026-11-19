# AGENTS.md — NEXUS

Proyecto NEXUS: mensajería local-first para Windows 11. Requisitos mandatorios abajo; tienen prioridad sobre cualquier decisión arquitectónica previa que los contradiga.

## Restricción principal (obligatoria)
- Todo debe desarrollarse, instalarse, ejecutarse y probarse **íntegramente en Windows 11 x64**. No se requiere ni se usa Linux, VPS, Kubernetes, nube ni Internet para la primera etapa.
- **Sin Internet en runtime**: prohibido usar CDN, fuentes externas, APIs cloud, autenticación externa obligatoria, telemetría obligatoria o recursos remotos para cargar la UI. Las dependencias de instalación se distribuyen en paquetes offline previamente descargados, firmados y verificados.
- El MVP **no es solo una interfaz visual**: debe permitir enviar y recibir mensajes reales entre usuarios antes de avanzar.

## Arquitectura definida
- **Cliente de escritorio**: Tauri 2 + Rust + React + TypeScript.
- **Motor de mensajería**: Matrix Synapse local, sin federación pública. localhost en MODO LOCAL, IP privada en MODO LAN.
- **Persistencia**: PostgreSQL local, datos en directorio configurable, respaldos locales cifrados.
- **Archivos**: directorio privado, cifrado en cliente, permisos, integridad SHA-256, límites de tamaño.
- **Seguridad**: E2EE, protección de claves locales, verificación de dispositivos, autenticación local, protección de sesiones.

## Modos de operación (desde el diseño)
1. **LOCAL**: un solo usuario en su equipo Windows 11.
2. **LAN**: un equipo Windows 11 hace de servidor; otros se conectan por red institucional.
- Autenticación, mensajería, grupos y archivos funcionan sin Internet en ambos modos.

## Reglas para el instalador
- NO asumir que Synapse, PostgreSQL o Docker están instalados. **Docker Desktop no es requisito para el usuario final** — investigar el empaquetado/administración de servicios más fiable en Windows 11 (servicios nativos de Windows).
- El instalador debe: instalar NEXUS Desktop, configurar componentes locales, inicializar BD, crear estructura de directorios y permisos, generar secretos iniciales, configurar servicios, verificar dependencias, hacer health checks, y desinstalar **sin borrar automáticamente los datos del usuario**.
- Instalador reproducible + actualización offline firmada.

## Escalabilidad futura (diseñar, no implementar)
Módulos deben permitir migrar después a: servidor Linux centralizado, PostgreSQL de producción, Keycloak, MinIO, LDAP/AD, múltiples servidores, HA/replicación, clientes móviles. La migración no debe exigir reescribir el cliente ni abandonar el protocolo Matrix.

## Primer entregable (antes de programar)
1. Arquitectura específica Windows 11. 2. Comparación de alternativas de instalación. 3. Estimación RAM/CPU/disco. 4. Dependencias. 5. Riesgos de seguridad. 6. Plan de instalación offline. 7. Diseño de modo individual y LAN. Luego: MVP + instalador funcional.

**Criterio de éxito**: instalar NEXUS en un Windows 11 limpio, desconectar Internet, iniciar la app y comunicarse localmente sin ningún servicio externo.

## Pruebas obligatorias (reales, en Windows 11)
Instalación limpia; primer inicio; reinicio del equipo; autoinicio opcional; parar/reiniciar el servidor; mensajería entre 2 usuarios y entre 2 equipos LAN; transferencia de archivos; desconexión de Internet; reinicio de PostgreSQL; recuperación de respaldos; desinstalar/reinstalar; actualización offline.
