pub mod backup;
pub mod config;
pub mod editor;
pub mod playsets;
pub mod profiles;
pub mod saves;
pub mod workshop;

use crate::error::AppError;

/// Run a fallible CPU/IO-bound closure on Tokio's blocking pool so the IPC
/// dispatch thread stays free. Panic messages are not surfaced to the
/// frontend — the join error is logged and replaced with a generic message.
pub(crate) async fn run_blocking<F, T>(f: F) -> Result<T, AppError>
where
    F: FnOnce() -> Result<T, AppError> + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| {
        eprintln!("background task failed: {e}");
        AppError::Internal("background task failed".into())
    })?
}
