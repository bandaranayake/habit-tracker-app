//! Compile the SQLite3 Multiple Ciphers amalgamation into a static lib. This crate is the
//! only `links = "sqlite3"` package in the graph and it never probes pkg-config, vcpkg or
//! system paths, so no system libsqlite3 can be linked instead.

fn main() {
    let dir = sqlite3mc_src::source_dir();
    let source = dir.join(sqlite3mc_src::SOURCE_FILE);
    println!("cargo:rerun-if-changed={}", source.display());

    let mut build = cc::Build::new();
    build
        .file(&source)
        .include(dir)
        .define("SQLITE_CORE", None)
        .define("SQLITE_THREADSAFE", "1")
        // Keep temp tables and indices in memory, never as plaintext temp files.
        .define("SQLITE_TEMP_STORE", "2")
        .define("SQLITE_ENABLE_API_ARMOR", None)
        .warnings(false);

    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    if target_os != "windows" {
        build.define("HAVE_LOCALTIME_R", None);
    }
    // Static CRT when the target asks for it (mirrors libsqlite3-sys).
    if std::env::var("CARGO_CFG_TARGET_FEATURE").is_ok_and(|f| f.split(',').any(|f| f == "crt-static"))
    {
        build.static_crt(true);
    }
    build.compile("sqlite3mc");

    // The RNG seed uses RtlGenRandom; MSVC picks this up via #pragma comment, MinGW does not.
    if target_os == "windows" {
        println!("cargo:rustc-link-lib=advapi32");
    }
    println!("cargo:include={}", dir.display());
}
