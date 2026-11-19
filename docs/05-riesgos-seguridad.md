# NEXUS — Riesgos de seguridad (análisis preliminar)

**Estado:** identificación temprana; debe revisarse y mitigarse en diseño e implementación.

## 1. Cifrado y claves
- **E2EE (Matrix):** implementación correcta de gestión de claves/sesiones en cliente; riesgo de pérdida de claves locales (pérdida de acceso a historial cifrado) → definir backup/recuperación segura de claves.
- **Claves en reposo:** proteger material de claves con mecanismos de Windows (p. ej. DPAPI) y permisos estrictos; riesgo si el perfil de usuario se compromete.
- **Verificación de dispositivos:** sin verificación, riesgo de MITM en LAN o suplantación de dispositivo; el flujo debe ser claro y obligatorio/visible.
- **Secretos iniciales:** generados localmente con entropía adecuada; proteger archivos de configuración que los contengan.

## 2. Red y modos de operación
- **Modo LAN:** exposición del homeserver en IP privada; riesgo si la red no es confiable. Mitigar con binding correcto, firewall (solo red privada), y considerar TLS local/certificados para LAN.
- **Federación:** debe permanecer deshabilitada para evitar fugas o conexiones no deseadas.
- **Sin Internet:** reduce superficie externa, pero impide revocación/actualización online de confianza; las actualizaciones offline firmadas son críticas.

## 3. Datos y almacenamiento
- **Archivos:** cifrado en cliente antes de subir, integridad SHA-256, límites de tamaño y permisos de directorio privado (ACLs). Riesgo de metadatos expuestos en nombres/rutas/logs.
- **PostgreSQL:** datos en disco; evaluar cifrado a nivel de disco/directorio y permisos del servicio; respaldos locales deben ir cifrados.
- **Desinstalación:** no borrar datos del usuario (requisito) implica que datos sensibles pueden permanecer; documentar y ofrecer borrado seguro opcional.

## 4. Servicios y privilegios (Windows)
- **Servicios Synapse/PostgreSQL/supervisor:** ejecutar con mínimos privilegios necesarios; riesgo de escalación si se configuran como SYSTEM innecesariamente.
- **Instalador:** requiere privilegios elevados; debe ser reproducible y firmado para evitar tampering. Verificación de firmas en instalación/actualización offline.
- **Puertos locales:** evitar conflictos y exposición accidental; validar binding (localhost vs 0.0.0.0 según modo).

## 5. Cadena de suministro y actualizaciones
- **Paquetes offline:** riesgo si el origen se compromete; mitigar con hashes, firmas, SBOM y proceso de build reproducible.
- **Dependencias embebidas (Python/Synapse/Postgres):** seguir actualizaciones de seguridad; plan de parches vía paquetes offline firmados.
- **Telemetría:** prohibida como obligatoria; no introducir recolección inadvertida.

## 6. Autenticación y sesiones
- **Autenticación local:** definir política de credenciales, bloqueo y protección contra fuerza bruta local.
- **Sesiones:** expiración, revocación y protección de tokens en almacenamiento local.

## 7. Registro y diagnóstico
- **Logs locales:** útiles para soporte pero pueden contener datos sensibles; definir niveles, redacción (scrubbing) y rotación; mantenerlos locales.

## 8. Acciones de seguridad requeridas antes de MVP
- Modelo de amenazas ligero específico LOCAL/LAN.
- Decisión de TLS/certificados para LAN.
- Diseño de protección de claves (DPAPI u otro) y backup de claves E2EE.
- Hardening de configuración Synapse/Postgres (sin federación, puertos, permisos).
- Proceso de firma/verificación de instalador y paquetes offline.
- Pruebas: operación sin Internet, reinicios, y verificación de que no hay conexiones externas.
