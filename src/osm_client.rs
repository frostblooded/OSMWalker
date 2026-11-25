use std::future::Future;

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

    pub fn fetch_tile(&self, zoom: u32, x: u32, y: u32) -> impl Future<Output = reqwest::Result<Vec<u8>>> + Send + 'static {
        let url: String = format!("https://tiles.openfreemap.org/planet/latest/{zoom}/{x}/{y}.pbf");
        let client: reqwest::Client = self.client.clone();

        async move {
            let response: reqwest::Response = client.get(url).send().await?.error_for_status()?;

            // Vec::from reuses the body's buffer when it is the only owner; .to_vec() would always copy.
            let tile: Vec<u8> = Vec::from(response.bytes().await?);
            Ok(tile)
        }
    }
}
