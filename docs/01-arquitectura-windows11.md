# NEXUS — Arquitectura específica Windows 11 (Local First)

**Estado:** diseño inicial (primer entregable). No se ha escrito código de aplicación todavía.

## 1. Objetivos de arquitectura
- Ejecución 100% local en Windows 11 x64, sin Internet en runtime.
- Modo LOCAL (un usuario, localhost) y modo LAN (un host servidor, IP privada) desde el diseño.
- MVP funcional: mensajería real entre usuarios (no solo UI).
- Sin Docker Desktop como requisito del usuario final. Servicios administrados de forma nativa en Windows.

## 2. Componentes y responsabilidades

| Componente | Tecnología | Rol | Ejecución en Windows |
|---|---|---|---|
| Cliente escritorio | Tauri 2, Rust, React, TypeScript | UI, E2EE en cliente, verificación de dispositivos, gestión de claves locales, cifrado de archivos cliente | App nativa (WebView2). Sin CDN/recursos remotos; assets empaquetados. |
| Motor mensajería | Matrix Synapse (Python) | Homeserver, salas, usuarios, sync, media API local | Servicio Windows administrado por NEXUS (ver alternativas). Sin federación pública. |
| Base de datos | PostgreSQL | Almacenamiento persistente de Synapse y metadatos locales | Servicio Windows / proceso administrado. Datos en directorio configurable. |
| Almacenamiento archivos | Sistema de archivos local | Media cifrada, adjuntos, respaldos cifrados | Directorio privado con ACLs Windows; cifrado en cliente; SHA-256 e integridad. |
| Capa de orquestación local | Rust (sidecar/servicio NEXUS) | Arranque/parada ordenada, health checks, configuración, generación de secretos iniciales, gestión de servicios | Parte del instalador/runtime de NEXUS. |

## 3. Topología por modo

### MODO LOCAL (un equipo, un usuario)
- Todo en `127.0.0.1`: cliente Tauri ↔ Synapse ↔ PostgreSQL.
- Sin exposición en red. Puertos enlazados solo a loopback.
- Adecuado para pruebas, desarrollo y uso individual.

### MODO LAN (servidor local + clientes)
- **Host servidor (Windows 11):** ejecuta Synapse + PostgreSQL + (opcionalmente) cliente.
- **Clientes:** solo NEXUS Desktop; se conectan al homeserver por IP privada del host (ej. `http://192.168.x.x:<puerto>` o HTTPS local con certificado local).
- Sin Internet: descubrimiento/configuración manual de la dirección del servidor en LAN (o mDNS local opcional si se decide; debe funcionar sin servicios externos).
- Firewall de Windows: regla explícita para permitir el puerto del homeserver solo en redes privadas.

## 4. Flujos principales
- **Primer inicio (host):** inicializar BD → generar secretos/config Synapse → crear usuario admin/local → verificar salud → abrir cliente.
- **Mensajería:** cliente usa Matrix Client-Server API contra Synapse local; E2EE gestionado en cliente; claves protegidas localmente.
- **Archivos:** cifrado en cliente antes de subir al media store local; verificación SHA-256; permisos y límites de tamaño.
- **Respaldo:** exportación/copia cifrada local del directorio de datos + dump PostgreSQL; restauración controlada.

## 5. Límites y decisiones abiertas (a resolver en comparación de instalación)
- Cómo empaquetar y ejecutar Synapse en Windows sin Python del sistema (embedded Python, PyInstaller/Nuitka, o alternativa) y cómo registrarlo como servicio.
- Cómo distribuir PostgreSQL (binarios oficiales zip/instalador embebido) y administrarlo como servicio Windows.
- Estrategia de puertos, certificados locales para LAN y almacenamiento seguro de secretos/claves (DPAPI/Credential Manager u otro).
- Política de actualización offline (reemplazo atómico, migraciones de BD, rollback).

## 6. Principios
- Dependencias de runtime incluidas en el paquete offline.
- Datos de usuario separados del binario; desinstalación no borra datos.
- Migración futura a Linux/Keycloak/MinIO/HA sin reescribir cliente ni abandonar Matrix.
