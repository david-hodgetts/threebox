// esri to mapbox -> // https://gist.github.com/jgravois/51e2b30e3d6cf6c00f06b263a29108a2

function format(style, metadata) {
    // ArcGIS Pro published vector services dont prepend tile or tileMap urls with a /
    style.sources.esri = {
        type: 'vector',
        scheme: 'xyz',
        tilejson: metadata.tilejson || '2.0.0',
        format: (metadata.tileInfo && metadata.tileInfo.format) || 'pbf',
        /* mapbox-gl-js does not respect the indexing of esri tiles
        because we cache to different zoom levels depending on feature density, in rural areas 404s will still be encountered.
        more info: https://github.com/mapbox/mapbox-gl-js/pull/1377
        */
        // index: metadata.tileMap ? style.sources.esri.url + '/' + metadata.tileMap : null,
        maxzoom: 15,
        tiles: [
            style.sources.esri.url + '/' + metadata.tiles[0]
        ],
        description: metadata.description,
        name: metadata.name
    };
    return style;
}

export async function adaptEsriMapStyle(mapStyle){
    const metadataUrl = mapStyle.sources.esri.url;
    const resp = await fetch(metadataUrl);
    const metadata = await resp.json();
    return format(mapStyle, metadata);
}