# PostgreSQL (NEXUS, Windows 11)

- Usar binarios oficiales Windows x64 distribuidos en el paquete offline (ver `docs/02-alternativas-instalacion.md`).
- Inicialización: `initdb -D <pg_data> -U nexus --encoding=UTF8 --locale=C` (ajustar según build).
- Configurar `postgresql.conf`: `listen_addresses = '127.0.0.1'`, `port = ${PG_PORT}`, rutas de log en directorio de datos/logs, límites de memoria conservadores.
- Configurar `pg_hba.conf` para acceso local (scram-sha-256) solo desde localhost.
- Crear base de datos y usuario para Synapse durante `nexus-supervisor init` con credenciales generadas localmente.
- Respaldos: `pg_dump` a archivo dentro de flujo de respaldo cifrado local.
- Ejecutar con mínimos privilegios; datos en directorio configurable del usuario/sistema según instalación.
