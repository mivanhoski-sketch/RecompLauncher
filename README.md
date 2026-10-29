# Recomp Launcher

Launcher para Windows que reúne os **ports nativos para PC feitos por recompilação estática** (recomps) que estão sendo lançados no GitHub, como o [BLACK XBE Recomp](https://github.com/TGP482/BLACK-XBERecomp) e o [UltraTears](https://github.com/kuraeow/ultratears) (Tears of the Kingdom).

- Biblioteca com capas, separada por plataforma (Switch, PS2, Xbox, Xbox 360, N64...) e com busca
- Instala e **atualiza** cada port direto do GitHub Releases do autor original
- Guia o passo a passo de cada jogo: baixar o port → apontar os arquivos do jogo → compilar (quando precisa) → jogar
- Editor dos arquivos de configuração (`.ini`, `.toml`, `.json`...) de cada port
- **Catálogo online**: jogos novos aparecem no launcher assim que entram no [`catalog/catalog.json`](catalog/catalog.json), sem precisar atualizar o app

> **O launcher não distribui nenhum jogo.** Ele só baixa os ports dos repositórios oficiais de cada autor. Os arquivos do jogo (ISO, dump, ROM) vêm da sua própria cópia, obtida legalmente.

---

## Instalação (usuário)

1. Abra a página de [**Releases**](https://github.com/mivanhoski-sketch/RecompLauncher/releases) e baixe `Recomp Launcher_x.y.z_x64-setup.exe`.
2. Execute o instalador. Se o Windows SmartScreen avisar, clique em **Mais informações → Executar assim mesmo** (o app ainda não tem assinatura digital).
3. Abra o **Recomp Launcher**, escolha um jogo e siga a seção **Preparação** da página dele.

Requisitos: Windows 10/11 64-bit com o [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/), que já vem no Windows 11 e o instalador baixa se faltar. Cada jogo tem os próprios requisitos, que aparecem na página dele.

### Onde ficam os arquivos

| O quê | Onde |
|---|---|
| Jogos instalados | `%APPDATA%\com.recomplauncher.app\games\<jogo>` (dá para trocar em **Configurações**) |
| Estado do launcher | `%APPDATA%\com.recomplauncher.app\state.json` |

Nas atualizações, o launcher extrai a versão nova **por cima** da pasta do jogo. Saves, a pasta `assets` e as configurações que você criou continuam lá.

---

## Como adicionar um jogo novo ao catálogo

Edite [`catalog/catalog.json`](catalog/catalog.json) aqui no GitHub e faça o commit. Na próxima vez que alguém abrir o launcher (ou clicar em **Atualizar catálogo**), o jogo já aparece.

```jsonc
{
  "id": "black-xbe",                 // único; vira o nome da pasta (letras, números, - e _)
  "title": "BLACK",
  "platform": "xbox",                // uma chave de "platforms" (adicione plataformas novas lá)
  "year": 2006,
  "repo": "TGP482/BLACK-XBERecomp",  // dono/repositório no GitHub
  "asset": "*.zip",                  // arquivo do release; aceita * (ex.: "*-Windows.zip")
  "exe": "BLACK.exe",                // executável do jogo (procura em subpastas se não estiver na raiz)
  "args": [],                        // argumentos opcionais; aceita {gameFiles} e {installDir}
  "cover": "https://.../capa.jpg",   // opcional; sem capa o launcher desenha uma
  "description": "...",

  // Opcional: arquivos do jogo original que o usuário precisa fornecer
  "gameFiles": {
    "label": "ISO ou arquivos extraídos do jogo",
    "kind": "any",                   // "file", "folder" ou "any"
    "extensions": ["iso"],           // filtro quando for arquivo
    "copyTo": "assets"               // copia para esta subpasta; sem isso, só guarda o caminho
  },

  // Opcional: ports que precisam ser compilados no PC do usuário (ex.: UltraTears)
  "build": {
    "label": "Compilar o jogo",
    "command": "setup.bat",          // roda numa janela de console visível
    "args": ["{gameFiles}"],
    "produces": "UltraTears.exe",    // arquivo que prova que a compilação terminou
    "note": "Leva cerca de 30 minutos..."
  },

  "requirements": ["..."],
  "notes": ["..."]
}
```

O launcher usa o **último release estável** do repositório. Se o projeto só tiver pré-lançamentos (betas), usa o mais recente deles. Por enquanto, só pacotes `.zip` são suportados.

O app baixa o catálogo de
`https://raw.githubusercontent.com/mivanhoski-sketch/RecompLauncher/main/catalog/catalog.json`.
Se estiver offline, usa a última cópia baixada e, na falta dela, a versão embutida no app.

---

## Desenvolvimento

Feito com [Tauri 2](https://v2.tauri.app/) (Rust) + React + TypeScript.

### Pré-requisitos

1. [Node.js](https://nodejs.org/) 20 ou mais novo
2. [Rust](https://rustup.rs/): `winget install Rustlang.Rustup`
3. [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) com a carga de trabalho **Desenvolvimento para desktop com C++**:
   `winget install Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"`

### Comandos

```bash
npm install
npm run tauri dev     # abre o app em modo desenvolvimento
npm run tauri build   # gera o instalador em src-tauri/target/release/bundle/nsis/
npm run dev           # só a interface no navegador, com um backend falso (src/devMock.ts)
```

### Estrutura

```
catalog/catalog.json        catálogo de jogos (também embutido no app como reserva)
src/                        interface React
  App.tsx                   estado global, ações (instalar, compilar, jogar)
  components/               Biblioteca, página do jogo, editor de configs, configurações
src-tauri/src/
  commands.rs               catálogo, GitHub Releases, download/extração, compilação, execução
  store.rs                  jogos instalados e configurações (state.json)
```

### Publicar uma versão

O GitHub Actions compila e cria o instalador automaticamente:

```bash
git tag v0.1.0
git push origin v0.1.0
```

O workflow [`release.yml`](.github/workflows/release.yml) cria um **rascunho** de release com o instalador. Revise e publique na página de Releases. Cada push na `main` também gera o instalador como artefato do workflow [`build.yml`](.github/workflows/build.yml).

---

## Créditos

Todo o trabalho de recompilação é dos autores de cada port, com links na página de cada jogo. Este projeto não é afiliado a Nintendo, Sony, Microsoft, EA ou qualquer outra detentora dos jogos.
