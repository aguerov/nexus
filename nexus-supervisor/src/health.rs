//! Comprobaciones de salud locales (sin dependencias HTTP externas).
//! - PostgreSQL: conexión TCP al puerto local.
//! - Homeserver Matrix: GET /_matrix/client/versions y verificar HTTP 200.

use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::time::Duration;

/// Abre una conexión TCP con timeout. Devuelve true si conecta y cierra limpio.
pub fn check_tcp(host: &str, port: u16, timeout: Duration) -> bool {
    let addrs = match (host, port).to_socket_addrs() {
        Ok(a) => a.collect::<Vec<_>>(),
        Err(_) => return false,
    };
    if addrs.is_empty() {
        return false;
    }
    TcpStream::connect_timeout(&addrs[0], timeout).is_ok()
}

pub fn check_postgres(host: &str, port: u16) -> bool {
    check_tcp(host, port, Duration::from_millis(1500))
}

/// Verifica el endpoint de versiones de Matrix. Válido para Synapse, Dendrite o cualquier
/// homeserver compatible: la app no depende de la implementación concreta.
pub fn check_homeserver(host: &str, port: u16) -> bool {
    let addr = format!("{host}:{port}");
    let addrs = match addr.to_socket_addrs() {
        Ok(a) => a.collect::<Vec<_>>(),
        Err(_) => return false,
    };
    if addrs.is_empty() {
        return false;
    }
    let mut stream = match TcpStream::connect_timeout(&addrs[0], Duration::from_millis(2000)) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(3000)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(3000)));

    let req = format!(
        "GET /_matrix/client/versions HTTP/1.1\r\nHost: {host}:{port}\r\nConnection: close\r\nAccept: application/json\r\n\r\n"
    );
    if stream.write_all(req.as_bytes()).is_err() {
        return false;
    }
    let mut buf = [0u8; 256];
    let n = match stream.read(&mut buf) {
        Ok(n) => n,
        Err(_) => return false,
    };
    let head = String::from_utf8_lossy(&buf[..n]);
    head.starts_with("HTTP/1.1 200") || head.starts_with("HTTP/1.0 200")
}
