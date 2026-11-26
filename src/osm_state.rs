use std::future::Future;

use bevy::prelude::*;
use bevy_tokio_tasks::tokio::task::JoinHandle;
use bevy_tokio_tasks::{MainThreadContext, TaskContext, TokioTasksRuntime};

use crate::osm_client::OSMClient;
use crate::osm_tile::{OSMTile, mesh};

const WATER: Color = Color::srgb(0.61, 0.76, 0.90);

// Bottom to top; layers not listed are not drawn.
const LAYER_COLORS: [(&str, Color); 8] = [
    ("landcover", Color::srgb(0.81, 0.89, 0.69)),
    ("landuse", Color::srgb(0.91, 0.88, 0.82)),
    ("park", Color::srgb(0.72, 0.86, 0.63)),
    ("water", WATER),
    ("waterway", WATER),
    ("aeroway", Color::srgb(0.80, 0.80, 0.87)),
    ("building", Color::srgb(0.78, 0.74, 0.68)),
    ("transportation", Color::WHITE),
];

#[derive(Resource)]
pub struct OSMState {
    osm_client: OSMClient,
}

impl OSMState {
    pub fn new() -> reqwest::Result<OSMState> {
        Ok(OSMState { osm_client: OSMClient::new()? })
    }

    pub fn fetch_tile(&self, runtime: &TokioTasksRuntime, zoom: u32, x: u32, y: u32) {
        load_tile(runtime, self.osm_client.fetch_tile(zoom, x, y));
    }
}

fn spawn_tile_meshes(
    In(tile): In<OSMTile>,
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<ColorMaterial>>,
    mut layer_materials: Local<Vec<Handle<ColorMaterial>>>,
) {
    if layer_materials.is_empty() {
        layer_materials.extend(LAYER_COLORS.map(|(_, color): (&str, Color)| materials.add(color)));
    }

    for layer in tile.layers {
        let Some(depth) = LAYER_COLORS.iter().position(|(name, _): &(&str, Color)| *name == layer.name) else {
            continue;
        };

        let half_extent: f32 = layer.extent as f32 / 2.0;

        // Tile y points down, Bevy y points up.
        commands.spawn((
            Mesh2d(meshes.add(mesh(layer.triangles))),
            MeshMaterial2d(layer_materials[depth].clone()),
            Transform::from_xyz(-half_extent, half_extent, depth as f32).with_scale(Vec3::new(1.0, -1.0, 1.0)),
        ));
    }
}

fn load_tile(runtime: &TokioTasksRuntime, request: impl Future<Output = reqwest::Result<Vec<u8>>> + Send + 'static) -> JoinHandle<()> {
    runtime.spawn_background_task(move |mut context: TaskContext| async move {
        let response: Vec<u8> = match request.await {
            Ok(response) => response,
            Err(error) => return eprintln!("tile request failed: {error}"),
        };

        let tile: OSMTile = match OSMTile::from_response(response, &LAYER_COLORS.map(|(name, _): (&str, Color)| name)) {
            Ok(tile) => tile,
            Err(error) => return eprintln!("tile parse failed: {error}"),
        };

        context
            .run_on_main_thread(move |main: MainThreadContext| {
                if let Err(error) = main.world.run_system_cached_with(spawn_tile_meshes, tile) {
                    eprintln!("tile spawn failed: {error}");
                }
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
        app.add_plugins(TokioTasksPlugin::default())
            .insert_resource(OSMState::new()?)
            .init_resource::<Assets<Mesh>>()
            .init_resource::<Assets<ColorMaterial>>();

        let task: JoinHandle<()> = load_tile(app.world().resource::<TokioTasksRuntime>(), async { Ok(response) });

        while !task.is_finished() {
            app.update();
        }

        Ok(app)
    }

    #[test]
    fn load_tile_spawns_one_mesh_per_drawn_layer() -> Result<(), Box<dyn Error>> {
        let mut app: App = load_in_app(SOFIA_TILE.to_vec())?;
        let meshes: usize = app.world_mut().query::<&Mesh2d>().iter(app.world()).count();

        assert_eq!(meshes, LAYER_COLORS.len());
        Ok(())
    }

    #[test]
    fn load_tile_skips_invalid_tile() -> Result<(), Box<dyn Error>> {
        let mut app: App = load_in_app(vec![0xff])?;
        let meshes: usize = app.world_mut().query::<&Mesh2d>().iter(app.world()).count();

        assert_eq!(meshes, 0);
        Ok(())
    }
}
