/**
 * @author peterqliu / https://github.com/peterqliu
 * @author jscastro / https://github.com/jscastro76
 */

// var THREE = require("./three.js");
// var CameraSync = require("./camera/cameraSync.js");
// var utils = require("./utils/utils.js");
// var SunCalc = require("./utils/suncalc.js");
// var AnimationManager = require("./animation/animationManager.js");
// var ThreeboxConstants = require("./utils/constants.js");

// var Objects = require("./objects/objects.js");
// var material = require("./utils/material.js");
// var sphere = require("./objects/sphere.js");
// var label = require("./objects/label.js");
// var tooltip = require("./objects/tooltip.js");
// var loader = require("./objects/loadObj.js");
// var Object3D = require("./objects/Object3D.js");
// var line = require("./objects/line.js");
// var tube = require("./objects/tube.js");
// var LabelRenderer = require("./objects/LabelRenderer.js");
// var BuildingShadows = require("./objects/effects/BuildingShadows.js");

import utils from './utils/utils';

import CameraSync from './camera/cameraSync';

import { WebGLRenderer, sRGBEncoding, Scene, PerspectiveCamera, Group, Raycaster} from 'three';
import ThreeboxConstants from './utils/constants.js';

import Objects from './objects/objects.js';
import LabelRenderer from './objects/LabelRenderer.js';

const defaultOptions = {
	defaultLights: false,
	realSunlight: false,
	passiveRendering: true,
	enableSelectingFeatures: false,
	enableSelectingObjects: false,
	enableDraggingObjects: false,
	enableRotatingObjects: false,
	enableTooltips: false
};

export default class Threebox{
	constructor(map, glContext, options){

		// apply starter options
		this.options = utils._validate(options || {}, defaultOptions);

		this.map = map;
		this.map.tb = this; //[jscastro] needed if we want to queryRenderedFeatures from map.onload

		this.objects = new Objects();

		// Set up a THREE.js scene
		this.renderer = new WebGLRenderer({
			alpha: true,
			antialias: true,
			//preserveDrawingBuffer: true,
			canvas: map.getCanvas(),
			context: glContext
		});

		this.renderer.setPixelRatio(window.devicePixelRatio);
		this.renderer.setSize(this.map.getCanvas().clientWidth, this.map.getCanvas().clientHeight);
		this.renderer.outputEncoding = sRGBEncoding;
		this.renderer.autoClear = false;

		// [jscastro] set labelRendered
		this.labelRenderer = new LabelRenderer(this.map);

		this.scene = new Scene();
		this.camera = new PerspectiveCamera(ThreeboxConstants.FOV_DEGREES, this.map.getCanvas().clientWidth / this.map.getCanvas().clientHeight, 1, 1e21);
		this.camera.layers.enable(0);
		this.camera.layers.enable(1);

		// The CameraSync object will keep the Mapbox and THREE.js camera movements in sync.
		// It requires a world group to scale as we zoom in. Rotation is handled in the camera's
		// projection matrix itself (as is field of view and near/far clipping)
		// It automatically registers to listen for move events on the map so we don't need to do that here
		this.world = new Group();
		this.world.name = "world";
		this.scene.add(this.world);

		this.objectsCache = new Map();
		
		this.cameraSync = new CameraSync(this.map, this.camera, this.world);

		//raycaster for mouse events
		this.raycaster = new Raycaster();
		this.raycaster.layers.set(0);
		//this.raycaster.params.Points.threshold = 100;

		this.mapCenter = this.map.getCenter();
		this.mapCenterUnits = utils.projectToWorld([this.mapCenter.lng, this.mapCenter.lat]);
		this.lightDateTime = new Date();
		this.lightLng = this.mapCenter.lng;
		this.lightLat = this.mapCenter.lat;
		this.sunPosition;

		this.lights = this.initLights;
		if (this.options.defaultLights) this.defaultLights();
		if (this.options.realSunlight) this.realSunlight();
		if (this.options.enableSelectingFeatures) this.enableSelectingFeatures = this.options.enableSelectingFeatures;
		if (this.options.enableSelectingObjects) this.enableSelectingObjects = this.options.enableSelectingObjects;
		if (this.options.enableDraggingObjects) this.enableDraggingObjects = this.options.enableDraggingObjects;
		if (this.options.enableRotatingObjects) this.enableRotatingObjects = this.options.enableRotatingObjects;
		if (this.options.enableTooltips) this.enableTooltips = this.options.enableTooltips;

		//[jscastro] new event map on load
		this.map.on('load', function () {

			//[jscastro] new fields to manage events on map
			let selectedObject; //selected object through click
			let draggedObject; //dragged object through mousedown + mousemove
			let draggedAction; //dragged action to notify frontend
			let overedObject; //overed object through mouseover

			let overedFeature;//overed state for extrusion layer features
			let selectedFeature;//selected state id for extrusion layer features

			let canvas = this.getCanvasContainer();
			this.getCanvasContainer().style.cursor = 'default';
			// Variable to hold the starting xy coordinates
			// when 'mousedown' occured.
			let start;
			let rotationStep = 10;// degrees step size for rotation
			let gridStep = 6;// decimals to adjust the lnglat

			//when object selected
			let startCoords = [];

			// Variable to hold the current xy coordinates
			// when 'mousemove' or 'mouseup' occurs.
			let current;

			// Variable for the draw box element.
			let box;

			let lngDiff; // difference between cursor and model left corner
			let latDiff; // difference between cursor and model bottom corner

			// Return the xy coordinates of the mouse position
			function mousePos(e) {
				var rect = canvas.getBoundingClientRect();
				return new mapboxgl.Point(
					e.originalEvent.clientX - rect.left - canvas.clientLeft,
					e.originalEvent.clientY - rect.top - canvas.clientTop
				);
			}

			function unselectFeature(f, map) {
				if (typeof f.id == 'undefined') return;
				map.setFeatureState(
					{ source: f.source, sourceLayer: f.sourceLayer, id: f.id },
					{ select: false }
				);

				removeTooltip(f, map);
				f = map.queryRenderedFeatures({ layers: [f.layer.id], filter: ["==", ['id'], f.id] })[0];
				// Dispatch new event f for unselected
				if (f) map.fire('SelectedFeatureChange', { detail: f });
				selectedFeature = null;

			}

			function selectFeature(f, map) {
				selectedFeature = f;
				map.setFeatureState(
					{ source: selectedFeature.source, sourceLayer: selectedFeature.sourceLayer, id: selectedFeature.id },
					{ select: true }
				);
				selectedFeature = map.queryRenderedFeatures({ layers: [selectedFeature.layer.id], filter: ["==", ['id'], selectedFeature.id] })[0];
				addTooltip(selectedFeature, map)
				// Dispatch new event SelectedFeature for selected
				map.fire('SelectedFeatureChange', { detail: selectedFeature });

			}

			function unoverFeature(f, map) {
				if (overedFeature && typeof overedFeature != 'undefined' && overedFeature.id != f) {
					map.setFeatureState(
						{ source: overedFeature.source, sourceLayer: overedFeature.sourceLayer, id: overedFeature.id },
						{ hover: false }
					);
					removeTooltip(overedFeature, map);
					overedFeature = null;
				}
			}


			function unselectObject(o) {
				//deselect, reset and return
				o.selected = false;
				selectedObject = null;
			}

			function addTooltip(f, map) {
				if (!map.tb.enableTooltips) return;
				let coordinates = map.tb.getFeatureCenter(f);
				let t = map.tb.tooltip({
					text: f.properties.name || f.id || f.type,
					mapboxStyle: true,
					feature: f
				});
				t.setCoords(coordinates);
				map.tb.add(t);
				f.tooltip = t;
				f.tooltip.tooltip.visible = true;
			}

			function removeTooltip(f, map) {
				if (f.tooltip) {
					f.tooltip.visibility = false;
					map.tb.remove(f.tooltip);
					f.tooltip = null;
				}
			}

			map.onContextMenu = function (e) {
				alert('contextMenu');
			}

			// onclick function
			map.onClick = function (e) {
				let intersectionExists
				let intersects = [];
				if (map.tb.enableSelectingObjects) {
					//raycast only if we are in a custom layer, for other layers go to the else, this avoids duplicated calls to raycaster
					intersects = this.tb.queryRenderedFeatures(e.point);
				}
				intersectionExists = typeof intersects[0] == 'object';
				// if intersect exists, highlight it
				if (intersectionExists) {

					let nearestObject = Threebox.prototype.findParent3DObject(intersects[0]);

					if (nearestObject) {
						//if extrusion object selected, unselect
						if (selectedFeature) {
							unselectFeature(selectedFeature, this);
						}
						//if not selected yet, select it
						if (!selectedObject) {
							selectedObject = nearestObject;
							selectedObject.selected = true;
						}
						else if (selectedObject.uuid != nearestObject.uuid) {
							//it's a different object, restore the previous and select the new one
							selectedObject.selected = false;
							nearestObject.selected = true;
							selectedObject = nearestObject;

						} else if (selectedObject.uuid == nearestObject.uuid) {
							//deselect, reset and return
							unselectObject(selectedObject);
							return;
						}

						// fire the Wireframed event to notify UI status change
						selectedObject.dispatchEvent(new CustomEvent('Wireframed', { detail: selectedObject, bubbles: true, cancelable: true }));
						selectedObject.dispatchEvent(new CustomEvent('IsPlayingChanged', { detail: selectedObject, bubbles: true, cancelable: true }));

						this.repaint = true;
						e.preventDefault();
					}
				}
				else {
					let features = [];
					if (map.tb.enableSelectingFeatures) {
						features = this.queryRenderedFeatures(e.point);
					}
					//now let's check the extrusion layer objects
					if (features.length > 0) {

						if (features[0].layer.type == 'fill-extrusion' && typeof features[0].id != 'undefined') {

							//if 3D object selected, unselect
							if (selectedObject) {
								unselectObject(selectedObject);
							}

							//if not selected yet, select it
							if (!selectedFeature) {
								selectFeature(features[0], this)
							}
							else if (selectedFeature.id != features[0].id) {
								//it's a different feature, restore the previous and select the new one
								unselectFeature(selectedFeature, this);
								selectFeature(features[0], this)

							} else if (selectedFeature.id == features[0].id) {
								//deselect, reset and return
								unselectFeature(selectedFeature, this);
								return;
							}

						}
					}
				}
			}

			map.onMouseMove = function (e) {
				// Capture the ongoing xy coordinates
				let current = mousePos(e);

				this.getCanvasContainer().style.cursor = 'default';
				//check if being rotated
				if (e.originalEvent.altKey && draggedObject) {

					if (!map.tb.enableRotatingObjects) return;
					draggedAction = 'rotate';
					// Set a UI indicator for dragging.
					this.getCanvasContainer().style.cursor = 'move';
					var minX = Math.min(start.x, current.x),
						maxX = Math.max(start.x, current.x),
						minY = Math.min(start.y, current.y),
						maxY = Math.max(start.y, current.y);
					//set the movement fluid we rotate only every 10px moved, in steps of 10 degrees up to 360
					let rotation = { x: 0, y: 0, z: 360 + ((~~((current.x - start.x) / rotationStep) % 360 * rotationStep) % 360) };
					//now rotate the model depending the axis
					draggedObject.setRotation(rotation);
					//draggedObject.setRotationAxis(rotation);
					return;
				}

				//check if being moved
				if (e.originalEvent.shiftKey && draggedObject) {
					if (!map.tb.enableDraggingObjects) return;

					draggedAction = 'translate';
					// Set a UI indicator for dragging.
					this.getCanvasContainer().style.cursor = 'move';
					// Capture the first xy coordinates, height must be the same to move on the same plane
					let coords = e.lngLat;
					let options = [Number((coords.lng + lngDiff).toFixed(gridStep)), Number((coords.lat + latDiff).toFixed(gridStep)), draggedObject.modelHeight];
					draggedObject.setCoords(options);
					return;
				}

				let intersectionExists
				let intersects = [];

				if (map.tb.enableSelectingObjects) {
					// calculate objects intersecting the picking ray
					intersects = this.tb.queryRenderedFeatures(e.point);
				}
				intersectionExists = typeof intersects[0] == 'object';

				// if intersect exists, highlight it, if not check the extrusion layer
				if (intersectionExists) {
					let nearestObject = Threebox.prototype.findParent3DObject(intersects[0]);
					if (nearestObject) {
						unoverFeature(overedFeature, this);
						this.getCanvasContainer().style.cursor = 'pointer';
						if (!selectedObject || nearestObject.uuid != selectedObject.uuid) {
							if (overedObject) {
								overedObject.over = false;
								overedObject = null;
							}
							nearestObject.over = true;
							overedObject = nearestObject;
						}
						this.repaint = true;
						e.preventDefault();
					}
				}
				else {
					//clean the object overed
					if (overedObject) { overedObject.over = false; overedObject = null; }
					//now let's check the extrusion layer objects
					let features = [];
					if (map.tb.enableSelectingFeatures) {
						features = this.queryRenderedFeatures(e.point);
					}
					if (features.length > 0) {
						unoverFeature(features[0], this);

						if (features[0].layer.type == 'fill-extrusion' && typeof features[0].id != 'undefined') {
							if ((!selectedFeature || selectedFeature.id != features[0].id)) {
								this.getCanvasContainer().style.cursor = 'pointer';
								overedFeature = features[0];
								this.setFeatureState(
									{ source: overedFeature.source, sourceLayer: overedFeature.sourceLayer, id: overedFeature.id },
									{ hover: true }
								);
								overedFeature = map.queryRenderedFeatures({ layers: [overedFeature.layer.id], filter: ["==", ['id'], overedFeature.id] })[0];
								addTooltip(overedFeature, this);

							}
						}
					}
				}

			}

			map.onMouseDown = function (e) {

				// Continue the rest of the function shiftkey or altkey are pressed, and if object is selected
				if (!((e.originalEvent.shiftKey || e.originalEvent.altKey) && e.originalEvent.button === 0 && selectedObject)) return;

				e.preventDefault();

				map.getCanvasContainer().style.cursor = 'move';

				// Disable default drag zooming when the shift key is held down.
				//map.dragPan.disable();

				// Call functions for the following events
				map.once('mouseup', map.onMouseUp);
				map.once('mouseout', map.onMouseUp);

				// move the selected object
				draggedObject = selectedObject;

				// Capture the first xy coordinates
				start = mousePos(e);
				startCoords = draggedObject.coordinates;
				lngDiff = startCoords[0] - e.lngLat.lng;
				latDiff = startCoords[1] - e.lngLat.lat;
			}

			map.onMouseUp = function (e) {

				// Set a UI indicator for dragging.
				this.getCanvasContainer().style.cursor = 'default';

				// Remove these events now that finish has been called.
				//map.off('mousemove', onMouseMove);
				this.off('mouseup', map.onMouseUp);
				this.off('mouseout', map.onMouseUp);
				this.dragPan.enable();

				if (draggedObject) {
					draggedObject.dispatchEvent(new CustomEvent('ObjectDragged', { detail: { draggedObject: draggedObject, draggedAction: draggedAction }, bubbles: true, cancelable: true }));

					draggedObject = null;
					draggedAction = null;
				};
			}

			map.onMouseOut = function (e) {
				if (overedFeature) {
					let features = this.queryRenderedFeatures(e.point);
					if (features.length > 0 && overedFeature.id != features[0].id) {
						this.getCanvasContainer().style.cursor = 'default';
						//only unover when new feature is another
						unoverFeature(features[0], this);
					}
				}
			}

			//listener to the events
			//this.on('contextmenu', map.onContextMenu);
			this.on('click', map.onClick);
			this.on('mousemove', map.onMouseMove);
			this.on('mouseout', map.onMouseOut)
			this.on('mousedown', map.onMouseDown);

		});

	}
}
