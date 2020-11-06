/**
 * @author jscastro / https://github.com/jscastro76
 */


import { CSS2DRenderer } from './CSS2DRenderer';

export default class LabelRenderer
{

	constructor(map){

		this.map = map;

		this.minzoom = map.minzoom;

		this.maxzoom = map.maxzoom;

		this.zoomEventHandler;
		this.onZoomRange = true;

		this.renderer = new CSS2DRenderer();

		this.renderer.setSize(this.map.getCanvas().clientWidth, this.map.getCanvas().clientHeight);
		this.renderer.domElement.style.position = 'absolute';
		this.renderer.domElement.id = 'labelCanvas'; //TODO: this value must come by parameter
		this.renderer.domElement.style.top = 0;
		this.map.getCanvasContainer().appendChild(this.renderer.domElement);

		this.scene, this.camera;
		
		this.map.on('resize', function () {
			this.renderer.setSize(this.map.getCanvas().clientWidth, this.map.getCanvas().clientHeight);
		}.bind(this));
		this.state = {
			reset: function () {
				//TODO: Implement a good state reset, check out what is made in WebGlRenderer
			}
		}
	}

	dispose () {
		this.map.getCanvasContainer().removeChild(this.renderer.domElement)
		this.renderer.domElement.remove();
		this.renderer = {};
	}

	setSize(width, height) {
		this.renderer.setSize(width, height);
	}

	render(scene, camera) {
		this.scene = scene;
		this.camera = camera;
		this.renderer.render(scene, camera);
	}

	setZoomRange(minzoom, maxzoom) {
		//[jscastro] we only attach once if there are multiple custom layers
		if (!this.zoomEventHandler) {
			this.minzoom = minzoom;
			this.maxzoom = maxzoom;
			this.zoomEventHandler = this.mapZoom.bind(this);
			this.map.on('zoom', this.zoomEventHandler);
		}
	}

	mapZoom(e) {
		if (this.map.getZoom() < this.minzoom || this.map.getZoom() > this.maxzoom) {
			this.toggleLabels(false);
		} else {
			this.toggleLabels(true);
		}
	}

	//[jscastro] method to toggle Layer visibility
	toggleLabels(visible) {
		if (this.onZoomRange != visible) {
			// [jscastro] Render any label
			this.setVisibility(visible, this.scene, this.camera, this.renderer);
			this.onZoomRange = visible;
		}
	}

	//[jscastro] method to set visibility
	setVisibility(visible, scene, camera, renderer) {
		var cache = this.renderer.cacheList;
		cache.forEach(function (l) {
			if (l.visible != visible) {
				if ((visible && l.alwaysVisible) || !visible) {
					l.visible = visible;
					renderer.renderObject(l, scene, camera);
				}
			}
		});
	}
}
