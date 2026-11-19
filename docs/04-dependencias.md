# NEXUS — Dependencias necesarias

**Estado:** inventario preliminar para planificación e instalación offline. Versiones exactas se fijarán al crear el manifiesto de paquetes reproducible.

## 1. Dependencias de desarrollo (entorno Windows 11)
- Windows 11 x64, herramientas de compilación nativas según stack.
- **Rust** (stable) + Cargo — backend Tauri y supervisor/orquestación.
- **Node.js** + gestor de paquetes (npm/pnpm/yarn) — frontend React/TypeScript y toolchain Tauri.
- **Tauri 2 CLI/prerequisitos** (incl. WebView2 Runtime; en Windows 11 suele estar presente, pero el instalador offline debe contemplarlo).
- **Python** (para construir/empaquetar Synapse y generar wheels offline en máquina de build).
- **PostgreSQL** binarios Windows (para empaquetado).
- Herramienta de instalador (WiX/NSIS según decisión final).

## 2. Dependencias de runtime (incluidas en paquete offline)
- **NEXUS Desktop** (binario Tauri) + assets UI completos (sin CDN).
- **WebView2**: runtime/redistribuible offline si no se garantiza en destino (verificar política).
- **Matrix Synapse** + todas sus dependencias Python (wheels/sdists necesarios para win-x64) y runtime Python embebido si aplica.
- **PostgreSQL** binarios para Windows x64.
- **Bibliotecas de cifrado/cripto** usadas por cliente y manejo de claves (a definir; deben poder distribuirse offline).
- Herramienta de gestión de servicio si se usa wrapper (NSSM/WinSW) con licencia compatible.

## 3. Dependencias de datos/configuración en instalación
- Directorio de datos configurable (BD, media, claves, config).
- Directorio de logs local con rotación.
- Secretos iniciales generados localmente (no descargados).
- Configuración Synapse local (sin federación pública) y binding localhost/IP privada según modo.

## 4. Restricciones sobre dependencias
- Ninguna dependencia obligatoria de proveedores externos en instalación ni ejecución.
- Prohibido: CDN, fuentes externas, APIs cloud, auth externa obligatoria, telemetría obligatoria.
- Todas las dependencias de instalación disponibles como paquetes offline **firmados y verificados**.
- Actualizaciones mediante paquetes offline firmados y verificados.

## 5. Por verificar/fijar
- Lista exacta y hash de cada artefacto (SBOM/manifiesto) para reproducibilidad.
- Compatibilidad de versiones Synapse ↔ PostgreSQL soportadas.
- Licencias de todos los componentes redistribuidos.
- Tamaño total y método de verificación de firmas en Windows.
