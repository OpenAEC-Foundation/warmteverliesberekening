//! Request handlers for the ISSO 51 API.

mod calculation;
mod ifcx;
mod projects;
mod report;
mod user;

pub use calculation::{calculate, get_schema, health, list_schemas};
pub use ifcx::calculate_ifcx_handler;
pub use projects::{
    calculate_and_save, create_project, delete_project, get_project, list_projects,
    update_project,
};
pub use report::generate_report;
pub use user::get_profile;
