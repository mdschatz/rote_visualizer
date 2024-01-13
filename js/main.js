import { 
	animate,
	cubeSize,
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
	ParseInput
} from './input.js';
import _ from 'underscore';
import * as TWEEN from '@tweenjs/tween.js'

var gui;
var redistGui;
var redistButton;
var guiParams;

//Object-related information
var tensorInfo = {shape: [],
		  dist: [],
		  locs: []};
var gridInfo = {shape: [],
		locs: [],
		lGridShape: [],
		lGridLocs: []};

//Tensor and grid being displayed
var tensorCubes = [];
var gridCubes = [];

//For blocking spamming of Redist and Dist buttons
var haveVisualized = false;
var haveDistributed = false;

//Should we visualize a reduction or a scatter? (false == reduce)
var reduceOrScatter = false;

var numActiveTensorTweens;
var canRedistTensor = true;

//Resets the scenes
function clearScenes(){
	//Clear tensor info
	var objsToRemove = _.rest(gblTensorScene.children, 1);
	_.each(objsToRemove, function ( object){ gblTensorScene.remove(object);});
	render();
	tensorCubes.length = [];
	tensorInfo = {shape: [],
		      dist: [],
		      locs: []};

	gridInfo = {shape: [],
		    locs: [],
		    lGridShape: [],
		    lGridLocs: []};

	//Reset gui params
	haveVisualized = false;
	haveDistributed = false;
	reduceOrScatter = false;
	canRedistTensor = true;

	redistButton.name(GetRedistButtonName(guiParams.CommunicationType));
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
	tensorDistInfo.textContent = 'Tensor Distribution: ' + TensorDist2String(tensorInfo.dist);
}

//Tell which processes being hovered over
/*
function onGridSceneMouseMove(event){
	event.preventDefault();

	var vector = new THREE.Vector3( (( event.clientX - this.offsetLeft) / gridCanvasWidth ) * 2 - 1, - (( event.clientY - this.offsetTop) / gridCanvasHeight ) * 2 + 1, 0.5 );

	vector.unproject(gblGridCamera);

	var msg = 'Process Loc: ';
	if(gridCubes.length > 0){
		var raycaster = new THREE.Raycaster( gblGridCamera.position, vector.sub( gblGridCamera.position ).normalize() );
		var intersects = raycaster.intersectObjects( gridCubes );

		if(intersects.length > 0){
			msg += '(' + intersects[0].object.gridLoc + ')';
			for(var i = 1; i < intersects.length; i++)
				msg += ', (' + intersects[i].object.gridLoc + ')';
		}
	}

	selectedGridElem.textContent = msg;
}
*/

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

//Form the tensor cubes to display
function CreateTensorCubes(){
	var tensorShape = tensorInfo.shape;
	var tensorLocs = tensorInfo.locs;
	var nElems = tensorLocs.length;

	tensorCubes.length = nElems;
	for(var i = 0; i < nElems; i++){
		var tensorLoc = tensorLocs[i];
		var hexColor = GetHexColor(tensorShape, tensorLoc);
		var cubeColor = new THREE.Color(hexColor[0], hexColor[1], hexColor[2]);
		var cubeMaterial = new THREE.MeshPhongMaterial({
								color: cubeColor,
								specular: cubeColor,
								shininess: 2
							       });
		var cube = new THREE.Mesh(new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize), cubeMaterial);
		cube['tensorLoc'] = tensorLoc;
		cube.name = tensorLoc.toString();
		tensorCubes[i] = cube;
	}
}

function InitGlobals(tensorShape, gridShape, tensorDist){
	var params = ParseInput(tensorShape, gridShape, tensorDist);

	tensorInfo['shape'] = params.tensorShape;
	tensorInfo['locs'] = GetTensorLocs(tensorInfo.shape);

	gridInfo['shape'] = params.gridShape;
	gridInfo['locs'] = GetGridLocs(gridInfo.shape);

	CreateTensorCubes();

	//Add Axis to scenes for orientation
	gblTensorScene.add( new THREE.AxesHelper(5) );
}

//NOTE: For purposes of scene rendering, X axis in object is Y axis in scene
//Maps a global location of the tensor to a location in the scene.
function MapTensorLoc2SceneLoc(loc, dist, gridShape, lGridShape){
	var sceneDim = [1, 0, 2];
	var lGridProcOwner = GetOwnerLGridLoc(loc, lGridShape);

	var localLoc = GlobalLoc2LocalLoc(lGridProcOwner, loc, lGridShape);

	var maxLocalLengths = MaxLengths(tensorInfo.shape, lGridShape);

	var sceneLoc = [];
	sceneLoc.length = 3;
	for(var i = 0; i < sceneLoc.length; i++)
		sceneLoc[i] = cubeSize/2;


	for(var i = 0; i < 3; i++){
		if(i >= loc.length)
			break;

		//Upate sceneLoc[i]
		//First determine local offset
		//This will give us the localDimensionPerProc padding we need

		var pad = interElemHigherDimPad;
		var elemSize = cubeSize + pad;
		for(var j = i; j < loc.length; j += 3){
			sceneLoc[i] += elemSize * localLoc[j];

			pad *= interElemHigherDimPadGrowthFactor;
			elemSize = maxLocalLengths[j] * elemSize + pad;
		}

		//Now figure out the offset due to the process loc (we have the local size offset stored in 'pad')
		pad = interGridHigherDimPad;
		elemSize = elemSize + pad;
		for(var j = i; j < loc.length; j += 3){
			sceneLoc[i] += elemSize * lGridProcOwner[j];

			pad *= interGridHigherDimPadGrowthFactor;
			elemSize = lGridShape[j] * elemSize + pad;
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
		sceneLoc[i] = cubeSize/2;

	for(var i = 0; i < 3; i++){
		if( i >= loc.length)
			break;

		//Update sceneLoc[i]
		var pad = interElemHigherDimPad;
		var elemSize = cubeSize + pad;
		for(var j = i; j < loc.length; j += 3){
			sceneLoc[i] += elemSize * loc[j];

			pad *= interElemHigherDimPadGrowthFactor;
			elemSize = gridShape[j] * elemSize + pad;
		}
	}

	return new THREE.Vector3(sceneLoc[sceneDim[0]], sceneLoc[sceneDim[1]], sceneLoc[sceneDim[2]]);
}


function DistributeTensor(dist, lGridShape){
	//Update the global info first
	tensorInfo.dist = dist;

	//Create the tweens
	var tensorTweens = [];
	for(var i = 0; i < tensorCubes.length; i++){
		var tensorCube = tensorCubes[i];

		var finalLoc = MapTensorLoc2SceneLoc(tensorCube.tensorLoc, dist, gridInfo.shape, lGridShape);
		tensorTweens.push(new TWEEN.Tween(tensorCube.position)
					   .to(finalLoc, 2000)
					   .easing(TWEEN.Easing.Exponential.Out)
					   .onComplete(CompleteTensorTween));
	}

	numActiveTensorTweens = tensorTweens.length;
	canRedistTensor = false;

	//Start the tweens
	for(var i = 0; i < tensorTweens.length; i++)
		tensorTweens[i].start();
}

function DistributeObjects(dist){
	if(typeof dist  == 'undefined')
		return;
	var lGridShape = GetLGridShape(gridInfo.shape, dist);

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

//Display a tensor in its initial, undistributed view
function VisualizeTensor(){
	var tensorShape = tensorInfo.shape;
	var tensorLocs = tensorInfo.locs;
	var tensorDist = tensorInfo.dist;
	var gridShape = gridInfo.shape;

	for(var i = 0; i < tensorLocs.length; i++){
		var tensorLoc = tensorLocs[i];

		var sceneLoc = MapTensorLoc2SceneLocLocal(tensorLoc, tensorShape);
		tensorCubes[i].position.set(sceneLoc.x, sceneLoc.y, sceneLoc.z);
		gblTensorScene.add(tensorCubes[i]);
	}
}

//When a tween of Reduce phase of ReduceScatter finished
function CompleteReduceTween(){
	var rMode = this.rMode;
	var thisCube = this.obj;
	var thisLoc = thisCube.tensorLoc;

	//Remove all cubes that were there only for accumulation
	var thisCubeIndex;
	for(var i = 0; i < tensorInfo.locs.length; i++){
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
function CompleteTensorTween(){
	//Enable gui functionality
	numActiveTensorTweens -= 1;
	if(numActiveTensorTweens == 0)
		canRedistTensor = true;
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
		}else if(rMode < 0 || rMode >= tensorInfo.shape.length){
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

function Redistribute(commType, input1, input2){
	var resDist = GetResultingDist(tensorInfo.shape.length, tensorInfo.dist, commType, input1, input2, reduceOrScatter);

	if((typeof resDist == 'undefined'))
		return;

	switch(commType){
		case 'rs': RedistributeRS(input1, resDist); break;
		case 'ag': RedistributeAG(resDist); break;
		case 'p2p': RedistributeP2P(resDist); break;
		case 'a2a': RedistributeA2A(resDist); break;
	}
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
	document.getElementById(tensorCanvasName).addEventListener('mousemove', onTensorSceneMouseMove, false);

	//Initializing GUIs
	var defaultInputs = {'ag': {input1: '0', input2: ''},
			     'rs': {input1: '0', input2: '1'},
			     'a2a': {input1: '', input2: ''},
			     'p2p': {input1: '0', input2: ''}};

	//GUI info
	//During objects moving, the GUIs are effectively disabled.
	var Params = function() {
		this.tensorShape = '4 8 10 6',
		this.gridShape = '2 4 5 3',
		this.tensorDist = '[(0), (1), (2), (3)]',
		this.Distribute = function() {
			if(!haveVisualized){
				alert("You must visualize the grid and tensor first"); 
				return;
			} 
			if(!canRedistTensor)
				return;
			reduceOrScatter = false; 
			DistributeObjects(String2TensorDist(tensorInfo.shape.length, this.tensorDist)); 
			haveDistributed = true;
	    };
		this.VisualizeObjects = function() {
			if(!canRedistTensor)
				return;
			clearScenes(); 
			InitGlobals(this.tensorShape, this.gridShape, this.tensorDist); 
			VisualizeTensor(); 
			haveVisualized = true;
	    };

		//Redist Params
		this.CommunicationType = 'rs',
		this.Input1 = defaultInputs[this.CommunicationType].input1,
		this.Input2 = defaultInputs[this.CommunicationType].input2,
		this.Redistribute = function() { 
			if(!haveVisualized){
				alert("You must visualize the grid and tensor first"); 
				return;
			} 
			if(!haveDistributed){
				alert("You must distribute the tensor first"); 
				return;
			}
			if(!canRedistTensor)
				return;
			Redistribute(this.CommunicationType, this.Input1, this.Input2);
			reduceOrScatter = !reduceOrScatter; 
			redistButton.name(GetRedistButtonName(this.CommunicationType));
        };
	};

	guiParams = new Params();

	//Add the GUIs
	gui = new dat.GUI();
	gui.add(guiParams, 'tensorShape');
	gui.add(guiParams, 'gridShape');
	gui.add(guiParams, 'VisualizeObjects').name('Visualize');
	gui.add(guiParams, 'tensorDist');
	gui.add(guiParams, 'Distribute');
	gui.open();

	redistGui = new dat.GUI();
	var input1 = redistGui.add(guiParams, 'Input1').name(guiInputStrings[guiParams.CommunicationType].input1);
	var input2 = redistGui.add(guiParams, 'Input2').name(guiInputStrings[guiParams.CommunicationType].input2);
	var commType = redistGui.add(guiParams, 'CommunicationType', {Allgather: 'ag', ReduceScatter: 'rs', Permutation: 'p2p', AllToAll: 'a2a'}).name('Comm Type').onChange( function(value) {
		input1.name(guiInputStrings[guiParams.CommunicationType].input1);
		input2.name(guiInputStrings[guiParams.CommunicationType].input2);
		redistButton.name(GetRedistButtonName(guiParams.CommunicationType));
	});
	redistButton = redistGui.add(guiParams, 'Redistribute').name(GetRedistButtonName(guiParams.CommunicationType));

	redistGui.open();
};

runme();
animate();
