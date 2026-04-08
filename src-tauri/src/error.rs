use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("SII decode error: {0}")]
    SiiDecode(String),

    #[error("Parse error: {0}")]
    Parse(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Profile already exists: {0}")]
    AlreadyExists(String),

    #[error("Invalid profile name: {0}")]
    InvalidName(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;
        let mut state = serializer.serialize_struct("AppError", 2)?;
        let kind = match self {
            AppError::Io(_) => "io",
            AppError::SiiDecode(_) => "decode",
            AppError::Parse(_) => "parse",
            AppError::NotFound(_) => "notFound",
            AppError::AlreadyExists(_) => "alreadyExists",
            AppError::InvalidName(_) => "invalidName",
        };
        state.serialize_field("kind", kind)?;
        state.serialize_field("message", &self.to_string())?;
        state.end()
    }
}
