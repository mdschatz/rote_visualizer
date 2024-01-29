import { 
	get_tensor,
	set_tensor,
	DistTensor,
	RedistributeAG,
	RedistributeRS,
} from './dist_tensor.js';
import {
	animate,
	canvasWidth,
	canvasHeight,
	canvasName,
	gblScene,
	gblCamera,
	render,
	sceneControls,
	selectedTensorElem,
	tensorDistInfo,
} from './globals.js';
import {
	GetResultingDist,
} from './util.js';
import {
	TensorDist2String,
	String2TensorDist,
	parseIntArray,
} from './input.js';

import * as dat from 'dat.gui';
import * as THREE from 'three';
import _ from 'underscore';

var gui;
var redistGui;
var redistButton;
var guiParams;
var guiInputStrings = {
	ag:  {input1: 'tMode',               input2: ''},
	rs:  {input1: 'Reduce tMode',        input2: 'Scatter tMode'},
	p2p: {input1: 'Permute tMode',       input2: 'mDist'},
	a2a: {input1: 'Final tDist',         input2: ''},
};


class Params {
	constructor() {
		this.defaultInputs = {
			'ag': {input1: '0', input2: ''},
			'rs': {input1: '0', input2: '1'},
			'a2a': {input1: '[(1), (0)]', input2: ''},
			'p2p': {input1: '0', input2: ''},
		};
		this.tShape = '4,8';
		this.gShape = '2,4';
		this.tDist = '[(0), (1)]';
		this.commType = 'a2a';
		this.input1 = this.defaultInputs[this.commType].input1;
		this.input2 = this.defaultInputs[this.commType].input2;
	}
	distribute() {
		var tensor = get_tensor();
		if(!tensor.haveVisualized){
			alert("You must visualize the grid and tensor first"); 
			return;
		} 
		if(!tensor.canRedist)
			return;
		var tShape = parseIntArray(this.tShape);
		var gShape = parseIntArray(this.gShape);
		RedistributeAG(gShape, String2TensorDist(gShape.length, tShape.length, this.tDist));
	}

	clearScene(){
		//Clear tensor info
		var objsToRemove = _.rest(gblScene.children, 1);
		_.each(objsToRemove, o => gblScene.remove(o));
		render();

		redistButton.name(GetRedistButtonName(guiParams.commType));
	}

	visualize() {
		this.clearScene();
		var gShape = parseIntArray(this.gShape);
		gShape = Array.from({length: gShape.length}, (x, i) => 1);
		var tShape = parseIntArray(this.tShape);

		set_tensor(new DistTensor(gShape, tShape, String2TensorDist(gShape.length, tShape.length, this.tDist)));
		var tensor = get_tensor();

		if(!tensor.canRedist)
			return;
		tensor.createCubes();
		gblScene.add(new THREE.AxesHelper(5));

		tensor.visualize(); 
	}

	redistribute() {
		var tensor = get_tensor();
		if(!tensor.haveVisualized){
			alert("You must visualize the grid and tensor first"); 
			return;
		} 
		if(!tensor.canRedist)
			return;
		var resDist = GetResultingDist(tensor.grid.order, tensor.order, tensor.dist, this.commType, this.input1, this.input2);
		if((typeof resDist == 'undefined'))
			return;

		switch(this.commType){
			case 'rs': RedistributeRS(parseInt(this.input1), parseIntArray(this.gShape), resDist); break;
			case 'ag': RedistributeAG(parseIntArray(this.gShape), resDist); break;
			case 'p2p': RedistributeAG(parseIntArray(this.gShape), resDist); break;
			case 'a2a': RedistributeAG(parseIntArray(this.gShape), resDist); break;
		}
		redistButton.name(GetRedistButtonName(this.commType));
	}
}

//What to display on the Redist button
function GetRedistButtonName(commType){
	switch(commType){
		case 'rs': return 'Reduce-scatter';
		case 'ag': return 'Allgather';
		case 'p2p': return 'Peer-to-peer';
		case 'a2a': return 'All-to-all';
	}
}

//Tell which cube is hovered over
function onSceneMouseMove(event) {
	event.preventDefault();

	var tensor = get_tensor();
	if (typeof tensor == 'undefined')
		return;

	var vector = new THREE.Vector3( (( event.clientX -this.offsetLeft) / canvasWidth ) * 2 - 1, - ( (event.clientY - this.offsetTop)/ canvasHeight ) * 2 + 1, 0.5 );
	vector.unproject(gblCamera);

	var msg = 'Global Loc: ';
	if(tensor.nelem > 0) {
		var raycaster = new THREE.Raycaster( gblCamera.position, vector.sub( gblCamera.position ).normalize() );
		var cubes = [];
		for (const [pLoc, p] of tensor.grid.procs.entries()) {
			for (const [cLoc, c] of p.data.entries()) {
				cubes.push(c);
			}
		}
		var intersects = raycaster.intersectObjects( cubes );

		if(intersects.length > 0) {
			msg += '(' + intersects[0].object.name + ')';
		}

	}

	vector = new THREE.Vector3( (( event.clientX -this.offsetLeft) / canvasWidth ) * 2 - 1, - ( (event.clientY - this.offsetTop)/ canvasHeight ) * 2 + 1, 0.5 );
	vector.unproject(gblCamera);


	msg += ' Grid Loc: ';
	if (tensor.grid.nprocs > 0) {
		var raycaster = new THREE.Raycaster( gblCamera.position, vector.sub( gblCamera.position ).normalize() );
		var cubes = [];
		for (const [p, c] of tensor.grid.procCubes.entries()) {
			cubes.push(c);
		}
		var intersects = raycaster.intersectObjects( cubes );

		for(var cube of cubes) {
			cube.material.visible = false;
		}
		if(intersects.length > 0) {
			msg += '(' + intersects[0].object.name + ')';
			intersects[0].object.material.visible = true;
		}
	}
	selectedTensorElem.textContent = msg;

	//Update which tensor dist we are viewing
	tensorDistInfo.textContent = 'Tensor Distribution: ' + TensorDist2String(tensor.dist);
}

//Main code to run
function runme(){
	document.getElementById(canvasName).addEventListener('mousemove', onSceneMouseMove, false);

	//Initializing GUIs
	var defaultInputs = {'ag': {input1: '0', input2: ''},
			     'rs': {input1: '0', input2: '1'},
			     'a2a': {input1: '', input2: ''},
			     'p2p': {input1: '0', input2: ''}};

	guiParams = new Params();

	//Add the GUIs
	gui = new dat.GUI();
	gui.add(guiParams, 'tShape').name('Tensor Shape');
	gui.add(guiParams, 'gShape').name('Grid Shape');
	gui.add(guiParams, 'visualize').name('Visualize');
	gui.add(guiParams, 'tDist').name('Tensor Distribution');
	gui.add(guiParams, 'distribute').name('Distribute');
	gui.open();

	redistGui = new dat.GUI();
	var input1 = redistGui.add(guiParams, 'input1').name(guiInputStrings[guiParams.commType].input1);
	var input2 = redistGui.add(guiParams, 'input2').name(guiInputStrings[guiParams.commType].input2);
	var commType = redistGui.add(guiParams, 'commType', {Allgather: 'ag', ReduceScatter: 'rs', Permutation: 'p2p', AllToAll: 'a2a'}).name('Communication Type').onChange( function(value) {
		input1.name(guiInputStrings[guiParams.commType].input1);
		input2.name(guiInputStrings[guiParams.commType].input2);
		redistButton.name(GetRedistButtonName(guiParams.commType));
	});
	redistButton = redistGui.add(guiParams, 'redistribute').name(GetRedistButtonName(guiParams.commType));

	redistGui.open();
};

runme();
animate();
