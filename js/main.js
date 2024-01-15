import { 
	animate,
	cube_sz,
    tensorCanvasStart,
    tensorCanvasWidth,
    tensorCanvasHeight,
    guiInputStrings,
    tensorCanvasName,
    gblTensorScene,
    gblTensorCamera,
    tensorDistInfo,
	selectedTensorElem,
	tensorControls,
	render,
	interGridHigherDimPad,
	interGridHigherDimPadGrowthFactor,
	interElemHigherDimPad,
	interElemHigherDimPadGrowthFactor,
} from './globals.js';
import * as THREE from 'three';
import * as dat from 'dat.gui';
import {
	mult,
	MaxLengths,
	Shape2Strides,
	GetHexColor,
	GetResultingDist,
} from './util.js';
import {
	TensorDist2String,
	String2TensorDist,
	parseIntArray,
	ParseInput
} from './input.js';
import _ from 'underscore';
import * as TWEEN from '@tweenjs/tween.js'

var gui;
var redistGui;
var redistButton;
var guiParams;

//Tensor and grid being displayed
var tensorCubes = [];

//Should we visualize a reduction or a scatter? (false == reduce)
var reduceOrScatter = false;

var numActiveTweens;
var canRedistTensor = true;

var tensor;

function linear2Multilinear(i, strides) {
	var remainder = i;
	var loc = [];
	loc.length = strides.length;

	for (var j = strides.length - 1; j >= 0; j--) {
		var dLoc = Math.floor(remainder / strides[j]);
		remainder -= dLoc * strides[j];
		loc[j] = dLoc;
	}
	return loc;
}

class Grid {
	constructor(shape = []) {
		this.type = 'Grid';
		this.shape = parseIntArray(shape);
	}
}

class DistTensor {
	constructor(grid, shape = [], dist = []) {
		this.type = 'Tensor';
		this.grid = grid;
		this.shape = Array.from(shape);
		this.strides = Shape2Strides(shape);
		this.dist = Array.from(dist);
		this.order = shape.length;
		this.nelem = shape.reduce(mult, 1);
		this.haveVisualized = false;
		this.haveDsitributed = false;
		this.canRedist = true;
		this.data = new Map();

		// Initialize data locs
		for (var i = 0; i < this.nelem; i++) {
			var loc = linear2Multilinear(i, this.strides);
			this.data.set(loc, null);
		}
	}

	createCubes() {
		for (var loc of this.data.keys()) {
			var sceneLoc = MapTensorLoc2SceneLocLocal(loc, this.shape);
			var color = GetHexColor(this.shape, loc);
			var cubeColor = new THREE.Color(color[0], color[1], color[2]);
			var cube = new THREE.Mesh(
				new THREE.BoxGeometry(cube_sz, cube_sz, cube_sz),
				new THREE.MeshPhongMaterial({
					color: new THREE.Color(color[0], color[1], color[2]),
					specular: cubeColor,
					shininess: 2
				}),
			);
			cube.name = loc.toString();
			cube.position.set(sceneLoc.x, sceneLoc.y, sceneLoc.z);
			this.data.set(loc, cube);
		}
	}

	visualize() {
		for (var loc of this.data.keys()) {
			gblTensorScene.add(this.data.get(loc));
		}
	}

	// Core methods
	owningProcs(loc) {
		// Check whether loc is in bounds
		if (!true) {
			alert("Supplied invalid location (" + loc.toString() + " for tensor shape " + this.shape.toString());
		}

		var pLoc = new Map();
		// Note: Clean this up
		for (var d = 0; d < this.grid.shape.length; d++) {
			pLoc[d] = -1;
		}


		for (var d = 0; d < loc.length; d++) {
			var i = loc[d];
			var mDist = this.dist[d];

			var lgShape = mDist.map((x) => this.grid.shape[x]);
			var lgDim = lgShape.reduce(mult, 1);
			var lp = i % lgDim;

			var gLoc = linear2Multilinear(lp, Shape2Strides(lgShape));
			for (var gD = 0; gD < gLoc.length; gD++) {
				pLoc.set(mDist[gD], gLoc[gD]);
			}
		}

		var owners = [Array.from({length: this.grid.shape.length}, (x, i) => -1)];
		for (const [d, i] of pLoc.entries()) {
			var end = owners.length;
			for (var j = 0; j < end; j++) {
				var owner = owners.shift();
				if (i >= 0) {
					owner[d] = i;
					owners.push(owner);
				} else {
					for (var k = 0; k < this.grid.shape[d]; k++) {
						owner[d] = k;
						owners.push(owner);
					}
				}
			}
		}
		return owners;
	}

	localLoc(globalLoc) {
		var owners = this.owningProcs(globalLoc);
		var localLocs = new Map();
		for (var owner of owners) {
			var localLoc = [];
			localLoc.length = this.order;

			for (var i = 0; i < localLoc.length; i++) {
				localLoc[i] = Math.floor((globalLoc[i] - owner[i]) / this.dist[i].map((x) => this.grid.shape[x]).reduce(mult, 1));
			}
			localLocs.set(owner, localLoc);
		}
		return localLocs;
	}

	maxLengths() {
		var lens = [];
		lens.length = tensor.order;

		for (var d = 0; d < this.order; d++) {
			var lgDim = this.dist[d].map((x) => this.grid.shape[x]).reduce(mult, 1);
			lens[d] = (this.shape[d] > 0 ? Math.floor((this.shape[d] - 1)/lgDim) + 1: 0);
		}
		return lens;
	}
}

class Params {
	constructor() {
		this.defaultInputs = {
			'ag': {input1: '0', input2: ''},
			'rs': {input1: '0', input2: '1'},
			'a2a': {input1: '', input2: ''},
			'p2p': {input1: '0', input2: ''},
		};
		this.tShape = '4,8,10,6';
		this.gShape = '2,4,5,3';
		this.tDist = '[(0), (1), (2), (3)]';
		this.commType = 'rs';
		this.input1 = this.defaultInputs[this.commType].input1;
		this.input2 = this.defaultInputs[this.commType].input2;
	}
	distribute() {
		if(!tensor.haveVisualized){
			alert("You must visualize the grid and tensor first"); 
			return;
		} 
		if(!tensor.canRedist)
			return;
		reduceOrScatter = false; 
		DistributeObjects(tensor.dist);
		tensor.haveDistributed = true;
	}

	clearScene(){
		//Clear tensor info
		var objsToRemove = _.rest(gblTensorScene.children, 1);
		_.each(objsToRemove, function (object){ gblTensorScene.remove(object);});
		render();

		//Reset gui params
		var params = ParseInput(this.tShape, this.gShape, this.tDist);
		var grid = new Grid(this.gShape);

		var tShape = parseIntArray(this.tShape);
		tensor = new DistTensor(grid, tShape, String2TensorDist(tShape.length, this.tDist));
		tensor.haveVisualized = false;
		tensor.haveDistributed = false;
		tensor.reduceOrScatter = false;
		tensor.canRedist = true;

		redistButton.name(GetRedistButtonName(guiParams.CommunicationType));
	}

	visualize() {
		this.clearScene();
		if(!tensor.canRedist)
			return;
		tensor.createCubes();
		gblTensorScene.add(new THREE.AxesHelper(5));

		tensor.visualize(); 
		tensor.haveVisualized = true;
	}

	redistribute() {
		if(!tensor.haveVisualized){
			alert("You must visualize the grid and tensor first"); 
			return;
		} 
		if(!tensor.haveDistributed){
			alert("You must distribute the tensor first"); 
			return;
		}
		if(!tensor.canRedist)
			return;

		var resDist = GetResultingDist(tensor.order, tensor.dist, this.commType, this.input1, this.input2, reduceOrScatter);
		if((typeof resDist == 'undefined'))
			return;

		switch(this.commType){
			case 'rs': RedistributeRS(input1, resDist); break;
			case 'ag': RedistributeAG(resDist); break;
			case 'p2p': DistributeObjects(resDist); break;
			case 'a2a': RedistributeA2A(resDist); break;
		}
		reduceOrScatter = !reduceOrScatter; 
		redistButton.name(GetRedistButtonName(this.commType));
	}
}

//Tell which cube is hovered over
function onTensorSceneMouseMove(event){
	event.preventDefault();

	var vector = new THREE.Vector3( (( event.clientX -this.offsetLeft) / tensorCanvasWidth ) * 2 - 1, - ( (event.clientY - this.offsetTop)/ tensorCanvasHeight ) * 2 + 1, 0.5 );

	// projector.unprojectVector( vector, gblTensorCamera );
	vector.unproject(gblTensorCamera);

	var msg = 'Global Loc: ';
	if(tensorCubes.length > 0){
		var raycaster = new THREE.Raycaster( gblTensorCamera.position, vector.sub( gblTensorCamera.position ).normalize() );
		var intersects = raycaster.intersectObjects( tensorCubes );

		if(intersects.length > 0){
			msg += '(' + intersects[0].object.tensorLoc + ')';
		}

	}

	selectedTensorElem.textContent = msg;

	//Update which tensor dist we are viewing
	tensorDistInfo.textContent = 'Tensor Distribution: ' + TensorDist2String(tensor.dist);
}

//Tell which processes being hovered over
//function onGridSceneMouseMove(event){
//	event.preventDefault();
//
//	var vector = new THREE.Vector3( (( event.clientX - this.offsetLeft) / gridCanvasWidth ) * 2 - 1, - (( event.clientY - this.offsetTop) / gridCanvasHeight ) * 2 + 1, 0.5 );
//
//	vector.unproject(gblGridCamera);
//
//	var msg = 'Process Loc: ';
//	if(gridCubes.length > 0){
//		var raycaster = new THREE.Raycaster( gblGridCamera.position, vector.sub( gblGridCamera.position ).normalize() );
//		var intersects = raycaster.intersectObjects( gridCubes );
//
//		if(intersects.length > 0){
//			msg += '(' + intersects[0].object.gridLoc + ')';
//			for(var i = 1; i < intersects.length; i++)
//				msg += ', (' + intersects[i].object.gridLoc + ')';
//		}
//	}
//
//	selectedGridElem.textContent = msg;
//}


//Returns list (ordered column major) of locations in a shape shaped tensor
function GetTensorLocs(shape){
	var locs = [];

	var nElems = shape.reduce(mult, 1);
	var strides = Shape2Strides(shape);

	for(var i = 0; i < nElems; i++){
		var remainder = i;
		var loc = [];
		loc.length = strides.length;

		for(var j = strides.length - 1; j >= 0; j--){
			var modeLoc = Math.floor(remainder / strides[j]);
			remainder -= modeLoc * strides[j];
			loc[j] = modeLoc;
		}
		locs.push(loc);
	}
	return locs;
}

function GetGridLocs(shape){
	return GetTensorLocs(shape);
}

//Given a grid and the distribution, figure out what the logical view is
function GetLGridShape(gridShape, tensorDist){
	var lGridShape = [];
	lGridShape.length = tensorDist.length;

	for(var i = 0; i < lGridShape.length; i++){
		var modeDist = tensorDist[i];
		if(modeDist.length == 0){
			lGridShape[i] = 1;
		} else{
			var lModeDim = modeDist.reduce(function(a, b){return a*gridShape[b];}, 1);
			lGridShape[i] = lModeDim;
		}
	}
	return lGridShape;
}

//Given a Loc in the grid, map it to a Loc in the LGrid
function MapGridLocs2LGridLocs(gridLocs, gridShape, lGridShape, tensorDist){
	var lGridLocs = [];

	for(var i = 0; i < gridLocs.length; i++){
		var gridLoc = gridLocs[i];

		var lGridLoc = [];
		lGridLoc.length = lGridShape.length;
		for(var j = 0; j < lGridShape.length; j++){
			var modeDist = tensorDist[j];
			var gridSlice = modeDist.map(function(a){return gridShape[a];});
			var gridSliceStrides = Shape2Strides(gridSlice);
			var gridSliceLoc = modeDist.map(function(a){return gridLoc[a];});

			//Can't figure out how to one line this
			var counter = 0;
			for(var k = 0; k < modeDist.length; k++)
				counter += gridSliceLoc[k] * gridSliceStrides[k];
			lGridLoc[j] = counter;
		}
		lGridLocs.push(lGridLoc);
	}
	return lGridLocs;
};

//NOTE: For purposes of scene rendering, X axis in object is Y axis in scene
//Maps a global location of the tensor to a location in the scene.
function MapTensorLoc2SceneLoc(mapTen, loc, dist, gridShape, lGridShape){
	var sceneDim = [1, 0, 2];
	// var lGridProcOwner = GetOwnerLGridLoc(loc, lGridShape);
	var owner = mapTen.owningProcs(loc);
	owner = owner[0];

	// var localLoc = GlobalLoc2LocalLoc(lGridProcOwner, loc, lGridShape);
	var localLoc = mapTen.localLoc(loc);
	localLoc = localLoc.values().next().value;

	//var maxLocalLengths = MaxLengths(tensor.shape, lGridShape);
	var maxLocalLengths = mapTen.maxLengths();

	var sceneLoc = [];
	sceneLoc.length = 3;
	for(var i = 0; i < sceneLoc.length; i++)
		sceneLoc[i] = cube_sz/2;

	for(var i = 0; i < 3; i++){
		if(i >= loc.length)
			break;

		//Upate sceneLoc[i]
		//First determine local offset
		//This will give us the localDimensionPerProc padding we need

		var pad = interElemHigherDimPad;
		var elemSize = cube_sz + pad;
		for(var j = i; j < loc.length; j += 3){
			sceneLoc[i] += elemSize * localLoc[j];

			pad *= interElemHigherDimPadGrowthFactor;
			elemSize = maxLocalLengths[j] * elemSize + pad;
		}

		//Now figure out the offset due to the process loc (we have the local size offset stored in 'pad')
		pad = interGridHigherDimPad;
		elemSize = elemSize + pad;
		for (var j = i; j < owner.length; j += 3) {
			sceneLoc[i] += elemSize * owner[j];

			pad *= interGridHigherDimPadGrowthFactor;
			elemSize = mapTen.grid.shape[j] * elemSize + pad;
		}
	}

	return new THREE.Vector3(sceneLoc[sceneDim[0]], sceneLoc[sceneDim[1]], sceneLoc[sceneDim[2]]);
}

//NOTE: Hack for the initial grid
//NOTE: For purposes of scene rendering, X axis in object is Y axis in scene
//Hack is for initial visualization.  Resembles MapTensorLoc2SceneLoc
function MapTensorLoc2SceneLocLocal(loc, gridShape){
	var sceneDim = [1, 0, 2];

	var sceneLoc = [];
	sceneLoc.length = 3;
	for(var i = 0; i < sceneLoc.length; i++)
		sceneLoc[i] = cube_sz/2;

	for(var i = 0; i < 3; i++){
		if( i >= loc.length)
			break;

		//Update sceneLoc[i]
		var pad = interElemHigherDimPad;
		var elemSize = cube_sz + pad;
		for(var j = i; j < loc.length; j += 3){
			sceneLoc[i] += elemSize * loc[j];

			pad *= interElemHigherDimPadGrowthFactor;
			elemSize = gridShape[j] * elemSize + pad;
		}
	}

	return new THREE.Vector3(sceneLoc[sceneDim[0]], sceneLoc[sceneDim[1]], sceneLoc[sceneDim[2]]);
}


function DistributeTensor(dist, lGridShape) {
	var mapTen = new DistTensor(tensor.grid, tensor.shape, dist);
	var tweens = [];
	for(var loc of tensor.data.keys()) {
		var cube = tensor.data.get(loc);
		var fLoc = MapTensorLoc2SceneLoc(mapTen, loc, dist, tensor.grid.shape, lGridShape);
		tweens.push(new TWEEN.Tween(cube.position)
			.to(fLoc, 2000)
			.easing(TWEEN.Easing.Exponential.Out)
			.onComplete(CompleteTween));
	}
	numActiveTweens = tweens.length;
	tensor.canRedist = false;

	// Start the tweens
	for (var tween of tweens)
		tween.start();
}

function DistributeObjects(dist){
	if(typeof dist  == 'undefined')
		return;

	var lGridShape = GetLGridShape(tensor.grid.shape, dist);

	DistributeTensor(dist, lGridShape);
}

//Convert a global location to a process's local one
function GlobalLoc2LocalLoc(ownerLoc, globalLoc, lGridShape){
	var localLoc = [];
	localLoc.length = globalLoc.length;

	for(var i = 0; i < localLoc.length; i++){
		localLoc[i] = Math.floor((globalLoc[i] - ownerLoc[i]) / lGridShape[i]);
	}
	return localLoc;
}

//Figure out who owns the global loc element
function GetOwnerLGridLoc(globalLoc, lGridShape){
	var ownerLoc = [];
	ownerLoc.length = globalLoc.length;
	for(var i = 0; i < ownerLoc.length; i++)
		ownerLoc[i] = globalLoc[i] % lGridShape[i];
	return ownerLoc;
}

//When a tween of Reduce phase of ReduceScatter finished
function CompleteReduceTween(){
	var rMode = this.rMode;
	var thisCube = this.obj;
	var thisLoc = thisCube.tensorLoc;

	//Remove all cubes that were there only for accumulation
	var thisCubeIndex;
	for(var i = 0; i < tensor.locs.length; i++){
		if(thisLoc.toString() == tensorInfo.locs[i].toString()){
			thisCubeIndex = i;
			break;
		}
	}

	if(thisLoc[rMode] != 0){
		//Remove from list of locs and cubes
		tensorInfo.locs.splice(thisCubeIndex, 1);

		var cubeToRemove = tensorCubes.splice(thisCubeIndex, 1);
		gblTensorScene.remove(cubeToRemove[0]);
	}else{
		tensorInfo.locs[thisCubeIndex].splice(rMode, 1);
	}

	//Enable gui functionality
	numActiveTensorTweens -= 1;
	if(numActiveTensorTweens == 0)
		canRedistTensor = true;
}

//When a tween on the tensor side finishes
function CompleteTween(){
	//Enable gui functionality
	numActiveTweens -= 1;
	if(numActiveTweens == 0)
		tensor.canRedist = true;
}

//Mimicks DistributeObjects with minor changes (accumLoc)
function RedistributeR(rMode){
	//Create the tweens
	var tensorTweens = [];
	for(var i = 0; i < tensorCubes.length; i++){
		var tensorCube = tensorCubes[i];
		var accumLoc = tensorCube.tensorLoc.slice(0);
		accumLoc[rMode] = 0;

		var finalLoc = MapTensorLoc2SceneLoc(accumLoc, tensorInfo.dist, gridInfo.shape, gridInfo.lGridShape);

		var tweenObj = {x: tensorCube.position.x,
				y: tensorCube.position.y,
				z: tensorCube.position.z,
				rMode: rMode,
				obj: tensorCube};
		tensorTweens.push(new TWEEN.Tween(tensorCube.position)
					   .to(finalLoc, 2000)
					   .easing(TWEEN.Easing.Exponential.Out));
	}

	canRedistTensor = false;
	numActiveTensorTweens = tensorTweens.length;
	//Start the tweens
	for(var i = 0; i < tensorTweens.length; i++)
		tensorTweens[i].start();

	//Update global tensor info
	tensorInfo.shape[rMode] = 1;
}

//ReduceScatter display is split into two phases: Reduce, Scatter
function RedistributeRS(rModeStr, resDist){
	if(!reduceOrScatter){
		var rMode = parseInt(rModeStr);
		if(isNaN(rMode)){
			alert("Malformed Reduce Mode: Reduce Mode is NaN");
			return;
		}else if(rMode < 0 || rMode >= tensor.order){
			alert("Malformed Reduce Mode: Reduce Mode " + rMode + " is out of range");
			return;
		}

		RedistributeR(rMode);

		//update global info
		tensorInfo.shape.splice(rMode, 1);
	}else{
		render();
		DistributeObjects(resDist);
	}
}

function RedistributeAG(dist){
	DistributeObjects(dist);
}

function RedistributeP2P(dist){
	DistributeObjects(dist);
} 

function RedistributeA2A(dist){
	DistributeObjects(dist);
}

//What to display on the Redist button
function GetRedistButtonName(commType){
	switch(commType){
		case 'rs': return ((!reduceOrScatter) ? 'Reduce' : 'Scatter');
		case 'ag': return 'Allgather';
		case 'p2p': return 'Peer-to-peer';
		case 'a2a': return 'All-to-all';
	}
}

//Main code to run
function runme(){
	//document.getElementById(tensorCanvasName).addEventListener('mousemove', onTensorSceneMouseMove, false);

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
