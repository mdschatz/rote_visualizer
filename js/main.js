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
	pad_elem,
	pad_grid,
	growth_elem,
	growth_grid,
} from './globals.js';
import * as THREE from 'three';
import * as dat from 'dat.gui';
import {
	mult,
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

var numActiveTweens;
var canRedistTensor = true;

var tensor;
var itensor = null;

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

function multilinear2linear(loc, strides) {
	if (typeof loc == "number")
		return loc;

	var linLoc = 0;
	for (var i = 0; i < loc.length; i++) {
		linLoc += loc[i] * strides[i];
	}
	return linLoc;
}

class Proc {
	contructor() {
		this.shape = null;
		this.strides = null;
		this.order = null;
		this.nelem = null;
		this.data = null;
		this.dataKeys = null;
	}

	initData(shape) {
		this.shape = Array.from(shape);
		this.strides = Shape2Strides(this.shape);
		this.order = this.shape.length;
		this.nelem = shape.reduce(mult, 1);
		this.data = new Map();

		// Initialize data locs
		var strides = Shape2Strides(this.shape);
		for (var i = 0; i < this.nelem; i++) {
			var loc = linear2Multilinear(i, strides);
			this.setData(loc, null);
		}
	}

	attachCube(loc, cube) {
		this.setData(loc, cube);
	}

	setData(loc, data) {
		var linLoc = multilinear2linear(loc, this.strides);
		return this.data.set(linLoc, data);
	}

	getData(loc) {
		return this.data.get(multilinear2linear(loc, this.strides));
	}
}

class Grid {
	constructor(shape = []) {
		this.type = 'Grid';
		this.shape = Array.from(shape);
		this.strides = Shape2Strides(this.shape);
		this.order = this.shape.length;
		this.nprocs = shape.reduce(mult, 1);
		this.procCubes = new Map();
		this.procs = new Map();

		var gStrides = Shape2Strides(this.shape);
		for (var p = 0; p < this.nprocs; p++) {
			var pLoc = linear2Multilinear(p, gStrides);
			this.setProc(pLoc, new Proc());
		}
	}

	setProc(loc, proc) {
		var linLoc = multilinear2linear(loc, this.strides);
		return this.procs.set(linLoc, proc);
	}

	getProc(loc) {
		return this.procs.get(multilinear2linear(loc, this.strides));
	}
}

class DistTensor {
	constructor(gShape = [], shape = [], dist = []) {
		this.type = 'Tensor';
		this.shape = Array.from(shape);
		this.strides = Shape2Strides(shape);
		this.dist = Array.from(dist);
		this.order = shape.length;
		this.nelem = shape.reduce(mult, 1);
		this.haveVisualized = false;
		this.haveDsitributed = false;
		this.canRedist = true;
		this.grid = new Grid(gShape);

		// Initialize procs
		var gStrides = Shape2Strides(gShape);
		for (var p = 0; p < this.grid.nprocs; p++) {
			var pLoc = linear2Multilinear(p, gStrides);
			this.grid.getProc(pLoc).initData(this.localShape(pLoc));
		}
	}

	createCubes() {
		var strides = Shape2Strides(this.shape);
		for (var i = 0; i < this.nelem; i++) {
			var gLoc = linear2Multilinear(i, strides);
			var localLocs = this.localLocs(gLoc);
			for (const [owner, loc] of localLocs.entries()) {
				var color = GetHexColor(this.shape, gLoc);
				var cubeColor = new THREE.Color(color[0], color[1], color[2]);
				var cube = new THREE.Mesh(
					new THREE.BoxGeometry(cube_sz, cube_sz, cube_sz),
					new THREE.MeshPhongMaterial({
						color: new THREE.Color(color[0], color[1], color[2]),
						specular: cubeColor,
						shininess: 2
					}),
				);
				cube.name = gLoc.toString();

				var sceneLoc = MapTensorLoc2SceneLoc(this, loc, owner);
				cube.position.set(sceneLoc.x, sceneLoc.y, sceneLoc.z);
				this.grid.getProc(owner).setData(loc, cube);
			}
		}

		// Init proc cubes
		var scenePerm = [1, 0, 2];
		var maxLens = this.maxLengths();
		for(var p = 0; p < this.grid.nprocs; p++) {
			var pLoc = linear2Multilinear(p, this.grid.strides);
			var pos = Array.from({length: 3}, (x, i) => 0);
			var sz = Array.from({length: 3}, (x, i) => 0);
			for (var j = 0; j < pLoc.length; j++) {
				var maxLen = j < maxLens.length ? maxLens[j] : 1;
				var gridLen = pad_elem + maxLen * (cube_sz + pad_elem);
				pos[j%3] += pLoc[j] > 0 ? pLoc[j] * (gridLen + pad_grid) : 0;
				sz[j%3] += gridLen;
			}
			for (var j = pLoc.length; j < 3; j++) {
				sz[j] += 2 * pad_elem + cube_sz;
			}
			var c_sz = Array.from(scenePerm, (x, i) => sz[x]);
			var cubeColor = new THREE.Color(64, 64, 64);
			var cube = new THREE.Mesh(
				new THREE.BoxGeometry(c_sz[0], c_sz[1], c_sz[2]),
				new THREE.MeshPhongMaterial({
					color: cubeColor,
					specular: cubeColor,
					transparent: true,
					opacity: 0.5,
					shininess: 2
				}),
			);
			cube.name = pLoc.toString();
			cube.material.visible = false;

			var loc = Array.from({length: maxLens.length}, (x, i) => 0);
			var sceneLoc = MapTensorLoc2SceneLoc(this, loc, pLoc);
			sceneLoc.x += c_sz[0] / 2.0 - cube_sz;
			sceneLoc.y += c_sz[1] / 2.0 - cube_sz;
			sceneLoc.z += c_sz[2] / 2.0 - cube_sz;
			console.log("ploc: " + pLoc.toString() + " sceneLoc: " + sceneLoc.x + " " + sceneLoc.y + " " + sceneLoc.z);
			console.log("ploc: " + pLoc.toString() + " sz: " + sz.toString());
			console.log("ploc: " + pLoc.toString() + " maxLens: " + maxLens.toString());
			cube.position.set(sceneLoc.x, sceneLoc.y, sceneLoc.z);
			this.grid.procCubes.set(p, cube);
		}
	}

	clearCubes() {
		for (const [pLoc, p] of this.grid.procs.entries()) {
			for (const [cLoc, cube] of p.data.entries()) {
				gblTensorScene.remove(cube);
			}
		}
		for (const [pLoc, c] of this.grid.procCubes.entries()) {
			gblTensorScene.remove(c);
		}
	}

	visualize() {
		for (const [pLoc, p] of this.grid.procs.entries()) {
			for (const [cLoc, cube] of p.data.entries()) {
				gblTensorScene.add(cube);
			}
		}
		for (const [pLoc, c] of this.grid.procCubes.entries()) {
			gblTensorScene.add(c);
		}
		this.haveVisualized = true;
	}

	// Core methods
	owningProcs(loc) {
		var pLoc = new Map(Array.from({length: this.grid.shape.length}, (x, i) => [i, -1]));

		for (var d = 0; d < loc.length; d++) {
			var i = loc[d];
			var mDist = this.dist[d];
			if (mDist.length == 0)
				continue;

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
					owners.push(Array.from(owner));
				} else {
					for (var k = 0; k < this.grid.shape[d]; k++) {
						owner[d] = k;
						owners.push(Array.from(owner));
					}
				}
			}
		}
		return owners;
	}

	localLocs(globalLoc) {
		var owners = this.owningProcs(globalLoc);
		var localLocs = new Map();
		for (var owner of owners) {
			var localLoc = [];
			localLoc.length = this.order;

			for (var i = 0; i < localLoc.length; i++) {
				var lgShape = this.dist[i].map((x) => this.grid.shape[x]);
				var lgLoc = this.dist[i].map((x) => owner[x]);
				var lgOwnerLoc = multilinear2linear(lgLoc, Shape2Strides(lgShape));

				localLoc[i] = Math.floor((globalLoc[i] - lgOwnerLoc) / lgShape.reduce(mult, 1));
			}
			localLocs.set(owner, localLoc);
		}
		return localLocs;
	}

	localLength(d, gLoc) {
		var lgShape = this.dist[d].map((x) => this.grid.shape[x]);
		var lgDim = lgShape.reduce(mult, 1);
		var lgLoc = this.dist[d].map((x) => gLoc[x]);
		var lgOwnerLoc = multilinear2linear(lgLoc, Shape2Strides(lgShape));

		var maxLen = this.maxLength(d);
		if (this.shape[d] % lgDim == 0)
			return maxLen;
		else
			return lgOwnerLoc < (this.shape[d] % lgDim) ? maxLen : maxLen - 1;
	}

	localShape(gLoc) {
		return Array.from({length: this.order}, (x, i) => this.localLength(i, gLoc));
	}

	maxLength(d) {
		var lgDim = this.dist[d].map((x) => this.grid.shape[x]).reduce(mult, 1);
		return (this.shape[d] > 0 ? Math.floor((this.shape[d] - 1)/lgDim) + 1: 0);
	}

	maxLengths() {
		var lens = [];
		lens.length = this.order;

		for (var d = 0; d < this.order; d++) {
			lens[d] = this.maxLength(d);
		}
		return lens;
	}
}

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
		if(!tensor.haveVisualized){
			alert("You must visualize the grid and tensor first"); 
			return;
		} 
		if(!tensor.canRedist)
			return;
		var tShape = parseIntArray(this.tShape);
		var gShape = parseIntArray(this.gShape);
		RedistributeAG(gShape, String2TensorDist(gShape.length, tShape.length, this.tDist));
		tensor.haveDistributed = true;
	}

	clearScene(){
		//Clear tensor info
		var objsToRemove = _.rest(gblTensorScene.children, 1);
		_.each(objsToRemove, function (object){ gblTensorScene.remove(object);});
		render();

		redistButton.name(GetRedistButtonName(guiParams.commType));
	}

	visualize() {
		this.clearScene();
		var gShape = parseIntArray(this.gShape);
		gShape = Array.from({length: gShape.length}, (x, i) => 1);
		var tShape = parseIntArray(this.tShape);
		tensor = new DistTensor(gShape, tShape, String2TensorDist(gShape.length, tShape.length, this.tDist));
		tensor.haveVisualized = false;
		tensor.haveDistributed = false;
		tensor.canRedist = true;

		if(!tensor.canRedist)
			return;
		tensor.createCubes();
		gblTensorScene.add(new THREE.AxesHelper(5));

		tensor.visualize(); 
	}

	redistribute() {
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

//Tell which cube is hovered over
function onSceneMouseMove(event){
	event.preventDefault();
	if (typeof tensor == 'undefined')
		return;

	var vector = new THREE.Vector3( (( event.clientX -this.offsetLeft) / tensorCanvasWidth ) * 2 - 1, - ( (event.clientY - this.offsetTop)/ tensorCanvasHeight ) * 2 + 1, 0.5 );
	vector.unproject(gblTensorCamera);

	var msg = 'Global Loc: ';
	if(tensor.nelem > 0){
		var raycaster = new THREE.Raycaster( gblTensorCamera.position, vector.sub( gblTensorCamera.position ).normalize() );
		var cubes = [];
		for (const [pLoc, p] of tensor.grid.procs.entries()) {
			for (const [cLoc, c] of p.data.entries()) {
				cubes.push(c);
			}
		}
		var intersects = raycaster.intersectObjects( cubes );

		if(intersects.length > 0){
			msg += '(' + intersects[0].object.name + ')';
		}

	}

	vector = new THREE.Vector3( (( event.clientX -this.offsetLeft) / tensorCanvasWidth ) * 2 - 1, - ( (event.clientY - this.offsetTop)/ tensorCanvasHeight ) * 2 + 1, 0.5 );
	vector.unproject(gblTensorCamera);


	msg += ' Grid Loc: ';
	if (tensor.grid.nprocs > 0) {
		var raycaster = new THREE.Raycaster( gblTensorCamera.position, vector.sub( gblTensorCamera.position ).normalize() );
		var cubes = [];
		for (const [p, c] of tensor.grid.procCubes.entries()) {
			cubes.push(c);
		}
		var intersects = raycaster.intersectObjects( cubes );

		for(var cube of cubes) {
			cube.material.visible = false;
		}
		if(intersects.length > 0){
			msg += '(' + intersects[0].object.name + ')';
			intersects[0].object.material.visible = true;
		}
	}
	selectedTensorElem.textContent = msg;

	//Update which tensor dist we are viewing
	tensorDistInfo.textContent = 'Tensor Distribution: ' + TensorDist2String(tensor.dist);
}

//NOTE: For purposes of scene rendering, X axis in object is Y axis in scene
//Maps a global location of the tensor to a location in the scene.
function MapTensorLoc2SceneLoc(mapTen, localLoc, owner) {
	if (localLoc.length > 3)
		alert("Can only support <=3-D tensors");

	var maxLens = mapTen.maxLengths();

	var sceneLoc = Array.from({length: 3}, (x, i) => cube_sz / 2.0);

	// Offset into proc
	for (var j = 0; j < owner.length; j++) {
		// Note: clean up
		var maxLen = j < maxLens.length ? maxLens[j] : 1;
		var gridLen = pad_elem + maxLen * (cube_sz + pad_elem);
		sceneLoc[j%3] += owner[j] > 0 ? owner[j] * (gridLen + pad_grid) : 0;
	}
	// Offset into elem
	for (var j = 0; j < localLoc.length; j++) {
		sceneLoc[j%3] += localLoc[j] > 0 ? localLoc[j] * (cube_sz + pad_elem) : 0;
	}

	// Permute for visual matching
	return new THREE.Vector3(sceneLoc[1], sceneLoc[0], sceneLoc[2]);
}

function DistributeObjects(gShape, dist){
	if(typeof dist  == 'undefined')
		return;

	var mapTen = new DistTensor(gShape, tensor.shape, dist);
	mapTen.createCubes();

	var tweens = [];
	for (var i = 0; i < tensor.nelem; i++) {
		var dtLoc = linear2Multilinear(i, tensor.strides);

		var tlLocs = tensor.localLocs(dtLoc);
		var mtlLocs = mapTen.localLocs(dtLoc);
//		if (tlLocs.size != 1 || mtlLocs.size != 1) {
//			alert("Got to have fully distributed objects");
//		}

		var tEntry = tlLocs.entries().next();
		var mtEntry = mtlLocs.entries().next();
		var tCube = tensor.grid.getProc(tEntry.value[0]).getData(tEntry.value[1]);
		var mtCube = mapTen.grid.getProc(mtEntry.value[0]).getData(mtEntry.value[1]);
		var fLoc = new THREE.Vector3(mtCube.position.x, mtCube.position.y, mtCube.position.z);

		mtCube.position.set(tCube.position.x, tCube.position.y, tCube.position.z);
		mtCube.material.copy(tCube.material);

		tweens.push(new TWEEN.Tween(mtCube.position)
			.to(fLoc, 2000)
			.easing(TWEEN.Easing.Exponential.Out)
			.onComplete(CompleteTween));
	}
	numActiveTweens = tweens.length;
	tensor.canRedist = false;

	mapTen.visualize();
	tensor.clearCubes();
	tensor = mapTen;

	// Start the tweens
	for (var tween of tweens)
		tween.start();
}

//When a tween on the tensor side finishes
function CompleteTween(){
	//Enable gui functionality
	numActiveTweens -= 1;
	if(numActiveTweens == 0) {
		tensor.canRedist = true;
		if (itensor != null) {
			itensor.clearCubes();
			itensor = null;
		}
	}
}

function RedistributeRS(rMode, gShape, resDist) {
	// Pre-Reduce
	var mapTen = new DistTensor(gShape, tensor.shape, tensor.dist);
	mapTen.createCubes();

	// Post-Reduce
	var ftShape = Array.from(tensor.shape);
	ftShape.splice(rMode, 1);
	var ftDist = Array.from(tensor.dist);
	ftDist.splice(rMode, 1);
	var fTen = new DistTensor(gShape, ftShape, resDist);
	fTen.createCubes();

	var tweens = [];
	for (var i = 0; i < tensor.nelem; i++) {
		var dtLoc = linear2Multilinear(i, tensor.strides);
		var ftLoc = Array.from(dtLoc);
		ftLoc.splice(rMode, 1);

		var mtlLocs = mapTen.localLocs(dtLoc);
		var flLocs = fTen.localLocs(ftLoc);
		//if (flLocs.size != 1) {
		//	alert("Got to have fully distributed objects");
		//}

		var ftEntry = flLocs.entries().next();
		var ftCube = fTen.grid.getProc(ftEntry.value[0]).getData(ftEntry.value[1]);

		for (const [oLoc, lLoc] of mtlLocs.entries()) {
			var mtCube = mapTen.grid.getProc(oLoc).getData(lLoc);
			var fLoc = new THREE.Vector3(ftCube.position.x, ftCube.position.y, ftCube.position.z);

			tweens.push(new TWEEN.Tween(mtCube.position)
				.to(fLoc, 2000)
				.easing(TWEEN.Easing.Exponential.Out)
				.onComplete(CompleteTween));
		}
	}
	numActiveTweens = tweens.length;
	tensor.canRedist = false;

	mapTen.visualize();
	tensor.clearCubes();
	itensor = mapTen;
	tensor = fTen;
	fTen.visualize();

	// Start the tweens
	for (var tween of tweens)
		tween.start();
}

function RedistributeAG(gShape, dist){
	var mapTen = new DistTensor(gShape, tensor.shape, dist);
	mapTen.createCubes();

	var tweens = [];
	for (var i = 0; i < tensor.nelem; i++) {
		var dtLoc = linear2Multilinear(i, tensor.strides);

		var tlLocs = tensor.localLocs(dtLoc);
		var mtlLocs = mapTen.localLocs(dtLoc);
		//if (tlLocs.size != 1) {
		//	alert("Got to have fully distributed objects");
		//}

		var tEntry = tlLocs.entries().next();
		var tCube = tensor.grid.getProc(tEntry.value[0]).getData(tEntry.value[1]);

		for (const [oLoc, lLoc] of mtlLocs.entries()) {
			var mtCube = mapTen.grid.getProc(oLoc).getData(lLoc);
			var fLoc = new THREE.Vector3(mtCube.position.x, mtCube.position.y, mtCube.position.z);
			mtCube.position.set(tCube.position.x, tCube.position.y, tCube.position.z);
			mtCube.material.copy(tCube.material);

			tweens.push(new TWEEN.Tween(mtCube.position)
				.to(fLoc, 2000)
				.easing(TWEEN.Easing.Exponential.Out)
				.onComplete(CompleteTween));
		}
	}
	numActiveTweens = tweens.length;
	tensor.canRedist = false;

	mapTen.visualize();
	tensor.clearCubes();
	tensor = mapTen;

	// Start the tweens
	for (var tween of tweens)
		tween.start();
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

//Main code to run
function runme(){
	document.getElementById(tensorCanvasName).addEventListener('mousemove', onSceneMouseMove, false);

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
