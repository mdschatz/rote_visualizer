import {CheckTensorDist, String2ModeDist, String2TensorDist, validMode} from './input.js';

export function mult(a,b){
	return a*b;
}

export function linear2multi(i, strides) {
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

export function multi2linear(loc, strides) {
	if (typeof loc == "number")
		return loc;
	return [...Array(loc.length).keys()].reduce((a, c) => a + loc[c] * strides[c], 0);
}

export function shape2strides(shape){
	var strides = [];
	strides.length = shape.length;
	strides[0] = 1;

	for(var i = 1; i < strides.length; i++){
		strides[i] = strides[i-1] * shape[i-1];
	}
	return strides;
}

export function GetHexColor(tensorShape, elemLoc) {
	var ret = [0,0,0];
	ret.length = 3;

	//Map the mD Loc and shape to 3D
	var shape3D = Array.from(tensorShape.slice(0, 3));
	var loc3D = Array.from(elemLoc.slice(0, 3));
	var stride3D = Array.from(tensorShape.slice(0, 3));

	for(var i = 3; i < elemLoc.length; i+=3){
		var updateIndex = i % 3;
		shape3D[i % 3] *= tensorShape[i];
		loc3D[i % 3] += stride3D[updateIndex]*elemLoc[i];
		stride3D[i % 3] *= tensorShape[i];
	}
	return Array.from({length: 3}, (x, i) => 1 - (1/256.0*Math.floor(256/shape3D[i]) * loc3D[i]));
}

//Given a distribution, commType, and required input params, generates the resulting distribution
export function GetResultingDist(gOrder, tOrder, tensorDist, commType, input1, input2){
	var undef;
	var resDist = tensorDist.slice(0);

	if(commType === 'ag') {
		var agMode = parseInt(input1);

		if(!validMode(agMode, tOrder)){
			alert("Malformed Allgather Mode: Allgather Mode " + agMode + " is out of range");
			return undef;
		}

		resDist[agMode] = [];
		return resDist;
	}
	if(commType === 'rs') {
		var rMode = parseInt(input1);
		var sMode = parseInt(input2);

		if(!validMode(rMode)) {
			alert("Malformed Reduce Mode: Reduce Mode " + rMode + " is out of range");
			return undef;
		}
	
		if(!validMode(sMode)) {
			alert("Malformed Scatter Mode: Scatter Mode " + sMode + " is out of range");
			return undef;
		}
	
		resDist[sMode] = resDist[sMode].concat(resDist[rMode]);
		resDist.splice(rMode, 1);
		return resDist;
	}
	if(commType === 'p2p') {
		var pMode = parseInt(input1);
		var mDist = String2ModeDist(tOrder, input2);

		if(!validMode(pMode)) {
			alert("Malformed Permutation Mode: Permutation Mode " + pMode + " is out of range");
			return undef;
		}

		if(typeof mDist == 'undefined') {
			return undef;
		}
		resDist[pMode] = mDist;
		return resDist;
	}
	if(commType === 'a2a') {
		return String2TensorDist(gOrder, tOrder, input1);
	}
}
