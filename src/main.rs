#![expect(dead_code, reason = "the OSM modules are not wired into the bevy app yet")]

mod osm_client;
mod osm_state;
mod osm_tile;

use bevy::prelude::*;
use bevy_tokio_tasks::TokioTasksPlugin;

fn main() -> AppExit {
    App::new().add_plugins((DefaultPlugins, TokioTasksPlugin::default())).run()
}
