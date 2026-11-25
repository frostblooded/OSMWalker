use tokio::runtime::Handle;

use crate::osm_client::{OSMClient, TileRequest};

pub struct OSMState {
    osm_client: OSMClient,
    running_tile_requests: Vec<TileRequest>,
    pub loaded_tiles: Vec<Vec<u8>>,
}

impl OSMState {
    pub fn new() -> reqwest::Result<OSMState> {
        Ok(OSMState {
            osm_client: OSMClient::new()?,
            running_tile_requests: Vec::new(),
            loaded_tiles: Vec::new(),
        })
    }

    pub fn fetch_tile(&mut self, runtime: &Handle, zoom: u32, x: u32, y: u32) {
        self.running_tile_requests.push(self.osm_client.fetch_tile(runtime, zoom, x, y));
    }

    pub fn update(&mut self, runtime: &Handle) {
        for request in self
            .running_tile_requests
            .extract_if(.., |request: &mut TileRequest| -> bool { request.is_finished() })
        {
            match runtime.block_on(request) {
                Ok(Ok(tile)) => self.loaded_tiles.push(tile),
                Ok(Err(error)) => eprintln!("tile request failed: {error}"),
                Err(error) => eprintln!("tile task failed: {error}"),
            }
        }
    }

    pub fn has_running_requests(&self) -> bool {
        !self.running_tile_requests.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::error::Error;
    use tokio::runtime::Runtime;

    #[test]
    fn update_loads_finished_requests_and_keeps_running_ones() -> Result<(), Box<dyn Error>> {
        let runtime: Runtime = Runtime::new()?;
        let mut state: OSMState = OSMState::new()?;
        let done: TileRequest = runtime.spawn(async { Ok(vec![1, 2, 3]) });

        while !done.is_finished() {
            std::thread::yield_now();
        }

        state.running_tile_requests.push(done);
        state.running_tile_requests.push(runtime.spawn(std::future::pending()));

        state.update(runtime.handle());

        assert_eq!(state.loaded_tiles, [vec![1, 2, 3]]);
        assert_eq!(state.running_tile_requests.len(), 1);
        Ok(())
    }
}
