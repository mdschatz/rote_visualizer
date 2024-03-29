/////////////////////////
/// Globals
/////////////////////////
// Imports
import * as TWEEN from '@tweenjs/tween.js'
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import $ from 'jquery';


////////////////////////////////////////////
////////    Scene Rending info   ///////////
////////////////////////////////////////////

//Containers on the page

export var canvasName = 'container1';
var jqCanvasName = '#' + canvasName;

//Screen sizes
export var canvasHeight = $(jqCanvasName).height();
export var canvasWidth = $(jqCanvasName).width();

//Necessary objects in the scene
export var gblScene = new THREE.Scene();
gblScene.background = new THREE.Color(0x000000);
export var gblCamera = new THREE.PerspectiveCamera( 75, canvasWidth / canvasHeight, 1, 1600 );
gblCamera.up = new THREE.Vector3(0, -1, 0);
gblCamera.position.z = -30;

export var renderer = new THREE.WebGLRenderer();
renderer.setSize( canvasWidth, canvasHeight);

document.getElementById(canvasName).appendChild( renderer.domElement );

export var tensorDistInfo = document.createElement('div');
tensorDistInfo.id = 'textSelectedElem';
tensorDistInfo.style.cssText = 'color:#0ff; font-family:Helvetica,Arial,sans-serif;font-size:9px;font-weight:bold;line-height:15px';
tensorDistInfo.style.position = 'absolute';
tensorDistInfo.style.top = '0px';
tensorDistInfo.style.left = '0px';
tensorDistInfo.innerHTML = 'Tensor Distribution: '
document.getElementById(canvasName).appendChild(tensorDistInfo);

export var selectedTensorElem = document.createElement('div');
selectedTensorElem.id = 'textSelectedElem';
selectedTensorElem.style.cssText = 'color:#0ff; font-family:Helvetica,Arial,sans-serif;font-size:9px;font-weight:bold;line-height:15px';
selectedTensorElem.style.position = 'absolute';
selectedTensorElem.style.top = '20px';
selectedTensorElem.style.left = '0px';
selectedTensorElem.innerHTML = 'Global Loc: '
document.getElementById(canvasName).appendChild(selectedTensorElem);

//Controllers
export var sceneControls = new OrbitControls(gblCamera, renderer.domElement);

//Lights
gblScene.add(new THREE.AmbientLight(0xffffff));

//Rendering functions
export var render = function () {
	sceneControls.update();

	renderer.render(gblScene, gblCamera);
};

export function animate() {
	requestAnimationFrame( animate );
	TWEEN.update();
	render();
};
