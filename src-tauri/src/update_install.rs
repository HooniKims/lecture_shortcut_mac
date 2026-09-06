use std::path::{Path, PathBuf};

// RENAME_SWAP keeps the canonical app path present even if the process stops.
pub(crate) fn replace_bundle(current: &Path, staged: &Path) -> Result<(), String> {
    use std::{ffi::CString, os::unix::ffi::OsStrExt};
    let current = CString::new(current.as_os_str().as_bytes()).map_err(|e| e.to_string())?;
    let staged = CString::new(staged.as_os_str().as_bytes()).map_err(|e| e.to_string())?;
    // SAFETY: [Category 8 — FFI boundary] Both C strings remain alive for this call.
    // AT_FDCWD accepts these absolute paths. RENAME_SWAP atomically exchanges their
    // directory entries; an error leaves both in place. No pointers are retained.
    let result = unsafe {
        libc::renameatx_np(
            libc::AT_FDCWD,
            current.as_ptr(),
            libc::AT_FDCWD,
            staged.as_ptr(),
            libc::RENAME_SWAP,
        )
    };
    if result != 0 {
        return Err(format!(
            "업데이트를 설치하지 못했습니다. 기존 앱은 그대로 유지됩니다: {}",
            std::io::Error::last_os_error()
        ));
    }
    Ok(())
}

pub(crate) fn install(bytes: &[u8], current: &Path, version: &str) -> Result<(), String> {
    let parent = current
        .parent()
        .ok_or("Cue 설치 위치를 확인하지 못했습니다.")?;
    let workspace = tempfile::Builder::new().prefix(".cue-update-").tempdir_in(parent)
        .map_err(|_| "이 위치에는 업데이트를 설치할 수 없습니다. Cue를 쓰기 가능한 응용 프로그램 폴더로 옮긴 뒤 다시 시도하세요.")?;
    let stage = workspace.path().join("new");
    std::fs::create_dir(&stage).map_err(|e| e.to_string())?;
    let mut archive = tar::Archive::new(flate2::read::GzDecoder::new(bytes));
    archive
        .unpack(&stage)
        .map_err(|e| format!("업데이트 파일을 풀지 못했습니다: {e}"))?;
    let next = stage.join("Cue.app");
    verify_bundle(&next, version)?;
    // After the atomic swap, stage contains the old app. Cleanup cannot remove
    // the new bundle at the canonical path, even after interruption.
    replace_bundle(current, &next)
}

fn verify_bundle(bundle: &Path, version: &str) -> Result<(), String> {
    let output = std::process::Command::new("/usr/bin/plutil")
        .args(["-convert", "json", "-o", "-"])
        .arg(bundle.join("Contents/Info.plist"))
        .output()
        .map_err(|e| e.to_string())?;
    let info: serde_json::Value = serde_json::from_slice(&output.stdout)
        .map_err(|_| "업데이트 파일의 앱 정보를 읽지 못했습니다.")?;
    if !output.status.success()
        || info["CFBundleIdentifier"] != "dev.cue.desktop"
        || info["CFBundleShortVersionString"] != version
        || !bundle.join("Contents/MacOS/cue").is_file()
        || !bundle.join("Contents/MacOS/cue-native").is_file()
    {
        return Err("Cue 업데이트 파일의 종류나 버전이 일치하지 않습니다.".into());
    }
    let status = std::process::Command::new("/usr/bin/codesign")
        .args(["--verify", "--deep", "--strict"])
        .arg(bundle)
        .output()
        .map_err(|e| e.to_string())?;
    if !status.status.success() {
        return Err("앱 파일 검증에 실패했습니다. 기존 앱은 변경하지 않았습니다.".into());
    }
    Ok(())
}

pub(crate) fn current_bundle() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let bundle = exe
        .ancestors()
        .nth(3)
        .ok_or("Cue 설치 위치를 확인하지 못했습니다.")?;
    if bundle.extension().and_then(|s| s.to_str()) != Some("app") {
        return Err("업데이트 설치는 설치된 Cue 앱에서 사용할 수 있습니다.".into());
    }
    Ok(bundle.to_path_buf())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "requires CUE_TEST_ARCHIVE pointing to a freshly built Cue.app.tar.gz"]
    fn built_archive_when_installed_replaces_bundle_and_cleans_workspace()
    -> Result<(), Box<dyn std::error::Error>> {
        let archive = std::env::var("CUE_TEST_ARCHIVE")?;
        let bytes = std::fs::read(archive)?;
        let root = tempfile::tempdir()?;
        let current = root.path().join("Cue.app");
        std::fs::create_dir(&current)?;
        std::fs::write(current.join("old"), "old")?;
        install(&bytes, &current, env!("CARGO_PKG_VERSION"))?;
        assert!(!current.join("old").exists());
        assert!(current.join("Contents/MacOS/cue").is_file());
        assert_eq!(std::fs::read_dir(root.path())?.count(), 1);
        Ok(())
    }
    #[test]
    fn replacement_when_staged_is_missing_keeps_old_app() -> Result<(), Box<dyn std::error::Error>>
    {
        let root = tempfile::tempdir()?;
        let current = root.path().join("Cue.app");
        std::fs::create_dir(&current)?;
        std::fs::write(current.join("old"), "preserved")?;
        assert!(replace_bundle(&current, &root.path().join("missing")).is_err());
        assert_eq!(std::fs::read_to_string(current.join("old"))?, "preserved");
        Ok(())
    }
    #[test]
    fn replacement_when_staged_exists_atomically_swaps_bundles()
    -> Result<(), Box<dyn std::error::Error>> {
        let root = tempfile::tempdir()?;
        let current = root.path().join("Cue.app");
        let staged = root.path().join("next");
        std::fs::create_dir(&current)?;
        std::fs::create_dir(&staged)?;
        std::fs::write(current.join("old"), "old")?;
        std::fs::write(staged.join("new"), "new")?;
        replace_bundle(&current, &staged)?;
        assert!(current.join("new").exists());
        assert!(staged.join("old").exists());
        Ok(())
    }
}
