use std::future::Future;

use bevy::prelude::*;
use bevy_tokio_tasks::tokio::task::JoinHandle;
use bevy_tokio_tasks::{MainThreadContext, TaskContext, TokioTasksRuntime};

use crate::osm_client::OSMClient;
use crate::osm_tile::OSMTile;

#[derive(Resource)]
pub struct OSMState {
    osm_client: OSMClient,
    pub loaded_tiles: Vec<OSMTile>,
}

impl OSMState {
    pub fn new() -> reqwest::Result<OSMState> {
        Ok(OSMState {
            osm_client: OSMClient::new()?,
            loaded_tiles: Vec::new(),
        })
    }

    pub fn fetch_tile(&self, runtime: &TokioTasksRuntime, zoom: u32, x: u32, y: u32) -> JoinHandle<()> {
        load_tile(runtime, self.osm_client.fetch_tile(zoom, x, y))
    }
}

fn load_tile(runtime: &TokioTasksRuntime, request: impl Future<Output = reqwest::Result<Vec<u8>>> + Send + 'static) -> JoinHandle<()> {
    runtime.spawn_background_task(move |mut context: TaskContext| async move {
        let response: Vec<u8> = match request.await {
            Ok(response) => response,
            Err(error) => return eprintln!("tile request failed: {error}"),
        };

        let tile: OSMTile = match OSMTile::from_response(response) {
            Ok(tile) => tile,
            Err(error) => return eprintln!("tile parse failed: {error}"),
        };

        context
            .run_on_main_thread(move |main: MainThreadContext| {
                main.world.resource_mut::<OSMState>().loaded_tiles.push(tile);
            })
            .await;
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::osm_tile::tests::SOFIA_TILE;
    use bevy_tokio_tasks::TokioTasksPlugin;
    use std::error::Error;

    fn load_in_app(response: Vec<u8>) -> Result<App, Box<dyn Error>> {
        let mut app: App = App::new();
        app.add_plugins(TokioTasksPlugin::default()).insert_resource(OSMState::new()?);

        let task: JoinHandle<()> = load_tile(app.world().resource::<TokioTasksRuntime>(), async { Ok(response) });

        while !task.is_finished() {
            app.update();
        }

        Ok(app)
    }

    #[test]
    fn load_tile_adds_parsed_tile_to_state() -> Result<(), Box<dyn Error>> {
        let app: App = load_in_app(SOFIA_TILE.to_vec())?;
        let tiles: &[OSMTile] = &app.world().resource::<OSMState>().loaded_tiles;

        assert_eq!(tiles.len(), 1);
        assert!(tiles[0].layer_names.contains(&String::from("transportation")));
        Ok(())
    }

    #[test]
    fn load_tile_skips_invalid_tile() -> Result<(), Box<dyn Error>> {
        let app: App = load_in_app(vec![0xff])?;

        assert!(app.world().resource::<OSMState>().loaded_tiles.is_empty());
        Ok(())
    }
}
