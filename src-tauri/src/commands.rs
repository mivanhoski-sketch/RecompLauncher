//! Comandos chamados pela interface: catálogo, releases do GitHub, instalação, compilação e execução.

use crate::store::{InstalledGame, Settings, Store};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    process::Command,
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::AsyncWriteExt;

type Shared<'a> = State<'a, Mutex<Store>>;
type Res<T> = Result<T, String>;

const BUNDLED_CATALOG: &str = include_str!("../../catalog/catalog.json");
const USER_AGENT: &str = concat!("RecompLauncher/", env!("CARGO_PKG_VERSION"));
const CONFIG_EXTENSIONS: &[&str] = &["ini", "toml", "cfg", "json", "yaml", "yml", "conf"];

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn http() -> Res<reqwest::Client> {
    reqwest::Client::builder().user_agent(USER_AGENT).build().map_err(err)
}

/// IDs do catálogo viram nomes de pasta, então só aceitamos caracteres seguros.
fn check_id(id: &str) -> Res<()> {
    if !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        Ok(())
    } else {
        Err(format!("ID de jogo inválido: {id}"))
    }
}

/// Junta um caminho relativo vindo do catálogo/UI sem permitir sair da pasta base.
fn safe_join(base: &Path, rel: &str) -> Res<PathBuf> {
    let p = Path::new(rel);
    if p.components().any(|c| !matches!(c, Component::Normal(_) | Component::CurDir)) {
        return Err(format!("Caminho inválido: {rel}"));
    }
    Ok(base.join(p))
}

fn walk(dir: &Path, depth: usize, out: &mut Vec<PathBuf>) -> std::io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let p = entry?.path();
        if p.is_dir() {
            if depth > 0 {
                walk(&p, depth - 1, out)?;
            }
        } else {
            out.push(p);
        }
    }
    Ok(())
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Progress<'a> {
    id: &'a str,
    stage: &'a str,
    done: u64,
    total: u64,
}

fn emit(app: &AppHandle, id: &str, stage: &str, done: u64, total: u64) {
    let _ = app.emit("progress", Progress { id, stage, done, total });
}

// ---------------------------------------------------------------- estado

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppState {
    installed: HashMap<String, InstalledGame>,
    settings: Settings,
    games_dir: String,
}

#[tauri::command]
pub fn get_state(store: Shared<'_>) -> AppState {
    let s = store.lock().unwrap();
    AppState {
        installed: s.installed.clone(),
        settings: s.settings.clone(),
        games_dir: s.games_dir().to_string_lossy().into_owned(),
    }
}

#[tauri::command]
pub fn save_settings(store: Shared<'_>, settings: Settings) -> Res<()> {
    let mut s = store.lock().unwrap();
    s.settings = settings;
    s.save()
}

// ---------------------------------------------------------------- catálogo

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogResult {
    catalog: serde_json::Value,
    source: &'static str,
    error: Option<String>,
}

async fn fetch_json(url: &str) -> Res<serde_json::Value> {
    http()?
        .get(url)
        .send()
        .await
        .map_err(err)?
        .error_for_status()
        .map_err(err)?
        .json()
        .await
        .map_err(err)
}

/// Busca o catálogo remoto; se falhar, usa o último que deu certo e, por fim, o embutido no app.
#[tauri::command]
pub async fn load_catalog(store: Shared<'_>) -> Res<CatalogResult> {
    let (url, cache) = {
        let s = store.lock().unwrap();
        (s.settings.catalog_url.trim().to_string(), s.data_dir.join("catalog_cache.json"))
    };
    let bundled = || -> Res<serde_json::Value> { serde_json::from_str(BUNDLED_CATALOG).map_err(err) };
    if url.is_empty() {
        return Ok(CatalogResult { catalog: bundled()?, source: "bundled", error: None });
    }
    match fetch_json(&url).await {
        Ok(v) if v.get("games").is_some() => {
            let _ = fs::write(&cache, v.to_string());
            Ok(CatalogResult { catalog: v, source: "remote", error: None })
        }
        result => {
            let error = Some(match result {
                Err(e) => e,
                Ok(_) => "O catálogo remoto não tem a lista \"games\"".into(),
            });
            let cached = fs::read_to_string(&cache).ok().and_then(|t| serde_json::from_str(&t).ok());
            match cached {
                Some(v) => Ok(CatalogResult { catalog: v, source: "cache", error }),
                None => Ok(CatalogResult { catalog: bundled()?, source: "bundled", error }),
            }
        }
    }
}

// ---------------------------------------------------------------- releases

#[derive(Serialize, Deserialize, Clone)]
pub struct Asset {
    name: String,
    browser_download_url: String,
    #[serde(default)]
    size: u64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Release {
    tag_name: String,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    body: Option<String>,
    #[serde(default)]
    published_at: Option<String>,
    html_url: String,
    #[serde(default)]
    prerelease: bool,
    #[serde(default)]
    draft: bool,
    assets: Vec<Asset>,
}

/// Último release estável; se o projeto só tiver pré-lançamentos (betas), usa o mais recente deles.
async fn fetch_latest(repo: &str) -> Res<Release> {
    let valid = repo.split('/').count() == 2
        && repo.chars().all(|c| c.is_ascii_alphanumeric() || "-_./".contains(c));
    if !valid {
        return Err(format!("Repositório inválido: {repo}"));
    }
    let resp = http()?
        .get(format!("https://api.github.com/repos/{repo}/releases?per_page=10"))
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(err)?;
    if resp.status().as_u16() == 403 || resp.status().as_u16() == 429 {
        return Err("Limite de consultas ao GitHub atingido. Tente de novo em alguns minutos.".into());
    }
    let list: Vec<Release> = resp.error_for_status().map_err(err)?.json().await.map_err(err)?;
    list.iter()
        .find(|r| !r.draft && !r.prerelease)
        .or_else(|| list.iter().find(|r| !r.draft))
        .cloned()
        .ok_or_else(|| "Este projeto ainda não publicou nenhum release".into())
}

#[tauri::command]
pub async fn latest_release(repo: String) -> Res<Release> {
    fetch_latest(&repo).await
}

/// Casa nomes de arquivo com padrões simples tipo "*-Windows.zip" (sem diferenciar maiúsculas).
fn wildcard(pattern: &str, name: &str) -> bool {
    let (p, n) = (pattern.to_lowercase(), name.to_lowercase());
    let parts: Vec<&str> = p.split('*').collect();
    if parts.len() == 1 {
        return p == n;
    }
    let mut pos = 0;
    for (i, part) in parts.iter().enumerate() {
        if part.is_empty() {
            continue;
        }
        if i == 0 {
            if !n.starts_with(part) {
                return false;
            }
            pos = part.len();
        } else if i == parts.len() - 1 {
            return n.len() >= pos + part.len() && n.ends_with(part);
        } else {
            match n[pos..].find(part) {
                Some(f) => pos += f + part.len(),
                None => return false,
            }
        }
    }
    true
}

// ---------------------------------------------------------------- instalação

async fn download(app: &AppHandle, id: &str, url: &str, dest: &Path, expected: u64) -> Res<()> {
    let resp = http()?.get(url).send().await.map_err(err)?.error_for_status().map_err(err)?;
    let total = resp.content_length().unwrap_or(expected);
    let mut file = tokio::fs::File::create(dest).await.map_err(err)?;
    let mut stream = resp.bytes_stream();
    let (mut done, mut last) = (0u64, 0u64);
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(err)?;
        file.write_all(&chunk).await.map_err(err)?;
        done += chunk.len() as u64;
        if done - last >= 512 * 1024 {
            emit(app, id, "download", done, total);
            last = done;
        }
    }
    file.flush().await.map_err(err)?;
    emit(app, id, "download", done, total.max(done));
    Ok(())
}

/// Extrai o zip por cima da instalação atual (preserva saves, assets e configs que não vêm no zip).
/// Se tudo estiver dentro de uma única pasta raiz, ela é "achatada".
fn extract_zip(app: &AppHandle, id: &str, zip_path: &Path, dest: &Path) -> Res<()> {
    let mut archive = zip::ZipArchive::new(fs::File::open(zip_path).map_err(err)?).map_err(err)?;
    let total = archive.len() as u64;

    let mut root: Option<PathBuf> = None;
    let mut single_root = true;
    for i in 0..archive.len() {
        let f = archive.by_index(i).map_err(err)?;
        let Some(p) = f.enclosed_name() else { continue };
        let mut comps = p.components();
        let Some(first) = comps.next().map(|c| PathBuf::from(c.as_os_str())) else { continue };
        if comps.next().is_none() && !f.is_dir() {
            single_root = false;
            break;
        }
        if let Some(r) = &root {
            if *r != first {
                single_root = false;
                break;
            }
        } else {
            root = Some(first);
        }
    }
    let strip = if single_root { root } else { None };

    fs::create_dir_all(dest).map_err(err)?;
    for i in 0..archive.len() {
        let mut f = archive.by_index(i).map_err(err)?;
        let Some(rel) = f.enclosed_name() else { continue };
        let rel = match &strip {
            Some(r) if rel.starts_with(r) => rel.strip_prefix(r).unwrap().to_path_buf(),
            _ => rel,
        };
        if rel.as_os_str().is_empty() {
            continue;
        }
        let out = dest.join(&rel);
        if f.is_dir() {
            fs::create_dir_all(&out).map_err(err)?;
        } else {
            if let Some(parent) = out.parent() {
                fs::create_dir_all(parent).map_err(err)?;
            }
            let mut o = fs::File::create(&out)
                .map_err(|e| format!("{e} ({}). O jogo está aberto?", out.display()))?;
            std::io::copy(&mut f, &mut o).map_err(err)?;
        }
        if i % 25 == 0 || i as u64 + 1 == total {
            emit(app, id, "extract", i as u64 + 1, total);
        }
    }
    Ok(())
}

/// Instala ou atualiza: baixa o asset do último release e extrai na pasta do jogo.
#[tauri::command]
pub async fn install_game(
    app: AppHandle,
    store: Shared<'_>,
    id: String,
    repo: String,
    asset: Option<String>,
) -> Res<InstalledGame> {
    check_id(&id)?;
    emit(&app, &id, "release", 0, 1);
    let release = fetch_latest(&repo).await?;
    let chosen = release
        .assets
        .iter()
        .find(|a| match &asset {
            Some(p) => wildcard(p, &a.name),
            None => a.name.to_lowercase().ends_with(".zip"),
        })
        .cloned()
        .ok_or_else(|| format!("O release {} não tem um arquivo para Windows compatível", release.tag_name))?;
    if !chosen.name.to_lowercase().ends_with(".zip") {
        return Err(format!("Por enquanto só pacotes .zip são suportados ({})", chosen.name));
    }

    // Download temporário fica na pasta da biblioteca atual; atualizações reaproveitam a pasta já instalada.
    let (games_dir, install_dir) = {
        let s = store.lock().unwrap();
        (s.games_dir(), s.install_dir(&id))
    };
    let downloads = games_dir.join(".downloads");
    fs::create_dir_all(&downloads).map_err(err)?;
    let zip_path = downloads.join(format!("{id}.zip"));
    download(&app, &id, &chosen.browser_download_url, &zip_path, chosen.size).await?;

    let (app2, id2, zp, dir) = (app.clone(), id.clone(), zip_path.clone(), install_dir.clone());
    tauri::async_runtime::spawn_blocking(move || extract_zip(&app2, &id2, &zp, &dir))
        .await
        .map_err(err)??;
    let _ = fs::remove_file(&zip_path);

    let mut s = store.lock().unwrap();
    let previous = s.installed.get(&id).cloned().unwrap_or_default();
    let entry = InstalledGame {
        version: release.tag_name.clone(),
        asset: chosen.name.clone(),
        installed_at: now(),
        path: Some(install_dir.to_string_lossy().into_owned()),
        game_files: previous.game_files,
        built_version: previous.built_version,
    };
    s.installed.insert(id.clone(), entry.clone());
    s.save()?;
    emit(&app, &id, "done", 1, 1);
    Ok(entry)
}

#[tauri::command]
pub fn uninstall_game(store: Shared<'_>, id: String) -> Res<()> {
    check_id(&id)?;
    let mut s = store.lock().unwrap();
    let dir = s.install_dir(&id);
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| format!("{e}. O jogo está aberto?"))?;
    }
    s.installed.remove(&id);
    s.save()
}

/// Copia um arquivo (ISO) ou o conteúdo de uma pasta para dentro de `target`, com progresso.
fn copy_into(app: &AppHandle, id: &str, src: &Path, target: &Path) -> Res<()> {
    fs::create_dir_all(target).map_err(err)?;
    if let (Ok(a), Ok(b)) = (src.canonicalize(), target.canonicalize()) {
        if a.starts_with(&b) || b.starts_with(&a) {
            return Ok(()); // já está no lugar certo
        }
    }
    let (files, base) = if src.is_dir() {
        let mut v = Vec::new();
        walk(src, usize::MAX, &mut v).map_err(err)?;
        (v, src.to_path_buf())
    } else {
        (vec![src.to_path_buf()], src.parent().map(Path::to_path_buf).unwrap_or_default())
    };
    let total: u64 = files.iter().filter_map(|f| f.metadata().ok()).map(|m| m.len()).sum();
    let (mut done, mut last) = (0u64, 0u64);
    let mut buf = vec![0u8; 4 << 20];
    for f in &files {
        let out = target.join(f.strip_prefix(&base).map_err(err)?);
        if let Some(parent) = out.parent() {
            fs::create_dir_all(parent).map_err(err)?;
        }
        let mut r = fs::File::open(f).map_err(err)?;
        let mut w = fs::File::create(&out).map_err(err)?;
        loop {
            let n = r.read(&mut buf).map_err(err)?;
            if n == 0 {
                break;
            }
            w.write_all(&buf[..n]).map_err(err)?;
            done += n as u64;
            if done - last >= 16 << 20 {
                emit(app, id, "copy", done, total);
                last = done;
            }
        }
    }
    emit(app, id, "copy", total, total);
    Ok(())
}

/// Registra onde estão os arquivos do jogo original e, se o catálogo pedir (`copyTo`), copia para a instalação.
#[tauri::command]
pub async fn set_game_files(
    app: AppHandle,
    store: Shared<'_>,
    id: String,
    source: String,
    copy_to: Option<String>,
) -> Res<InstalledGame> {
    check_id(&id)?;
    let install_dir = store.lock().unwrap().install_dir(&id);
    if let Some(rel) = copy_to.filter(|r| !r.trim().is_empty()) {
        let target = safe_join(&install_dir, &rel)?;
        let (app2, id2, src) = (app.clone(), id.clone(), PathBuf::from(&source));
        tauri::async_runtime::spawn_blocking(move || copy_into(&app2, &id2, &src, &target))
            .await
            .map_err(err)??;
    }
    let mut s = store.lock().unwrap();
    let entry = s.installed.get_mut(&id).ok_or("Instale o jogo primeiro")?;
    entry.game_files = Some(source);
    let result = entry.clone();
    s.save()?;
    emit(&app, &id, "done", 1, 1);
    Ok(result)
}

// ---------------------------------------------------------------- compilar e jogar

/// Procura um arquivo pelo caminho indicado no catálogo; se não achar, pelo nome em subpastas.
fn find_file(dir: &Path, rel: &str) -> Option<PathBuf> {
    let direct = safe_join(dir, rel).ok()?;
    if direct.is_file() {
        return Some(direct);
    }
    let name = Path::new(rel).file_name()?.to_string_lossy().to_lowercase();
    let mut files = Vec::new();
    walk(dir, 3, &mut files).ok()?;
    files.into_iter().find(|f| {
        f.file_name().map(|n| n.to_string_lossy().to_lowercase() == name).unwrap_or(false)
    })
}

fn find_exe(dir: &Path, exe: &str) -> Res<PathBuf> {
    if !exe.is_empty() {
        if let Some(p) = find_file(dir, exe) {
            return Ok(p);
        }
    }
    // Sem nome certo no catálogo: aceita se houver um único .exe na raiz.
    let exes: Vec<PathBuf> = fs::read_dir(dir)
        .map_err(err)?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().map(|x| x.eq_ignore_ascii_case("exe")).unwrap_or(false))
        .collect();
    match exes.as_slice() {
        [only] => Ok(only.clone()),
        _ => Err(format!("Executável \"{exe}\" não encontrado em {}", dir.display())),
    }
}

fn expand_args(args: &[String], install_dir: &Path, game_files: &str) -> Vec<String> {
    args.iter()
        .map(|a| {
            a.replace("{installDir}", &install_dir.to_string_lossy())
                .replace("{gameFiles}", game_files)
        })
        .collect()
}

fn install_info(store: &Shared<'_>, id: &str) -> Res<(PathBuf, String)> {
    let s = store.lock().unwrap();
    let game = s.installed.get(id).ok_or("O jogo não está instalado")?;
    Ok((s.install_dir(id), game.game_files.clone().unwrap_or_default()))
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BuildFinished {
    id: String,
    success: bool,
    message: String,
}

/// Roda a etapa de compilação (ex.: setup.bat do UltraTears) numa janela de console visível.
/// Quando o processo termina e o executável final existe, marca a versão como compilada.
#[tauri::command]
pub fn build_game(
    app: AppHandle,
    store: Shared<'_>,
    id: String,
    command: String,
    args: Vec<String>,
    produces: Option<String>,
) -> Res<()> {
    check_id(&id)?;
    let (dir, game_files) = install_info(&store, &id)?;
    let script = find_file(&dir, &command).ok_or_else(|| format!("{command} não encontrado na instalação"))?;
    let workdir = script.parent().unwrap_or(&dir).to_path_buf();
    let args = expand_args(&args, &dir, &game_files);

    #[cfg(windows)]
    let mut child = {
        use std::os::windows::process::CommandExt;
        const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;
        // cmd /c ""script" "arg1" "arg2"" — aspas externas exigidas pelo cmd quando há espaços.
        let quoted: Vec<String> = std::iter::once(script.to_string_lossy().into_owned())
            .chain(args)
            .map(|a| format!("\"{a}\""))
            .collect();
        Command::new("cmd")
            .raw_arg(format!("/c \"{}\"", quoted.join(" ")))
            .current_dir(&workdir)
            .creation_flags(CREATE_NEW_CONSOLE)
            .spawn()
            .map_err(err)?
    };
    #[cfg(not(windows))]
    let mut child = Command::new(&script).args(args).current_dir(&workdir).spawn().map_err(err)?;

    std::thread::spawn(move || {
        let status = child.wait();
        let built = produces.as_deref().map(|p| find_file(&dir, p).is_some()).unwrap_or(true);
        let success = matches!(&status, Ok(s) if s.success()) && built;
        let message = match (&status, built) {
            (Err(e), _) => e.to_string(),
            (_, false) => "A compilação terminou, mas o executável do jogo não foi gerado. Veja a janela do console.".into(),
            (Ok(s), _) if !s.success() => format!("A compilação terminou com erro ({s})."),
            _ => "Compilação concluída!".into(),
        };
        if success {
            let state = app.state::<Mutex<Store>>();
            let mut s = state.lock().unwrap();
            if let Some(g) = s.installed.get_mut(&id) {
                g.built_version = Some(g.version.clone());
            }
            let _ = s.save();
        }
        let _ = app.emit("build-finished", BuildFinished { id, success, message });
    });
    Ok(())
}

#[tauri::command]
pub fn launch_game(store: Shared<'_>, id: String, exe: String, args: Vec<String>) -> Res<()> {
    check_id(&id)?;
    let (dir, game_files) = install_info(&store, &id)?;
    let exe_path = find_exe(&dir, &exe)?;
    Command::new(&exe_path)
        .args(expand_args(&args, &dir, &game_files))
        .current_dir(exe_path.parent().unwrap_or(&dir))
        .spawn()
        .map_err(err)?;
    Ok(())
}

#[tauri::command]
pub fn open_game_dir(store: Shared<'_>, id: String, sub: Option<String>) -> Res<()> {
    check_id(&id)?;
    let dir = store.lock().unwrap().install_dir(&id);
    let target = match sub.filter(|s| !s.is_empty()) {
        Some(rel) => safe_join(&dir, &rel)?,
        None => dir,
    };
    fs::create_dir_all(&target).map_err(err)?;
    Command::new("explorer").arg(&target).spawn().map_err(err)?;
    Ok(())
}

// ---------------------------------------------------------------- arquivos de configuração

/// Lista arquivos de configuração (ini, toml, json...) até 2 níveis dentro da instalação.
#[tauri::command]
pub fn list_config_files(store: Shared<'_>, id: String) -> Res<Vec<String>> {
    check_id(&id)?;
    let dir = store.lock().unwrap().install_dir(&id);
    let mut files = Vec::new();
    if dir.exists() {
        walk(&dir, 2, &mut files).map_err(err)?;
    }
    let mut out: Vec<String> = files
        .iter()
        .filter(|f| {
            let ext = f.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
            CONFIG_EXTENSIONS.contains(&ext.as_str())
                && f.metadata().map(|m| m.len() < 1 << 20).unwrap_or(false)
        })
        .filter_map(|f| f.strip_prefix(&dir).ok())
        .map(|p| p.to_string_lossy().replace('\\', "/"))
        .collect();
    out.sort();
    Ok(out)
}

#[tauri::command]
pub fn read_game_file(store: Shared<'_>, id: String, path: String) -> Res<Option<String>> {
    check_id(&id)?;
    let file = safe_join(&store.lock().unwrap().install_dir(&id), &path)?;
    if !file.exists() {
        return Ok(None);
    }
    fs::read_to_string(file).map(Some).map_err(err)
}

#[tauri::command]
pub fn write_game_file(store: Shared<'_>, id: String, path: String, contents: String) -> Res<()> {
    check_id(&id)?;
    let file = safe_join(&store.lock().unwrap().install_dir(&id), &path)?;
    if let Some(parent) = file.parent() {
        fs::create_dir_all(parent).map_err(err)?;
    }
    fs::write(file, contents).map_err(err)
}
