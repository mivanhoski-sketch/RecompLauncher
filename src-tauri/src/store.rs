//! Estado persistido do launcher: jogos instalados e configurações (state.json).

use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs, path::PathBuf};

#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct InstalledGame {
    /// Tag do release instalado (ex.: "V2").
    pub version: String,
    pub asset: String,
    pub installed_at: u64,
    /// Pasta da instalação (guardada para continuar valendo se a pasta da biblioteca mudar).
    #[serde(default)]
    pub path: Option<String>,
    /// Caminho que o usuário escolheu para os arquivos do jogo original (ISO, pasta, dump).
    #[serde(default)]
    pub game_files: Option<String>,
    /// Versão para a qual a etapa de compilação terminou com sucesso (jogos com "build").
    #[serde(default)]
    pub built_version: Option<String>,
}

pub const DEFAULT_CATALOG_URL: &str =
    "https://raw.githubusercontent.com/mivanhoski-sketch/RecompLauncher/main/catalog/catalog.json";

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// URL do catalog.json remoto. Vazio = usa só o catálogo embutido no app.
    pub catalog_url: String,
    /// Pasta onde os jogos são instalados. Vazio = pasta de dados do app.
    pub library_dir: Option<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Settings { catalog_url: DEFAULT_CATALOG_URL.into(), library_dir: None }
    }
}

#[derive(Serialize, Deserialize, Default)]
#[serde(default)]
struct Persisted {
    installed: HashMap<String, InstalledGame>,
    settings: Settings,
}

pub struct Store {
    pub data_dir: PathBuf,
    pub installed: HashMap<String, InstalledGame>,
    pub settings: Settings,
}

impl Store {
    pub fn load(data_dir: PathBuf) -> Self {
        let p: Persisted = fs::read_to_string(data_dir.join("state.json"))
            .ok()
            .and_then(|t| serde_json::from_str(&t).ok())
            .unwrap_or_default();
        Store { data_dir, installed: p.installed, settings: p.settings }
    }

    pub fn save(&self) -> Result<(), String> {
        let p = Persisted { installed: self.installed.clone(), settings: self.settings.clone() };
        let json = serde_json::to_string_pretty(&p).map_err(|e| e.to_string())?;
        let tmp = self.data_dir.join("state.json.tmp");
        fs::write(&tmp, json).map_err(|e| e.to_string())?;
        fs::rename(&tmp, self.data_dir.join("state.json")).map_err(|e| e.to_string())
    }

    pub fn games_dir(&self) -> PathBuf {
        match self.settings.library_dir.as_deref().map(str::trim) {
            Some(dir) if !dir.is_empty() => PathBuf::from(dir),
            _ => self.data_dir.join("games"),
        }
    }

    pub fn install_dir(&self, id: &str) -> PathBuf {
        match self.installed.get(id).and_then(|g| g.path.as_deref()) {
            Some(p) => PathBuf::from(p),
            None => self.games_dir().join(id),
        }
    }
}
