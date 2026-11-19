# NEXUS — Comparación de alternativas de instalación (Windows 11)

Objetivo: empaquetar y administrar Synapse y PostgreSQL en Windows 11 **sin requerir Docker Desktop** ni instalaciones previas por parte del usuario. Estado: análisis preliminar; requiere validación con pruebas reales.

## 1. Matrix Synapse en Windows

| Alternativa | Descripción | Pros | Contras / riesgos | Recomendación preliminar |
|---|---|---|---|---|
| **A. Python embebido + wheels offline** | Incluir runtime Python embeddable para Windows y un entorno virtual/paquetes (wheels) predescargados; ejecutar Synapse como proceso/servicio | Control de versión, actualizable, alineado con upstream | Gestión de dependencias nativas/compiladas en Windows; tamaño; complejidad de empaquetado | **Candidata principal** si se valida set de wheels offline reproducible para win-x64 |
| **B. Ejecutable congelado (PyInstaller/Nuitka)** | Empaquetar Synapse+deps en binario(s) | Menos dependencia visible de Python | Fragilidad con paquetes dinámicos/plugins; builds complejos; tamaño; difícil depurar | Evaluar como fallback |
| **C. WSL2 como backend** | Ejecutar Synapse/Postgres en WSL2 | Cercano a Linux, fácil para Synapse | WSL2 puede no estar habilitado; añade capa y consumo; experiencia de instalación/servicios más compleja; riesgo de dependencia de virtualización | **No recomendado** para usuario final por requisitos y complejidad |
| **D. Docker/containers** | Contenedores locales | Aislamiento | **Excluido**: Docker Desktop no es requisito permitido | No |

**Notas:** Synapse es Python; en Windows puede requerir dependencias nativas. Es crítico probar instalación y arranque 100% offline con paquetes predescargados.

### Hallazgo verificado (2026-11-16, este repositorio)
- `pip install matrix-synapse 1.165.0` en Windows x64 (Python 3.14, MSVC 14.44, Rust 1.100) **falla al compilar su extensión Rust**: `rust/src/twisted_dispatch.rs` importa `std::os::unix` y `std::os::fd` sin *gating* por plataforma (`E0433`, `E0432`). Es decir, **la extensión nativa de Synapse no soporta Windows tal cual**.
- Implicaciones: las alternativas viables para Windows nativo son (a) Synapse antiguo sin extensión Rust con Python compatible (a validar), (b) otro homeserver Matrix nativo para el MVP Windows (p. ej. **Dendrite**, Go, binario único, sin Docker), manteniendo protocolo Matrix y migrando a Synapse en la fase Linux, o (c) WSL2/Docker (excluidos por requisitos).
- Acción: validar (a) y (b); si Synapse en Windows no es viable, documentar y aprobar explícitamente el uso de Dendrite en el MVP Windows, sin comprometer la migración futura a Synapse.

## 2. PostgreSQL en Windows

| Alternativa | Descripción | Pros | Contras / riesgos | Recomendación preliminar |
|---|---|---|---|---|
| **A. Binarios ZIP oficiales (win-x64)** | Distribuir binarios oficiales; inicializar con `initdb`; ejecutar como servicio Windows (NSSM/WinSW/servicio propio) o proceso hijo controlado | Sin instalador interactivo del sistema, control total de versión y rutas | Debemos gestionar ciclo de vida, permisos y upgrades | **Candidata principal** |
| **B. Instalador EDB embebido/silencioso** | Incluir instalador oficial en modo silencioso | Instalación conocida | Menos control, posibles conflictos con instalaciones previas, más pesado | Fallback si A falla |
| **C. SQLite** | Reemplazar PostgreSQL | Simple | **No compatible** con Synapse (requiere PostgreSQL en despliegues serios) y aleja de migración futura | No viable |

## 3. Administración de servicios en Windows

| Alternativa | Descripción | Pros | Contras | Nota |
|---|---|---|---|---|
| **Servicio Windows nativo** (registrado por instalador/orquestador Rust) | Crear servicios para Synapse/Postgres o un servicio "NEXUS Supervisor" que los gestione | Integración con arranque/parada, recuperación, permisos | Implementación más cuidada (SCM, privilegios) | Preferible para robustez |
| **Wrapper NSSM/WinSW** | Herramienta que envuelve procesos como servicio | Madurez, rápido de integrar | Dependencia extra a auditar/licenciar e incluir offline | Opción práctica si licencia y firma lo permiten |
| **Procesos hijos del cliente/supervisor** | Tauri/Rust lanza y monitorea procesos | Sin registro de servicio global, más simple en modo usuario | Requiere app/supervisor activo; autoinicio distinto | Útil para MODO LOCAL; evaluar para LAN |

**Recomendación preliminar:** un **supervisor NEXUS** (Rust) que controle ciclo de vida y health checks; con opción de registrarse para arranque automático. Definir si Postgres/Synapse corren como servicios propios o bajo el supervisor tras pruebas de permisos y reinicio.

## 4. Instalador de aplicación

| Alternativa | Descripción | Pros | Contras |
|---|---|---|---|
| **WiX Toolset (MSI)** | Instalador MSI estándar Windows | Corporativo, rollback, desinstalación limpia, GPO-friendly | Curva de aprendizaje |
| **NSIS** | Instalador EXE scriptable | Flexible, común con Tauri | Menos estándar que MSI |
| **Tauri bundler (NSIS/WiX/MSI)** | Integrado en toolchain Tauri | Coherente con cliente | Debe extenderse para orquestar DB/Synapse/servicios |

**Recomendación preliminar:** usar bundling de Tauri como base del instalador de escritorio y extender con lógica personalizada para provisionar componentes locales; evaluar MSI para despliegue institucional futuro.

## 5. Decisiones pendientes de validar
1. Viabilidad de wheels offline de Synapse para Windows x64 (incl. dependencias nativas).
2. Mecanismo exacto de servicio (nativo vs wrapper) y cuentas/permisos mínimos.
3. Manejo de certificados/confianza para LAN sin Internet.
4. Tamaño final del paquete offline y tiempos de instalación.
5. Estrategia de actualización offline con migraciones seguras.

**Próximo paso:** prototipo técnico (spike) en Windows 11 limpio para validar A (Python embebido) + A (Postgres ZIP) antes de congelar la arquitectura de empaquetado.
