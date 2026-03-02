//! Temporary script to generate JSON schemas.
//! Run with: cargo run --example gen_schemas
use isso51_core::{project_schema, result_schema};

fn main() {
    let project = project_schema();
    std::fs::write("schemas/v1/project.schema.json", &project).unwrap();
    println!("Written project.schema.json ({} bytes)", project.len());

    let result = result_schema();
    std::fs::write("schemas/v1/result.schema.json", &result).unwrap();
    println!("Written result.schema.json ({} bytes)", result.len());
}
