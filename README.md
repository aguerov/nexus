# NEXUS para Windows 11 x64

Mensajería Matrix sin conexión a Internet. NEXUS 0.3.1 distribuye un cliente de escritorio y una consola de administración para el equipo que aloja el servidor.

| Componente | Ubicación | Uso |
| --- | --- | --- |
| NEXUS Administración | `dist/NEXUS-win64-0.3.1/NEXUS-Administracion.cmd` | Configurar LOCAL o LAN, iniciar y detener Dendrite, habilitar presencia, consultar Matrix y PostgreSQL y crear cuentas. |
| NEXUS Cliente | `dist/installers/NEXUS_0.3.1_x64-setup.exe` | Iniciar sesión, ver la presencia de los contactos y enviar mensajes, archivos y notas de voz. También disponible como `app/nexus-app.exe` en el paquete portable. |

## Primer inicio

1. En el equipo servidor, abre PowerShell 5.1 en el paquete portable y ejecuta `powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File .\scripts\nexus-setup.ps1`. El servidor requiere PostgreSQL 17 en ejecución y permisos para crear los directorios y la base de datos. Si PostgreSQL pide autenticación, consulta la guía para pasar `-PgSuperUser` y `-PgSuperPassword`. Si reutilizas una instancia existente, abre Administración directamente.
2. Abre `NEXUS-Administracion.cmd`, inicia el servidor y crea dos cuentas Matrix. Comparte con cada persona la dirección de conexión, el dominio y su propia cuenta.
3. Abre el cliente y elige **Usuario** o **Administrador** antes de iniciar sesión. Para el acceso administrativo, crea una cuenta con **Administrador Matrix** en la consola del servidor. En LOCAL usa `http://127.0.0.1:8008` y `nexus.local` si conservaste los valores iniciales.
4. Para LAN, detén el servidor desde Administración, cambia el modo, indica una IPv4 privada asignada al equipo y el puerto, aplica e inicia nuevamente. Habilita ese puerto en el Firewall de Windows para la red institucional. En cada cliente selecciona LAN y usa la URL y el dominio que muestra Administración.

El paquete servidor de esta entrega es una vista previa con Dendrite nativo y PostgreSQL preinstalado. El instalador EXE instala el cliente y requiere WebView2 en el equipo. LAN con HTTP está prevista para pruebas en una red controlada. La ruta a Synapse, TLS, E2EE y el instalador integral firmado siguen pendientes.

Consulta [la guía de administración y las verificaciones de esta entrega](docs/09-administracion-y-cliente.md), [el diseño inicial](docs/01-arquitectura-windows11.md) y [los requisitos del proyecto](AGENTS.md).

## Grupos, chats privados y apariencia

- Como administrador Matrix, usa **Grupo por rol** para crear un grupo privado para un equipo o tipo de usuario. En **Administrar acceso** puedes invitar, cambiar el permiso de cada persona a solo lectura, participante o moderador y retirar su acceso. Los permisos se aplican por grupo en Matrix.
- Pulsa el nombre de una persona para abrir su chat privado en una ventana flotante. Usa el botón de minimizar o Escape para dejarlo en la barra inferior. Al reabrirlo aparecen el historial y el borrador. Cada mensaje indica la hora local junto al texto.
- La pestaña **Personas** muestra los contactos de tus salas con los usuarios en línea primero. También puedes buscar una cuenta local por su nombre de usuario. Si Matrix aún no informa su presencia, aparece **Sin estado**.
- Los mensajes enviados a alguien desconectado quedan en Matrix. La persona los recibe al volver y, si es un privado nuevo, al aceptar su invitación.
- El selector de apariencia sigue el tema de Windows por defecto y permite elegir claro u oscuro. La **X** de NEXUS minimiza la aplicación mientras haya una sesión activa. **Cerrar sesión** vuelve al login y revoca el token en Matrix si el servidor está disponible.

Las instalaciones nuevas habilitan la presencia local durante la provisión. Para actualizar un servidor existente, usa la consola nueva y pulsa **Detener**, **Habilitar presencia** e **Iniciar**, en ese orden. Si un cliente pierde la conexión sin cerrar sesión, el estado se actualiza cuando el servidor detecta su ausencia.

## Compilar desde el código

Con Node.js, las dependencias locales, Rust, MSVC y NSIS ya preparados en Windows, ejecuta estos comandos desde el Developer PowerShell x64 de Visual Studio. Elige un directorio de salida nuevo si hay una instancia portable en ejecución.

```powershell
cd nexus-app
$env:CARGO_NET_OFFLINE = 'true'
npm.cmd run tauri -- build --bundles nsis
cd ..
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File .\scripts\pack-runtime.ps1 -OutDir .\dist\NEXUS-win64-0.3.1
```

El instalador se genera en `.cargo-target/release/bundle/nsis/`. El empaquetador también requiere el ejecutable compilado del supervisor y los binarios de Dendrite en el directorio Go configurado.
