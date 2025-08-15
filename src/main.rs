use actix_web::{get, web, App, HttpResponse, HttpServer, Responder, Result};

use scraper::{ElementRef, Html, Selector};
use serde::Serialize;

use std::collections::BTreeMap;
use tera::Context;
use tera::Tera;
#[derive(Serialize, Debug)]
struct PerfResult {
    scale: String,
    branch: String,
    commit_date: String,
    commit: String,
    metric: f64,
}

pub struct AppState {
    tera: Tera,
    buildbot_url: String,
    postgres_commit_url: String,
}


// Keep these structs as they are perfect for simulation
#[derive(Serialize, Clone)]
struct ResultItem {
    revision: String,
    ctime: u64, // Unix timestamp
    metric: f64,
}

#[derive(Serialize, Clone)]
struct ResultsByTime {
    sorted: Vec<ResultItem>, // For simulation, sorted vec is easier than BTreeMap
    reversed: Vec<ResultItem>,
}

async fn test_handler(data: web::Data<AppState>) -> impl Responder {
    // -------------------------
    // Build RICH dummy test data
    // -------------------------

    // --- Data for Scale 10 ---
    let scale_10_branch_master_results = vec![
        ResultItem { revision: "revA1".into(), ctime: 1725000000, metric: 95.5 },
        ResultItem { revision: "revA2".into(), ctime: 1725010000, metric: 98.2 },
    ];
    let scale_10_branch_master = ResultsByTime {
        sorted: scale_10_branch_master_results.clone(),
        reversed: scale_10_branch_master_results.iter().rev().cloned().collect(),
    };

    let scale_10_branch_feature_results = vec![
        ResultItem { revision: "revB1".into(), ctime: 1725020000, metric: 101.0 },
    ];
    let scale_10_branch_feature = ResultsByTime {
        sorted: scale_10_branch_feature_results.clone(),
        reversed: scale_10_branch_feature_results.iter().rev().cloned().collect(),
    };

    let mut scale_10 = BTreeMap::new();
    scale_10.insert("master".to_string(), scale_10_branch_master);
    scale_10.insert("feature-branch-x".to_string(), scale_10_branch_feature);

    // --- Data for Scale 100 ---
    let scale_100_branch_master_results = vec![
        ResultItem { revision: "revC1".into(), ctime: 1725100000, metric: 1250.7 },
        ResultItem { revision: "revC2".into(), ctime: 1725110000, metric: 1245.1 },
        ResultItem { revision: "revC3".into(), ctime: 1725120000, metric: 1300.0 },
    ];
    let scale_100_branch_master = ResultsByTime {
        sorted: scale_100_branch_master_results.clone(),
        reversed: scale_100_branch_master_results.iter().rev().cloned().collect(),
    };

    let scale_100_branch_dev_results = vec![
        ResultItem { revision: "revD1".into(), ctime: 1725115000, metric: 1100.3 },
    ];
    let scale_100_branch_dev = ResultsByTime {
        sorted: scale_100_branch_dev_results.clone(),
        reversed: scale_100_branch_dev_results.iter().rev().cloned().collect(),
    };
    
    let mut scale_100 = BTreeMap::new();
    scale_100.insert("master".to_string(), scale_100_branch_master);
    scale_100.insert("development-branch".to_string(), scale_100_branch_dev);

    // --- Combine all scales into the final structure ---
    let mut scales: BTreeMap<u32, BTreeMap<String, ResultsByTime>> = BTreeMap::new();
    scales.insert(10, scale_10);
    scales.insert(100, scale_100);

    // -------------------------
    // Build context for template
    // -------------------------
    let mut ctx = Context::new();
    ctx.insert("test", &"my_dbt2_simulation");
    ctx.insert("plant", &"local_plant");
    ctx.insert("buildbot_url", &data.buildbot_url);
    ctx.insert("postgres_commit_url", &data.postgres_commit_url);
    ctx.insert("scales", &scales); // This is the key part
    ctx.insert("metric_name", &"Transactions per Second");
    ctx.insert("title", &"DBT-2 Simulated Performance");
    ctx.insert("unit", &"Warehouses");

    // Render the template
    match data.tera.render("test.html.tera", &ctx) {
        Ok(rendered) => HttpResponse::Ok().content_type("text/html").body(rendered),
        Err(e) => {
            eprintln!("Template error: {}", e);
            HttpResponse::InternalServerError().body("Error rendering template")
        }
    }
}

#[get("/")]
async fn welcome() -> impl Responder {
    HttpResponse::Ok()
        .content_type("text/html; charset=utf-8")
        .body(
            r#"
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <title>Perf Farm Reporter</title>
                <style>
                    body { font-family: sans-serif; line-height: 1.6; padding: 2em; background-color: #f4f4f9; color: #333; }
                    .container { max-width: 800px; margin: auto; background: white; padding: 2em; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); }
                    h1 { color: #2c3e50; }
                    code { background: #e8e8e8; padding: 0.2em 0.4em; border-radius: 4px; }
                    a { color: #3498db; text-decoration: none; }
                    a:hover { text-decoration: underline; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>Welcome to the Performance Farm Reporter!</h1>
                    <p>This service fetches and visualizes performance test data.</p>
                    <p>To see a report, construct a URL like this:</p>
                    <code>/mock/{test_name}/{plant_name}</code>
                    <h3>Example:</h3>
                    <p>Try this link to see a DBT2 test report for the 'fireweed' plant:</p>
                    <p><a href="/mock/dbt2/fireweed">/mock/dbt2/fireweed</a></p>
                </div>
            </body>
            </html>
            "#,
        )
}

#[get("/mock/{test}/{plant}")]
async fn mock_pf_test(
    data: web::Data<AppState>,
    path: web::Path<(String, String)>,
) -> Result<HttpResponse> {
    let (test, plant) = path.into_inner();
    println!("📥 Incoming request: /mock/{}/{}", test, plant);

    let url = format!("http://140.211.11.131:8080/pf/{}/{}", test, plant);

    let body = reqwest::get(&url)
        .await
        .map_err(|e| {
            eprintln!("Failed to fetch remote HTML: {}", e);
            actix_web::error::ErrorInternalServerError("Failed to fetch remote HTML")
        })?
        .text()
        .await
        .map_err(|e| {
            eprintln!("Failed to read HTML body: {}", e);
            actix_web::error::ErrorInternalServerError("Failed to read HTML body")
        })?;

    // Parsing
    let document = Html::parse_document(&body);
    let mut results: Vec<PerfResult> = Vec::new();

    let tr_selector = Selector::parse("tr").unwrap();
    let td_selector = Selector::parse("td").unwrap();
    let body_selector = Selector::parse("body").unwrap();
    let body_element = document.select(&body_selector).next().unwrap();

    let mut current_scale = String::new();
    let mut current_branch = String::new();

    for node in body_element.children() {
        if let Some(element) = ElementRef::wrap(node) {
            match element.value().name() {
                "h2" => current_scale = element.text().collect::<String>().trim().to_string(),
                "h3" => current_branch = element.text().collect::<String>().trim().to_string(),
                "table" => {
                    if current_scale.is_empty() || current_branch.is_empty() {
                        continue;
                    }
                    for row in element.select(&tr_selector) {
                        let cells: Vec<String> = row
                            .select(&td_selector)
                            .map(|cell| cell.text().collect::<String>().trim().to_string())
                            .collect();
                        if cells.len() == 3 {
                            let metric_val = cells[2].parse::<f64>().unwrap_or(0.0);
                            // Remove trailing non-digit characters from scale string, e.g. "100 Warehouses" → "100"
                            let cleaned_scale = current_scale
                                .split_whitespace()
                                .next()
                                .unwrap_or(&current_scale)
                                .to_string();

                            results.push(PerfResult {
                                scale: cleaned_scale, // use cleaned numeric string only
                                branch: current_branch.clone(),
                                commit_date: cells[0].clone(),
                                commit: cells[1].clone(),
                                metric: metric_val,
                            });
                        }
                    }
                }
                _ => {}
            }
        }
    }

    let mut context = tera::Context::new();
    context.insert("buildbot_url", &data.buildbot_url);
    context.insert("postgres_commit_url", &data.postgres_commit_url);
    context.insert("scales", &results);
    context.insert("metric_name", "New Orders per Minute");
    context.insert("title", &format!("{}", test));
    context.insert("unit", "Warehouse");
    context.insert("plant", &plant);

    let rendered = data
        .tera
        .render("test_plant.html.tera", &context)
        .map_err(|e| {
            eprintln!("Template rendering error: {}", e);
            actix_web::error::ErrorInternalServerError("Template error")
        })?;

    Ok(HttpResponse::Ok().content_type("text/html").body(rendered))
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // 1. Initialize Tera templating engine
    let tera = Tera::new("templates/**/*").expect("Failed to parse Tera templates.");

    println!("🚀 Server starting at http://0.0.0.0:8080");

    HttpServer::new(move || {
        App::new()
            // 2. Create and register the AppState for all handlers to use
            .app_data(web::Data::new(AppState {
                tera: tera.clone(),
                buildbot_url: "http://140.211.11.131:8010".to_string(),
                postgres_commit_url: "https://github.com/postgres/postgres/commit/".to_string(),
            }))
            .service(actix_files::Files::new("/static", "./static"))
            .service(welcome)
            .service(mock_pf_test) // Now this handler will correctly receive the AppState
            .route("/test", web::get().to(test_handler))
    })
    .bind(("0.0.0.0", 8080))?
    .run()
    .await
}
