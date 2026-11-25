use mvt_reader::Reader;
use mvt_reader::error::ParserError;

#[derive(Debug, PartialEq)]
pub struct OSMTile {
    pub layer_names: Vec<String>,
}

impl OSMTile {
    pub fn from_response(response: Vec<u8>) -> Result<OSMTile, ParserError> {
        let reader: Reader = Reader::new(response)?;

        Ok(OSMTile {
            layer_names: reader.get_layer_names()?,
        })
    }
}

#[cfg(test)]
pub mod tests {
    use super::*;

    // OpenFreeMap tile 14/9253/6039: central Sofia.
    pub const SOFIA_TILE: &[u8] = include_bytes!("../tests/fixtures/sofia_14_9253_6039.pbf");

    #[test]
    fn from_response_reads_layer_names() -> Result<(), ParserError> {
        let tile: OSMTile = OSMTile::from_response(SOFIA_TILE.to_vec())?;

        assert_eq!(
            tile.layer_names,
            [
                "aeroway",
                "boundary",
                "building",
                "housenumber",
                "landcover",
                "landuse",
                "park",
                "place",
                "poi",
                "transportation",
                "transportation_name",
                "water",
                "water_name",
                "waterway",
            ]
        );
        Ok(())
    }

    #[test]
    fn from_response_rejects_invalid_data() {
        assert!(OSMTile::from_response(vec![0xff]).is_err());
    }
}
