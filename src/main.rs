mod osm_client;
mod osm_state;

use std::error::Error;
use std::time::Duration;

use tokio::runtime::Runtime;

use crate::osm_state::OSMState;

fn main() -> Result<(), Box<dyn Error>> {
    let runtime: Runtime = Runtime::new()?;
    let mut state: OSMState = OSMState::new()?;
    state.fetch_tile(runtime.handle(), 0, 0, 0);

    while state.has_running_requests() {
        state.update(runtime.handle());
        std::thread::sleep(Duration::from_millis(100));
    }

    for (index, tile) in state.loaded_tiles.iter().enumerate() {
        println!("tile {index}: {} bytes", tile.len());
    }

    Ok(())
}
