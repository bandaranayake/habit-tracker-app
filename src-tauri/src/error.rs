use serde::ser::{Serialize, SerializeStruct, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Database is locked")]
    Locked,
    #[error(transparent)]
    Database(#[from] rusqlite::Error),
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

impl AppError {
    fn kind(&self) -> &'static str {
        match self {
            AppError::Locked => "Locked",
            AppError::Database(_) => "Database",
            AppError::Io(_) => "Io",
        }
    }
}

/// Serializes as `{ "kind": "<Variant>", "message": "<Display>" }` (see docs/ipc-contract.md).
impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut s = serializer.serialize_struct("AppError", 2)?;
        s.serialize_field("kind", self.kind())?;
        s.serialize_field("message", &self.to_string())?;
        s.end()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn locked_serializes_to_kind_and_message() {
        let json = serde_json::to_value(AppError::Locked).unwrap();
        assert_eq!(
            json,
            serde_json::json!({ "kind": "Locked", "message": "Database is locked" })
        );
    }

    #[test]
    fn io_uses_display_as_message() {
        let err = AppError::from(std::io::Error::other("boom"));
        let json = serde_json::to_value(err).unwrap();
        assert_eq!(json, serde_json::json!({ "kind": "Io", "message": "boom" }));
    }
}
