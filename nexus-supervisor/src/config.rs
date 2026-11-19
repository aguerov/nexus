use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    Local,
    Lan,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NexusConfig {
    pub mode: Mode,
    pub data_dir: PathBuf,
    /// Interfaz donde escucha el homeserver: 127.0.0.1 (LOCAL) o IP privada (LAN).
    pub homeserver_bind: String,
    pub homeserver_port: u16,
    pub server_name: String,
    pub pg_host: String,
    pub pg_port: u16,
}

impl Default for NexusConfig {
    fn default() -> Self {
        Self {
            mode: Mode::Local,
            data_dir: PathBuf::from(r"C:\ProgramData\NEXUS\data"),
            homeserver_bind: "127.0.0.1".into(),
            homeserver_port: 8008,
            server_name: "nexus.local".into(),
            pg_host: "127.0.0.1".into(),
            pg_port: 5432,
        }
    }
}

impl NexusConfig {
    /// Ruta del archivo de configuración del supervisor.
    pub fn config_path() -> PathBuf {
        std::env::var("NEXUS_CONFIG")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from(r"C:\ProgramData\NEXUS\config\nexus.json"))
    }

    /// Carga la configuración; si no existe, devuelve los valores por defecto (MODO LOCAL).
    pub fn load() -> Self {
        let path = Self::config_path();
        match std::fs::read_to_string(&path) {
            // Tolerar BOM UTF-8 (Set-Content de PowerShell 5.1 lo añade).
            Ok(txt) => serde_json::from_str(txt.trim_start_matches('\u{feff}')).unwrap_or_else(|e| {
                eprintln!("[nexus-supervisor] config inválida en {}: {e}. Usando valores por defecto.", path.display());
                Self::default()
            }),
            Err(_) => Self::default(),
        }
    }
}
