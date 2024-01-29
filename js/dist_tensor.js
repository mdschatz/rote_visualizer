import { 
	gblScene,
	gblCamera,
} from './globals.js';
import * as THREE from 'three';
import {
	mult,
	linear2multi,
	multi2linear,
	shape2strides,
	GetHexColor,
} from './util.js';
import * as TWEEN from '@tweenjs/tween.js'

//Rendering constants
//Space between higher dimensions and their growth factors (when mapping multiple modes to 1)
var pad_elem = 0.5;
var pad_grid = 6;
var growth_elem = 2;
var growth_grid = 1.2;
//Size of the cube representing an element
var cube_sz = 1;


var numActiveTweens;
var tensor;
var itensor = null;

export function get_tensor() {
	return tensor;
}

export function set_tensor(new_tensor) {
	tensor = new_tensor;
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
		this.strides = shape2strides(this.shape);
		this.order = this.shape.length;
		this.nelem = shape.reduce(mult, 1);
		this.data = new Map();

		// Initialize data locs
		var strides = shape2strides(this.shape);
		for (var i = 0; i < this.nelem; i++) {
			var loc = linear2multi(i, strides);
			this.setData(loc, null);
		}
	}

	attachCube(loc, cube) {
		this.setData(loc, cube);
	}

	setData(loc, data) {
		var linLoc = multi2linear(loc, this.strides);
		return this.data.set(linLoc, data);
	}

	getData(loc) {
		return this.data.get(multi2linear(loc, this.strides));
	}
}

class Grid {
	constructor(shape = []) {
		this.type = 'Grid';
		this.shape = Array.from(shape);
		this.strides = shape2strides(this.shape);
		this.order = this.shape.length;
		this.nprocs = shape.reduce(mult, 1);
		this.procCubes = new Map();
		this.procs = new Map();

		var gStrides = shape2strides(this.shape);
		for (var p = 0; p < this.nprocs; p++) {
			var pLoc = linear2multi(p, gStrides);
			this.setProc(pLoc, new Proc());
		}
	}

	setProc(loc, proc) {
		var linLoc = multi2linear(loc, this.strides);
		return this.procs.set(linLoc, proc);
	}

	getProc(loc) {
		return this.procs.get(multi2linear(loc, this.strides));
	}
}

export class DistTensor {
	constructor(gShape = [], shape = [], dist = []) {
		this.type = 'Tensor';
		this.shape = Array.from(shape);
		this.strides = shape2strides(shape);
		this.dist = Array.from(dist);
		this.order = shape.length;
		this.nelem = shape.reduce(mult, 1);
		this.haveVisualized = false;
		this.canRedist = true;
		this.grid = new Grid(gShape);

		// Initialize procs
		var gStrides = shape2strides(gShape);
		for (var p = 0; p < this.grid.nprocs; p++) {
			var pLoc = linear2multi(p, gStrides);
			this.grid.getProc(pLoc).initData(this.localShape(pLoc));
		}
	}

	createCubes() {
		var strides = shape2strides(this.shape);
		for (var i = 0; i < this.nelem; i++) {
			var gLoc = linear2multi(i, strides);
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

				var sceneLoc = this.local2scene(loc, owner);
				cube.position.set(sceneLoc.x, sceneLoc.y, sceneLoc.z);
				this.grid.getProc(owner).setData(loc, cube);
			}
		}

		// Init proc cubes
		var scenePerm = [1, 0, 2];
		var maxLens = this.maxLengths();
		for(var p = 0; p < this.grid.nprocs; p++) {
			var pLoc = linear2multi(p, this.grid.strides);
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
			var sceneLoc = this.local2scene(loc, pLoc);
			sceneLoc.x += c_sz[0] / 2.0 - cube_sz;
			sceneLoc.y += c_sz[1] / 2.0 - cube_sz;
			sceneLoc.z += c_sz[2] / 2.0 - cube_sz;
			cube.position.set(sceneLoc.x, sceneLoc.y, sceneLoc.z);
			this.grid.procCubes.set(p, cube);
		}
	}

	clearCubes() {
		for (const [pLoc, p] of this.grid.procs.entries()) {
			for (const [cLoc, cube] of p.data.entries()) {
				gblScene.remove(cube);
			}
		}
		for (const [pLoc, c] of this.grid.procCubes.entries()) {
			gblScene.remove(c);
		}
	}

	visualize() {
		for (const [pLoc, p] of this.grid.procs.entries()) {
			for (const [cLoc, cube] of p.data.entries()) {
				gblScene.add(cube);
			}
		}
		for (const [pLoc, c] of this.grid.procCubes.entries()) {
			gblScene.add(c);
		}
		this.haveVisualized = true;
	}

	//NOTE: For purposes of scene rendering, X axis in object is Y axis in scene
	//Maps a local location of a process to a location in the scene.
	local2scene(localLoc, owner) {
		if (localLoc.length > 3)
			alert("Can only support <=3-D tensors");

		var maxLens = this.maxLengths();

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

			var gLoc = linear2multi(lp, shape2strides(lgShape));
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
				var lgOwnerLoc = multi2linear(lgLoc, shape2strides(lgShape));

				localLoc[i] = Math.floor((globalLoc[i] - lgOwnerLoc) / lgShape.reduce(mult, 1));
			}
			localLocs.set(owner, localLoc);
		}
		return localLocs;
	}

	localLength(d, gLoc) {
		var lgShape = this.dist[d].map((x) => this.grid.shape[x]);
		var lgLoc = this.dist[d].map((x) => gLoc[x]);
		var lgOwnerLoc = multi2linear(lgLoc, shape2strides(lgShape));

		var lgDim = lgShape.reduce(mult, 1);
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
		return Array.from({length: this.order}, (x, i) => this.maxLength(i));
	}
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

export function RedistributeRS(rMode, gShape, resDist) {
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
		var dtLoc = linear2multi(i, tensor.strides);
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

export function RedistributeAG(gShape, dist){
	var mapTen = new DistTensor(gShape, tensor.shape, dist);
	mapTen.createCubes();

	var tweens = [];
	for (var i = 0; i < tensor.nelem; i++) {
		var dtLoc = linear2multi(i, tensor.strides);

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

