//! Provisión del entorno local.
//! 1. Crear estructura de directorios (data, homeserver, media, logs, backups).
//! 2. Generar `nexus.json` con valores por defecto si no existe.
//! 3. (Pendiente instalador) initdb/creación de BD, secretos, config del homeserver,
//!    registro de servicios Windows y health checks de arranque.

use crate::config::NexusConfig;
use crate::{health, NexusPaths};
use std::time::Duration;

/// Crea la estructura de directorios y la configuración inicial (idempotente).
pub fn init(paths: &NexusPaths) {
    for dir in [
        &paths.base_dir,
        &paths.pg_data,
        &paths.homeserver_data,
        &paths.media_dir,
        &paths.logs_dir,
        &paths.backups_dir,
    ] {
        if let Err(e) = std::fs::create_dir_all(dir) {
            eprintln!("[nexus-supervisor] no se pudo crear {}: {e}", dir.display());
        }
    }

    let cfg_path = NexusConfig::config_path();
    if !cfg_path.exists() {
        if let Some(parent) = cfg_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let cfg = NexusConfig::default();
        match serde_json::to_string_pretty(&cfg) {
            Ok(json) => {
                if let Err(e) = std::fs::write(&cfg_path, json) {
                    eprintln!("[nexus-supervisor] no se pudo escribir {}: {e}", cfg_path.display());
                } else {
                    println!("[nexus-supervisor] configuración creada: {}", cfg_path.display());
                }
            }
            Err(e) => eprintln!("[nexus-supervisor] no se pudo serializar la configuración: {e}"),
        }
    } else {
        println!("[nexus-supervisor] configuración existente: {}", cfg_path.display());
    }
}

/// Arranque ordenado. El instalador registra PostgreSQL y el homeserver como servicios
/// de Windows; aquí solo verificamos su disponibilidad y damos diagnóstico claro.
pub fn start(cfg: &NexusConfig, _paths: &NexusPaths) {
    if health::check_postgres(&cfg.pg_host, cfg.pg_port) {
        println!("[nexus-supervisor] PostgreSQL OK en {}:{}", cfg.pg_host, cfg.pg_port);
    } else {
        eprintln!(
            "[nexus-supervisor] PostgreSQL no responde en {}:{}. Inicia el servicio: Start-Service postgresql-X64-17",
            cfg.pg_host, cfg.pg_port
        );
    }

    let mut hs_ok = false;
    for _ in 0..10 {
        if health::check_homeserver(&cfg.homeserver_bind, cfg.homeserver_port) {
            hs_ok = true;
            break;
        }
        std::thread::sleep(Duration::from_millis(500));
    }
    if hs_ok {
        println!(
            "[nexus-supervisor] homeserver Matrix OK: http://{}:{}",
            cfg.homeserver_bind, cfg.homeserver_port
        );
    } else {
        eprintln!(
            "[nexus-supervisor] homeserver Matrix no responde en http://{}:{}. Revisa el servicio NEXUS Homeserver.",
            cfg.homeserver_bind, cfg.homeserver_port
        );
    }
}

/// Parada ordenada (los servicios Windows los detiene el instalador/servicio).
pub fn stop(cfg: &NexusConfig, _paths: &NexusPaths) {
    println!(
        "[nexus-supervisor] stop: detén los servicios en orden inverso (homeserver y luego PostgreSQL). Puerto homeserver={} puerto pg={}.",
        cfg.homeserver_port, cfg.pg_port
    );
}
