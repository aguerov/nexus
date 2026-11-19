# NEXUS — Plan de instalación offline

Objetivo: instalar y actualizar NEXUS en Windows 11 sin conexión a Internet, con integridad verificable.

## 1. Artefactos offline
- **Paquete instalador principal** (ej. EXE/MSI) que incluye o acompaña:
  - NEXUS Desktop (Tauri) y assets UI completos.
  - Runtime/supervisor y herramientas de orquestación.
  - PostgreSQL (binarios Windows x64).
  - Synapse + runtime Python embebido + wheels/dependencias predescargadas (según alternativa validada).
  - Redistribuibles necesarios (p. ej. WebView2) si aplica.
- **Manifiesto** con lista de componentes, versiones y hashes (SHA-256).
- **Firmas digitales** del instalador y/o paquetes.

## 2. Preparación (en máquina con Internet, entorno de build controlado)
1. Fijar versiones de todos los componentes.
2. Descargar todas las dependencias (binarios, wheels, redistribuibles) y almacenarlas en repositorio/artifact store interno.
3. Generar manifiesto y hashes; firmar artefactos.
4. Construir instalador reproducible (en lo posible: builds deterministas, registro de entorno).
5. Verificar en VM Windows 11 limpia **sin red**: instalación, arranque, operación básica.

## 3. Instalación en equipo destino (sin Internet)
1. Copiar paquete offline (USB/medio local).
2. Verificar firma/hash del instalador antes de ejecutar (procedimiento documentado).
3. Ejecutar instalador (privilegios según necesidad):
   - Copiar binarios y runtimes.
   - Crear estructura de directorios (programa vs datos configurables).
   - Inicializar PostgreSQL y base de datos.
   - Generar secretos iniciales y configuración local (Synapse, puertos, modo).
   - Registrar/configurar servicios o supervisor.
   - Aplicar permisos/ACLs.
   - Ejecutar comprobaciones de salud (health checks).
4. Primer inicio: creación de usuario/admin local según flujo.

## 4. Actualización offline
- Paquete de actualización firmado y verificado.
- Pasos: detener servicios de forma ordenada → respaldo previo (recomendado/automático configurable) → aplicar binarios/migraciones de BD → reiniciar → health checks → rollback si falla (definir estrategia).
- Nunca depender de descarga en línea durante la actualización.

## 5. Desinstalación
- Eliminar binarios/servicios registrados.
- **No eliminar automáticamente los datos del usuario** (BD, media, claves, respaldos). Ofrecer opción explícita separada/documentada para borrado seguro si se requiere.

## 6. Controles y evidencias
- Registro local del resultado de instalación/actualización (éxito/fallo) sin telemetría externa.
- Procedimiento de verificación de integridad disponible para administradores.
- Pruebas obligatorias: instalación limpia y actualización offline en Windows 11 sin Internet (ver doc 07).
