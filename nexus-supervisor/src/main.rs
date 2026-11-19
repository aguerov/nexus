//! NEXUS Supervisor
//! Responsabilidades: provisión inicial, generación de secretos, arranque/parada ordenada,
//! health checks de PostgreSQL y del homeserver Matrix, y exposición de estado para el cliente.
//! Objetivo: ejecutar en Windows 11 sin Docker, como proceso controlado o servicio Windows.

use std::path::PathBuf;

mod config;
mod health;
mod provision;

#[derive(Debug, Clone)]
pub struct NexusPaths {
    pub base_dir: PathBuf, // directorio de datos configurable
    pub pg_data: PathBuf,
    pub homeserver_data: PathBuf,
    pub media_dir: PathBuf,
    pub logs_dir: PathBuf,
    pub backups_dir: PathBuf,
}

impl NexusPaths {
    pub fn from_data_dir(base: &std::path::Path) -> Self {
        Self {
            base_dir: base.to_path_buf(),
            pg_data: base.join("postgres"),
            homeserver_data: base.join("homeserver"),
            media_dir: base.join("media"),
            logs_dir: base.join("logs"),
            backups_dir: base.join("backups"),
        }
    }
}

fn status_json(cfg: &config::NexusConfig) -> String {
    let pg = health::check_postgres(&cfg.pg_host, cfg.pg_port);
    let hs = health::check_homeserver(&cfg.homeserver_bind, cfg.homeserver_port);
    format!(
        "{{\"mode\":\"{:?}\",\"postgres\":\"{}\",\"homeserver\":\"{}\",\"homeserver_url\":\"http://{}:{}\",\"server_name\":\"{}\"}}",
        cfg.mode,
        if pg { "ready" } else { "down" },
        if hs { "ready" } else { "down" },
        cfg.homeserver_bind,
        cfg.homeserver_port,
        cfg.server_name
    )
    .to_lowercase()
}

fn main() {
    // CLI: init | start | stop | status | health | paths
    let args: Vec<String> = std::env::args().collect();
    let cmd = args.get(1).map(|s| s.as_str()).unwrap_or("help");
    let cfg = config::NexusConfig::load();
    let paths = NexusPaths::from_data_dir(&cfg.data_dir);

    match cmd {
        "init" => {
            println!("[nexus-supervisor] init: creando estructura de datos en {}", cfg.data_dir.display());
            provision::init(&paths);
            println!("[nexus-supervisor] init: estructura creada (BD y homeserver requieren binarios empaquetados).");
        }
        "start" => {
            println!("[nexus-supervisor] start: iniciar PostgreSQL -> esperar salud -> iniciar homeserver -> health checks.");
            provision::start(&cfg, &paths);
        }
        "stop" => {
            println!("[nexus-supervisor] stop: detener homeserver -> detener PostgreSQL de forma ordenada.");
            provision::stop(&cfg, &paths);
        }
        "status" | "health" => {
            println!("{}", status_json(&cfg));
            if !health::check_postgres(&cfg.pg_host, cfg.pg_port) {
                eprintln!("[nexus-supervisor] PostgreSQL no responde en {}:{}", cfg.pg_host, cfg.pg_port);
            }
            if !health::check_homeserver(&cfg.homeserver_bind, cfg.homeserver_port) {
                eprintln!(
                    "[nexus-supervisor] homeserver Matrix no responde en http://{}:{}/_matrix/client/versions",
                    cfg.homeserver_bind, cfg.homeserver_port
                );
            }
        }
        "paths" => {
            println!(
                "{{\"base\":\"{}\",\"postgres\":\"{}\",\"homeserver\":\"{}\",\"media\":\"{}\",\"logs\":\"{}\",\"backups\":\"{}\"}}",
                paths.base_dir.display(),
                paths.pg_data.display(),
                paths.homeserver_data.display(),
                paths.media_dir.display(),
                paths.logs_dir.display(),
                paths.backups_dir.display()
            );
        }
        _ => {
            eprintln!("Uso: nexus-supervisor <init|start|stop|status|health|paths>");
            std::process::exit(2);
        }
    }
}
