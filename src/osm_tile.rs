use std::error::Error;

use bevy::asset::RenderAssetUsages;
use bevy::mesh::{Indices, Mesh, PrimitiveTopology};
use geo_types::{Geometry, LineString, Polygon};
use lyon::math::point;
use lyon::path::Path;
use lyon::path::path::Builder;
use lyon::tessellation::{
    BuffersBuilder, FillOptions, FillTessellator, FillVertex, StrokeOptions, StrokeTessellator, StrokeVertex, TessellationError, VertexBuffers,
};
use mvt_reader::Reader;
use mvt_reader::feature::Feature;
use mvt_reader::layer::Layer;

// shortcut: one width in tile units (~5 m at z14) for every line, until streets get a width per class.
const LINE_WIDTH: f32 = 8.0;

pub struct OSMLayer {
    pub name: String,
    pub extent: u32,
    pub triangles: VertexBuffers<[f32; 3], u32>,
}

pub struct OSMTile {
    pub layers: Vec<OSMLayer>,
}

impl OSMTile {
    pub fn from_response(response: Vec<u8>, kept_layers: &[&str]) -> Result<OSMTile, Box<dyn Error + Send + Sync>> {
        let reader: Reader = Reader::new(response)?;

        let layers: Vec<OSMLayer> = reader
            .get_layer_metadata()?
            .into_iter()
            .filter(|layer: &Layer| kept_layers.contains(&layer.name.as_str()))
            .map(|layer: Layer| -> Result<OSMLayer, Box<dyn Error + Send + Sync>> {
                let features: Vec<Feature> = reader.get_features(layer.layer_index)?;

                Ok(OSMLayer {
                    triangles: tessellate(&features)?,
                    name: layer.name,
                    extent: layer.extent,
                })
            })
            .collect::<Result<Vec<OSMLayer>, Box<dyn Error + Send + Sync>>>()?;

        Ok(OSMTile { layers })
    }
}

// Points have no area, so they get no triangles.
fn tessellate(features: &[Feature]) -> Result<VertexBuffers<[f32; 3], u32>, TessellationError> {
    let mut areas: Builder = Path::builder();
    let mut lines: Builder = Path::builder();

    for feature in features {
        match &feature.geometry {
            Geometry::Polygon(polygon) => add_polygon(&mut areas, polygon),
            Geometry::MultiPolygon(polygons) => polygons.iter().for_each(|polygon: &Polygon<f32>| add_polygon(&mut areas, polygon)),
            Geometry::LineString(line) => add_line(&mut lines, line, false),
            Geometry::MultiLineString(multi_line) => multi_line.iter().for_each(|line: &LineString<f32>| add_line(&mut lines, line, false)),
            _ => {}
        }
    }

    let mut triangles: VertexBuffers<[f32; 3], u32> = VertexBuffers::new();

    FillTessellator::new().tessellate_path(
        &areas.build(),
        &FillOptions::non_zero(),
        &mut BuffersBuilder::new(&mut triangles, |vertex: FillVertex| vertex.position().extend(0.0).to_array()),
    )?;

    StrokeTessellator::new().tessellate_path(
        &lines.build(),
        &StrokeOptions::default().with_line_width(LINE_WIDTH),
        &mut BuffersBuilder::new(&mut triangles, |vertex: StrokeVertex| vertex.position().extend(0.0).to_array()),
    )?;

    Ok(triangles)
}

pub fn mesh(triangles: VertexBuffers<[f32; 3], u32>) -> Mesh {
    Mesh::new(PrimitiveTopology::TriangleList, RenderAssetUsages::RENDER_WORLD)
        .with_inserted_attribute(Mesh::ATTRIBUTE_POSITION, triangles.vertices)
        .with_inserted_indices(Indices::U32(triangles.indices))
}

fn add_polygon(builder: &mut Builder, polygon: &Polygon<f32>) {
    add_line(builder, polygon.exterior(), true);

    for hole in polygon.interiors() {
        add_line(builder, hole, true);
    }
}

fn add_line(builder: &mut Builder, line: &LineString<f32>, close: bool) {
    let Some((first, rest)) = line.0.split_first() else {
        return;
    };

    builder.begin(point(first.x, first.y));

    for coord in rest {
        builder.line_to(point(coord.x, coord.y));
    }

    builder.end(close);
}

#[cfg(test)]
pub mod tests {
    use super::*;

    // OpenFreeMap tile 14/9253/6039: central Sofia.
    pub const SOFIA_TILE: &[u8] = include_bytes!("../tests/fixtures/sofia_14_9253_6039.pbf");

    #[test]
    fn from_response_keeps_only_listed_layers() -> Result<(), Box<dyn Error + Send + Sync>> {
        let tile: OSMTile = OSMTile::from_response(SOFIA_TILE.to_vec(), &["water", "building", "missing"])?;
        let names: Vec<&str> = tile.layers.iter().map(|layer: &OSMLayer| layer.name.as_str()).collect();

        assert_eq!(names, ["building", "water"]);
        Ok(())
    }

    #[test]
    fn from_response_tessellates_streets() -> Result<(), Box<dyn Error + Send + Sync>> {
        let streets: OSMLayer = sofia_layer("transportation")?;

        assert_eq!(streets.extent, 4096);
        assert!(!streets.triangles.indices.is_empty());
        Ok(())
    }

    #[test]
    fn from_response_tessellates_buildings() -> Result<(), Box<dyn Error + Send + Sync>> {
        let buildings: OSMLayer = sofia_layer("building")?;

        assert!(!buildings.triangles.indices.is_empty());
        Ok(())
    }

    #[test]
    fn from_response_leaves_housenumbers_without_triangles() -> Result<(), Box<dyn Error + Send + Sync>> {
        let doors: OSMLayer = sofia_layer("housenumber")?;

        assert!(doors.triangles.vertices.is_empty());
        Ok(())
    }

    fn sofia_layer(name: &str) -> Result<OSMLayer, Box<dyn Error + Send + Sync>> {
        let tile: OSMTile = OSMTile::from_response(SOFIA_TILE.to_vec(), &[name])?;

        Ok(tile.layers.into_iter().find(|layer: &OSMLayer| layer.name == name).ok_or("missing layer")?)
    }

    fn feature(geometry: Geometry<f32>) -> Feature {
        Feature {
            geometry,
            id: None,
            properties: None,
        }
    }

    fn square(size: f32) -> LineString<f32> {
        LineString::from(vec![(0.0, 0.0), (size, 0.0), (size, size), (0.0, size), (0.0, 0.0)])
    }

    #[test]
    fn tessellate_fills_polygon() -> Result<(), TessellationError> {
        let triangles: VertexBuffers<[f32; 3], u32> = tessellate(&[feature(Geometry::Polygon(Polygon::new(square(10.0), vec![])))])?;

        assert_eq!(triangles.indices.len(), 6);
        Ok(())
    }

    #[test]
    fn tessellate_leaves_polygon_holes_empty() -> Result<(), TessellationError> {
        let hole: LineString<f32> = LineString::from(vec![(4.0, 4.0), (4.0, 6.0), (6.0, 6.0), (6.0, 4.0), (4.0, 4.0)]);
        let triangles: VertexBuffers<[f32; 3], u32> = tessellate(&[feature(Geometry::Polygon(Polygon::new(square(10.0), vec![hole])))])?;

        assert_eq!(triangles.indices.len(), 8 * 3);
        Ok(())
    }

    #[test]
    fn tessellate_fills_overlapping_polygons() -> Result<(), TessellationError> {
        let polygon: Geometry<f32> = Geometry::Polygon(Polygon::new(square(10.0), vec![]));
        let triangles: VertexBuffers<[f32; 3], u32> = tessellate(&[feature(polygon.clone()), feature(polygon)])?;

        assert!(!triangles.indices.is_empty());
        Ok(())
    }

    #[test]
    fn tessellate_strokes_line_at_line_width() -> Result<(), TessellationError> {
        let line: LineString<f32> = LineString::from(vec![(0.0, 0.0), (100.0, 0.0)]);
        let triangles: VertexBuffers<[f32; 3], u32> = tessellate(&[feature(Geometry::LineString(line))])?;

        assert!(!triangles.indices.is_empty());
        assert!(triangles.vertices.iter().all(|[_, y, _]: &[f32; 3]| y.abs() == LINE_WIDTH / 2.0));
        Ok(())
    }

    #[test]
    fn tessellate_skips_points() -> Result<(), TessellationError> {
        let triangles: VertexBuffers<[f32; 3], u32> = tessellate(&[feature(Geometry::Point((1.0, 1.0).into()))])?;

        assert!(triangles.vertices.is_empty());
        Ok(())
    }

    #[test]
    fn mesh_keeps_triangles() -> Result<(), TessellationError> {
        let triangles: VertexBuffers<[f32; 3], u32> = tessellate(&[feature(Geometry::Polygon(Polygon::new(square(10.0), vec![])))])?;
        let mesh: Mesh = mesh(triangles);

        assert_eq!(mesh.count_vertices(), 4);
        assert_eq!(mesh.indices().map(Indices::len), Some(6));
        Ok(())
    }

    #[test]
    fn from_response_rejects_invalid_data() {
        assert!(OSMTile::from_response(vec![0xff], &[]).is_err());
    }
}
