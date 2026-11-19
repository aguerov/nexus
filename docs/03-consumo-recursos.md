# NEXUS — Estimación de consumo de recursos (RAM, CPU, disco)

**Estado:** estimación preliminar basada en componentes conocidos; debe medirse en Windows 11 limpio durante el MVP.

## 1. RAM (estimada)

| Componente | En reposo | En uso moderado | Notas |
|---|---|---|---|
| NEXUS Desktop (Tauri/WebView2 + React) | 80–150 MB | 150–300 MB | Depende de vistas abiertas y caché UI |
| Matrix Synapse (Python) | 150–300 MB | 300–600 MB | Crece con usuarios/salas/eventos y workers (MVP: single-process) |
| PostgreSQL | 100–200 MB | 200–400 MB | Configuración conservadora para equipo local |
| Supervisor/orquestación | 10–30 MB | 10–30 MB | |
| **Total estimado (host LOCAL/LAN)** | **~350–700 MB** | **~650–1300 MB** | |
| Cliente en equipo LAN (solo Desktop) | 80–150 MB | 150–300 MB | No ejecuta Synapse/Postgres |

**Recomendación:** mínimo práctico 8 GB RAM en host servidor; 4 GB puede ser justo. Ajustar `shared_buffers`/conexiones de Postgres y configuración Synapse para perfil bajo consumo.

## 2. CPU (estimada)

| Escenario | Uso esperado |
|---|---|
| Reposo | Muy bajo (<2% en CPU moderna) |
| Mensajería texto | Bajo, picos breves en cifrado/sync |
| Transferencia/descarga de archivos | Medio según tamaño y cifrado cliente (SHA-256 + cifrado) |
| Arranque/inicialización BD | Pico moderado temporal |
| Respaldos/cifrado de respaldo | Medio-alto temporal (IO + CPU) |

Objetivo: operación fluida en hardware Windows 11 típico (CPU x64 de 4 núcleos). Medir en pruebas reales.

## 3. Disco (estimado)

| Elemento | Tamaño estimado inicial | Crecimiento |
|---|---|---|
| Paquete instalador offline (todo incluido) | 300–800 MB (a validar) | Según bundling de Python/Postgres/runtime |
| Instalación (binarios, runtimes, Synapse, Postgres) | 400–900 MB | Bajo (solo actualizaciones) |
| Base de datos PostgreSQL (vacía/inicial) | 50–150 MB | Según mensajes, metadatos, índices |
| Media/archivos cifrados | 0 inicial | Según uso; aplicar límites de tamaño configurables |
| Logs locales | 10–100 MB | Rotación y límites configurables |
| Respaldos locales cifrados | Variable | Al menos ~tamaño de datos; política de retención |
| **Mínimo libre recomendado para instalar y operar** | **2–4 GB** + espacio para datos/respaldos | — |

## 4. Red (LAN)
- Tráfico local únicamente en modo LAN; ancho de banda según mensajes/archivos. No requiere Internet.
- Latencia baja en LAN; diseño debe tolerar desconexiones/reconexiones breves.

## 5. Suposiciones y riesgos de estimación
- Synapse en modo single-process (sin workers) para MVP.
- Cifrado en cliente añade CPU en transferencia de archivos grandes.
- Tamaño del instalador depende críticamente de cómo se empaquete Python/Synapse y PostgreSQL (ver doc 02).
- **Acción:** registrar métricas reales (Task Manager/Performance Counters) en cada prueba obligatoria de Windows 11.
