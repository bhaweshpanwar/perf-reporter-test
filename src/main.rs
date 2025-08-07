use actix_web::{get, web, App, HttpResponse, HttpServer, Responder, Result};
use scraper::{ElementRef, Html, Selector};
use serde::Serialize;
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
                            results.push(PerfResult {
                                scale: current_scale.clone(),
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
    context.insert("title", &format!("{} Test Results", test)); 
    context.insert("unit", "Warehouses"); 
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
    // Initialize Tera
    let tera = Tera::new("templates/**/*").expect("Failed to parse Tera templates.");

    println!("🚀 Server starting at http://127.0.0.1:8080");

    HttpServer::new(move || {
        App::new()
            .app_data(web::Data::new(AppState {
                tera: tera.clone(),
                buildbot_url: "http://140.211.11.131:8010".to_string(),
                postgres_commit_url: "https://github.com/postgres/postgres/commit/".to_string(),
            }))
            .service(actix_files::Files::new("/static", "./static"))
            .service(welcome)
            .service(mock_pf_test)
    })
    .bind(("0.0.0.0", 8080))?
    .run()
    .await
}
