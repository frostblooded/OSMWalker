mod osm_client;
mod osm_state;
mod osm_tile;

use bevy::camera::ScalingMode;
use bevy::prelude::*;
use bevy_tokio_tasks::{TokioTasksPlugin, TokioTasksRuntime};

use crate::osm_state::OSMState;

// The extent of OpenFreeMap tiles, so one whole tile fits the window.
const TILE_EXTENT: f32 = 4096.0;

fn main() -> AppExit {
    let state: OSMState = match OSMState::new() {
        Ok(state) => state,
        Err(error) => {
            eprintln!("http client setup failed: {error}");
            return AppExit::error();
        }
    };

    App::new()
        .add_plugins((DefaultPlugins, TokioTasksPlugin::default()))
        .insert_resource(state)
        .add_systems(Startup, (spawn_camera, fetch_sofia_tile))
        .run()
}

fn spawn_camera(mut commands: Commands) {
    commands.spawn((
        Camera2d,
        Projection::Orthographic(OrthographicProjection {
            scaling_mode: ScalingMode::AutoMin {
                min_width: TILE_EXTENT,
                min_height: TILE_EXTENT,
            },
            ..OrthographicProjection::default_2d()
        }),
    ));
}

#[expect(clippy::needless_pass_by_value, reason = "bevy systems take Res by value")]
fn fetch_sofia_tile(state: Res<OSMState>, runtime: Res<TokioTasksRuntime>) {
    state.fetch_tile(&runtime, 14, 9253, 6039);
}
