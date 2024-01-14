/////////////////////////
/// Globals
/////////////////////////
// Imports
import * as TWEEN from '@tweenjs/tween.js'
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import $ from 'jquery';

//GUI-related globals

export var guiInputStrings = {ag:  {input1: 'Mode',              input2: 'IGNORE'},
		       rs:  {input1: 'Reduce Mode',       input2: 'Scatter Mode'},
		       p2p: {input1: 'Permute Mode',      input2: 'Mode Dist'},
		       a2a: {input1: 'Final tensor dist', input2: 'IGNORE'}
		   };

//Rendering constants
//Space between higher dimensions and their growth factors (when mapping multiple modes to 1)
export var interGridHigherDimPad = 6;
export var interGridHigherDimPadGrowthFactor = 1.2;
export var interElemHigherDimPad = .5;
export var interElemHigherDimPadGrowthFactor = 2;
//Size of the cube representing an element
export var cubeSize = 1;
huh
////////////////////////////////////////////
////////    Scene Rending info   ///////////
////////////////////////////////////////////

//Containers on the page

export var tensorCanvasName = 'container1';
var jqTensorCanvasName = '#' + tensorCanvasName;

//Screen sizes
export var tensorCanvasStart = $(jqTensorCanvasName).offset();
export var tensorCanvasHeight = $(jqTensorCanvasName).height();
export var tensorCanvasWidth = $(jqTensorCanvasName).width();

//Necessary objects in the scene
export var gblTensorScene = new THREE.Scene();
gblTensorScene.background = new THREE.Color(0xffffff);
export var gblTensorCamera = new THREE.PerspectiveCamera( 75, tensorCanvasWidth / tensorCanvasHeight, 1, 1600 );
gblTensorCamera.up = new THREE.Vector3(0, -1, 0);
gblTensorCamera.position.z = -30;

export var tensorRenderer = new THREE.WebGLRenderer();
tensorRenderer.setSize( tensorCanvasWidth, tensorCanvasHeight);

document.getElementById(tensorCanvasName).appendChild( tensorRenderer.domElement );

export var tensorDistInfo = document.createElement('div');
tensorDistInfo.id = 'textSelectedElem';
tensorDistInfo.style.cssText = 'color:#0ff; font-family:Helvetica,Arial,sans-serif;font-size:9px;font-weight:bold;line-height:15px';
tensorDistInfo.style.position = 'absolute';
tensorDistInfo.style.top = '0px';
tensorDistInfo.style.left = '0px';
tensorDistInfo.innerHTML = 'Tensor Distribution: '
document.getElementById(tensorCanvasName).appendChild(tensorDistInfo);

export var selectedTensorElem = document.createElement('div');
selectedTensorElem.id = 'textSelectedElem';
selectedTensorElem.style.cssText = 'color:#0ff; font-family:Helvetica,Arial,sans-serif;font-size:9px;font-weight:bold;line-height:15px';
selectedTensorElem.style.position = 'absolute';
selectedTensorElem.style.top = '20px';
selectedTensorElem.style.left = '0px';
selectedTensorElem.innerHTML = 'Global Loc: '
document.getElementById(tensorCanvasName).appendChild(selectedTensorElem);

//Controllers
export var tensorControls = new OrbitControls(gblTensorCamera, tensorRenderer.domElement);

//Lights
export var tensorPointLight = new THREE.AmbientLight(0xffffff);
gblTensorScene.add(tensorPointLight);

//Rendering functions
export var render = function () {
	//tensorPointLight.position.set(gblTensorCamera.position);

	tensorControls.update();

	tensorRenderer.render(gblTensorScene, gblTensorCamera);
};

export function animate() {
	requestAnimationFrame( animate );
	TWEEN.update();
	render();
};
