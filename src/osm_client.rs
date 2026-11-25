use tokio::runtime::Handle;
use tokio::task::JoinHandle;

pub type TileRequest = JoinHandle<reqwest::Result<Vec<u8>>>;

pub struct OSMClient {
    client: reqwest::Client,
}

impl OSMClient {
    pub fn new() -> reqwest::Result<OSMClient> {
        // The OSM tile usage policy blocks requests without an identifying User-Agent.
        let client: reqwest::Client = reqwest::Client::builder()
            .user_agent(concat!(env!("CARGO_PKG_NAME"), "/", env!("CARGO_PKG_VERSION")))
            .build()?;

        Ok(OSMClient { client })
    }

    pub fn fetch_tile(&self, runtime: &Handle, zoom: u32, x: u32, y: u32) -> TileRequest {
        let url: String = format!("https://tile.openstreetmap.org/{zoom}/{x}/{y}.png");
        let client: reqwest::Client = self.client.clone();

        runtime.spawn(async move {
            let response: reqwest::Response = client.get(url).send().await?.error_for_status()?;

            // Vec::from reuses the body's buffer when it is the only owner; .to_vec() would always copy.
            let tile: Vec<u8> = Vec::from(response.bytes().await?);
            Ok(tile)
        })
    }
}
