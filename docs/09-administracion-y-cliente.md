# NEXUS 0.2.0 · Administración y cliente

## Responsabilidades

El operador del servidor abre **NEXUS Administración** en el equipo servidor. Es una aplicación Windows Forms que ejecuta los scripts del paquete con los permisos de su cuenta de Windows. Puede consultar los servicios, iniciar y detener la instancia, elegir la interfaz y el puerto, y crear usuarios Matrix normales o administradores Matrix. El acceso a la consola se controla con permisos de Windows sobre los datos y la configuración del servidor. El tipo de cuenta Matrix no otorga privilegios de Windows.

El **cliente** usa la API Matrix del servidor elegido. Guarda el modo, la dirección, el dominio y el último usuario en el perfil local de WebView2. La contraseña se elimina del formulario tras iniciar sesión. Las solicitudes del SDK usan el origen configurado y rechazan redirecciones. El ejecutable del cliente carece de operaciones de administración del equipo servidor.

## Administración

- **Instancia nueva.** Ejecuta `scripts/nexus-setup.ps1` una vez. Los parámetros permiten elegir `DataDir`, `ConfigDir`, `ServerName`, los datos de conexión PostgreSQL, el rol y la base. La provisión valida la autenticación del rol antes de escribir la configuración. Usa cuentas y bases dedicadas. Para una contraseña de PostgreSQL, invoca el script desde PowerShell con una variable de entrada en memoria en vez de escribir la clave en la línea de comandos.
- **Instancia existente.** La consola lee `%ProgramData%\NEXUS\config\nexus.json` por defecto. Para otra instancia, usa `NEXUS-Administracion.cmd -ConfigPath "D:\NEXUS\config\nexus.json"`. La identidad Matrix y PostgreSQL se fijan durante la provisión. Para mover datos o cambiar el dominio se necesita un procedimiento de migración.
- **Cambiar LOCAL/LAN.** Detén la instancia, aplica la configuración y vuelve a iniciarla. LOCAL escucha solo en `127.0.0.1`. LAN escucha en una IPv4 privada asignada al equipo. La URL y el dominio se muestran juntos para copiarlos al cliente. Aplica la regla de firewall institucional al puerto elegido.
- **Parada.** La consola detiene el proceso Dendrite registrado para esa instancia. Las instalaciones anteriores que registraban solo el PID requieren poder consultar la línea de comandos del proceso para comprobar su archivo YAML. El registro nuevo incluye el momento de arranque para detectar un PID reutilizado.
- **Cuentas.** Las altas se hacen en la consola con el servidor disponible. La contraseña de la cuenta va por la entrada estándar de la herramienta de Dendrite. La consola presenta el usuario creado y omite el token de alta.

## Verificación en Windows 11

- Compilación del frontend y del ejecutable Tauri x64. Se generó el instalador EXE NSIS del cliente con WebView2 preinstalado como requisito.
- Provisión de una base separada en PostgreSQL 17 con un directorio de datos que contiene espacios. Se probó el diagnóstico de la consola mediante su operación en segundo plano, además del arranque, la parada, la edición de red, el alta de cuentas y el rechazo de cambios con el servidor activo.
- Dos sesiones reales del SDK del cliente intercambiaron mensajes y descargaron un archivo con SHA-256. Se repitió mediante la IPv4 privada del mismo PC tras reiniciar la instancia. El ejecutable de escritorio abrió su ventana. La prueba de mensajería usó el SDK, con la UI fuera del recorrido automatizado.
- El enlazador WiX no pudo ejecutar las comprobaciones ICE porque el servicio Windows Installer era inaccesible en este entorno. La entrega 0.2.0 usa el EXE NSIS.

Siguen pendientes la prueba entre dos equipos LAN, la instalación en Windows 11 limpio con Internet desconectado, el reinicio del equipo y de PostgreSQL, restauración, reinstalación y actualización firmada. El servidor de prueba sigue utilizando Dendrite debido al bloqueo de Synapse nativo.
