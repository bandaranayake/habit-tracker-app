//! `libsqlite3-sys` 0.38.2's public API (bindings, `error`, helpers) over SQLite3 Multiple
//! Ciphers. `error.rs` and `bindgen_bundled_version.rs` are copied unchanged from
//! libsqlite3-sys 0.38.2 (MIT, see LICENSE-libsqlite3-sys); the bindings target SQLite
//! 3.53.2 and SQLite3MC 2.5.1 wraps 3.53.4, the same C API.
#![expect(non_snake_case, non_camel_case_types)]
#![cfg_attr(not(test), no_std)]

pub use self::error::*;

use core::mem;

mod error;

#[must_use]
pub fn SQLITE_STATIC() -> sqlite3_destructor_type {
    None
}

#[must_use]
pub fn SQLITE_TRANSIENT() -> sqlite3_destructor_type {
    Some(unsafe { mem::transmute::<isize, unsafe extern "C" fn(*mut core::ffi::c_void)>(-1_isize) })
}

#[allow(dead_code, clippy::all)]
mod bindings {
    include!("bindgen_bundled_version.rs");
}
pub use bindings::*;

impl Default for sqlite3_vtab {
    fn default() -> Self {
        unsafe { mem::zeroed() }
    }
}

impl Default for sqlite3_vtab_cursor {
    fn default() -> Self {
        unsafe { mem::zeroed() }
    }
}
