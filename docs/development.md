# Cue 개발과 배포

사용 방법은 [README](../README.md)에 있습니다. 이 문서는 코드를 빌드하거나 새 버전을 배포할 때 참고하세요.

## 로컬 개발

macOS 13 이상, Xcode Command Line Tools(Swift), Rust, Node.js, pnpm이 필요합니다.

```sh
pnpm install --frozen-lockfile
npm run dev
npm run check
npm test
cargo test --manifest-path src-tauri/Cargo.toml
```

## 업데이트 서명키

앱 업데이트는 Apple 계정 없이 준비할 수 있습니다. Tauri 업데이트 서명은 Apple Developer ID 서명·공증과 별개입니다. 개발 프리뷰는 ad-hoc 앱 서명을 사용합니다.

관리자의 기본 키 위치는 `~/.config/cue-signing/updater.key`입니다. 이 프로젝트를 준비한 Mac에는 키를 생성했습니다. 개인키는 저장소에 넣지 말고 별도로 안전하게 백업하세요. 앱 설정에는 공개키만 들어갑니다. 이미 배포한 앱이 있으면 키를 새로 만들거나 공개키만 교체하지 마세요. 기존 사용자의 업데이트 검증이 실패합니다.

새 프로젝트를 처음 준비할 때만 다음 명령으로 키를 만들고 `.pub` 내용을 `src-tauri/tauri.conf.json`의 `plugins.updater.pubkey`에 설정합니다.

```sh
mkdir -p ~/.config/cue-signing
npm run tauri signer generate -- -w ~/.config/cue-signing/updater.key
```

`npm run build`는 기본 키 파일 또는 `TAURI_SIGNING_PRIVATE_KEY` 환경변수를 사용합니다. 암호가 있는 키라면 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`도 설정하세요. 개인키 내용을 채팅·로그·소스에 붙여 넣지 마세요.

```sh
npm run build
```

결과물은 `src-tauri/target/release/bundle/`에 생성됩니다.

- `dmg/*.dmg`: 처음 설치할 때 쓰는 파일
- `macos/Cue.app.tar.gz`와 `.sig`: 앱 내부 업데이트용 파일과 서명

## GitHub 배포 준비

현재 배포 경로는 공개 저장소 `HooniKims/lecture_shortcut_mac`입니다. 앱은 Releases의 `latest.json`을 조회합니다. 아직 공개 Release가 없으면 앱에 배포 정보를 찾지 못했다는 안내가 나옵니다. Git push만으로 사용자 앱이 업데이트되지는 않습니다.

1. 저장소 Settings → Secrets and variables → Actions에 `TAURI_SIGNING_PRIVATE_KEY`를 등록합니다. 반드시 앱의 공개키와 짝이 맞는 기존 개인키를 사용하세요. 암호를 설정했다면 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`도 등록합니다.
2. `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`의 버전을 함께 올리고 lockfile을 갱신합니다. 정식 출시 전에는 `0.x.y`를 사용합니다.
3. 코드를 push한 뒤 Actions에서 **Prepare macOS release**를 실행합니다. tag에는 앱 버전과 같은 값(예: `v0.2.0`)을 입력합니다.
4. 생성된 **초안(draft)** Release에서 DMG, `.app.tar.gz`, `.sig`, `latest.json`을 확인합니다. `release-notes/<앱 버전>.md`에 사용자용 변경 내용을 먼저 작성합니다. 워크플로는 이 파일을 Release 본문과 `latest.json`의 notes에 함께 넣으며, 파일이 없거나 비어 있으면 중단합니다.
5. DMG 설치와 이전 버전의 앱 내부 업데이트를 검증한 뒤 초안을 공개합니다. 이 단계부터 사용자의 업데이트 확인에 표시됩니다.

워크플로는 Apple Silicon(`aarch64-apple-darwin`)용만 만듭니다. Intel 및 Windows 배포는 아직 준비하지 않았습니다. 네이티브 Swift helper도 빌드에 포함됩니다. `releases/latest` 경로를 사용하므로 개발 프리뷰는 앱과 문서에서 표시하고, GitHub의 **Set as a pre-release**는 체크하지 않습니다. 테스트 전용 별도 채널이 필요해지면 endpoint를 분리하세요.

## 설치 동작과 복구

업데이터가 HTTPS로 파일을 내려받고 Tauri 서명을 검증합니다. macOS 설치는 앱과 같은 디스크에 임시 폴더를 만들고 앱 종류·버전·코드 서명을 확인한 뒤 교체합니다. macOS의 원자적 교환 기능으로 기존 앱과 새 앱의 위치를 한 번에 바꿉니다. 교환이 실패하면 기존 앱을 유지하며, 작업 도중 프로세스가 종료되어도 원래 설치 경로에는 기존 앱 또는 새 앱이 남습니다. 원자적 교환을 지원하지 않는 파일 시스템에서는 설치를 중단합니다. 쓰기 권한이 없는 위치나 DMG 안에서는 설치를 중단하고 앱을 옮기도록 안내합니다.

설정은 앱 외부의 사용자별 config 폴더에 남습니다. 설치 직전에 `config.before-update.json`을 백업합니다. `재시작 후에도 등록 유지`를 끈 경우에는 원래 설정대로 재시작 시 현재 목록이 비워집니다. 프리셋은 유지됩니다.

자동 확인은 메인 창을 시작할 때만 실행하며, `update-check.txt`에 마지막 시도 시간을 저장해 하루 한 번으로 제한합니다. 주기적인 업데이트 폴링은 없습니다. 수동 확인은 이 제한을 받지 않습니다. 새 버전을 발견하면 변경 내용과 업데이트/취소 선택을 보여줍니다. 같은 버전의 자동 안내는 실행 중 한 번만 표시합니다. 설치는 사용자가 선택하며, 기본으로 켜진 자동 재시작 옵션은 끌 수 있습니다. 설치 명령이 끝난 뒤 백엔드 Ready 상태를 다시 조회한 경우에만 자동 재시작을 요청합니다.

## 검증 범위

브라우저 UI 테스트는 ego-browser에서 격리된 IPC 테스트 대역으로 실행합니다. OS 전환과 실제 업데이트 설치는 별도 검증입니다. 임시 서명으로 업데이트했을 때 macOS 실행 경고·손쉬운 사용·자동화 권한이 유지되는지는 별도로 확인해야 합니다.

- [네이티브 지원 범위](../native/README.md)
- [합의 요구사항](requirements.md)
- [기존 검증 기록](evidence/implementation-qa.md)
