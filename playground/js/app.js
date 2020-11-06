// import { Scene } from 'three';

import Threebox from '../../src/Threebox_2';

import mapboxgl, { Map } from "mapbox-gl";

import { adaptEsriMapStyle }from './esriStyleAdapter.js';

async function main(){

    console.log("youpi")
    const response = await  fetch('./mapstyle.json');
    const esriMapStyle = await response.json();
    const mapStyle = await adaptEsriMapStyle(esriMapStyle);

    console.log(mapStyle);

    const container = document.querySelector('.map-container');

    // SW, NE
    const maxBounds = [
        [ 5.4052734375, 45.838367585245855 ],
        [ 7.248229980468751, 46.66263249079177 ]
    ];
    
    const genevaCoords = [6.14569, 46.20222];


    mapboxgl.accessToken = 'ezree';
    const map = new Map({
            container: container, // container id
            style: mapStyle,
            pitch: 50, // pitch in degrees
            center: genevaCoords,
            zoom: 12, // starting zoom,
            minZoom: 9,
            maxZoom: 18,
            maxBounds: maxBounds,
            attributionControl:false,
    });
    //console.log("tb", window.Threebox);

    let tb;

    map.on('style.load', function() {

			map.addLayer({
				id: 'custom_layer',
				type: 'custom',
				onAdd: function(map, mbxContext){

					tb = new Threebox(
						map, 
						mbxContext,
						{ defaultLights: true }
					);

					//instantiate a red sphere and position it at the origin lnglat
					var sphere = tb.sphere({color: 'red', material: 'MeshToonMaterial'})
						.setCoords(genevaCoords);
					// add sphere to the scene
					tb.add(sphere);

				},
				
				render: function (gl, matrix) {
					tb.update();
				}
			})
		});

}


main();

