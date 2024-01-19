import {String2ModeDist, String2TensorDist} from './input.js';

//Must not reuse grid modes and have modes in range
export function CheckTensorDist(gOrder, dist){
	var foundModes = [];

	for(var i = 0; i < dist.length; i++){
		var modeDist = dist[i];
		for(var j = 0; j < modeDist.length; j++){
			if(foundModes.indexOf(modeDist[j]) != -1){
				var msg = 'Malformed Tensor Distribution: Looks like you used mode ' + modeDist[j] + ' previously\n';
				alert(msg);
				return false;
			}else if(modeDist[j] < 0 || modeDist[j] >= gOrder){
				var msg = 'Malformed Tensor Distribution: Looks like mode ' + modeDist[j] + ' is out of range';
				alert(msg);
				return false;
			}else{
				foundModes.push(modeDist[j]);
			}
		}
	}
	return true;
}

export function mult(a,b){
	return a*b;
}

export function Shape2Strides(shape){
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
	var shape3D = [];
	var loc3D = [];
	var stride3D = [];

	//NOTE: Can probably do this with a slice
	shape3D.push(tensorShape[0]);
	loc3D.push(elemLoc[0]);
	stride3D.push(tensorShape[0]);
	if(tensorShape.length > 1){
		shape3D.push(tensorShape[1]);
		loc3D.push(elemLoc[1]);
		stride3D.push(tensorShape[1]);
	}
	if(tensorShape.length > 2){
		shape3D.push(tensorShape[2]);
		loc3D.push(elemLoc[2]);
		stride3D.push(tensorShape[2]);
	}

	for(var i = 3; i < elemLoc.length; i+=3){
		var updateIndex = i % 3;
		shape3D[updateIndex] *= tensorShape[i];
		loc3D[updateIndex] += stride3D[updateIndex]*elemLoc[i];
		stride3D[updateIndex] *= tensorShape[i];

		if(i+1 < elemLoc.length){
			shape3D[updateIndex+1] *= tensorShape[i+1];
			loc3D[updateIndex+1] += stride3D[updateIndex+1]*elemLoc[i+1];
			stride3D[updateIndex+1] *= tensorShape[i+1];
		}
		if(i+2 < elemLoc.length){
			shape3D[updateIndex+2] *= tensorShape[i+2];
			loc3D[updateIndex+2] += stride3D[updateIndex+2]*elemLoc[i+2];
			stride3D[updateIndex+2] *= tensorShape[i+2];
		}
	}

	for(var i = 0; i < 3; i++){
		if(i >= shape3D.length)
			break;
		ret[i] = 1-(1/256*Math.floor(256/shape3D[i]) * loc3D[i]);
	}
	
	return ret;
}

//Given a distribution, commType, and required input params, generates the resulting distribution
export function GetResultingDist(gOrder, tOrder, tensorDist, commType, input1, input2){
	var undef;
	var resDist = tensorDist.slice(0);

	if(commType === 'ag'){
		var agMode = parseInt(input1, 10);

		if(isNaN(agMode)){
			alert("Malformed Allgather Mode: Allgather Mode is NaN");
			return undef;
		}else if(agMode < 0 || agMode >= tOrder){
			alert("Malformed Allgather Mode: Allgather Mode " + agMode + " is out of range");
			return undef;
		}

		resDist[agMode] = [];
	}else if(commType === 'rs'){
		var rMode = parseInt(input1, 10);
		var sMode = parseInt(input2, 10);

		if(isNaN(rMode)){
			alert("Malformed Reduce Mode: Reduce Mode is NaN");
			return undef;
		}else if(rMode < 0 || rMode >= tOrder){
			alert("Malformed Reduce Mode: Reduce Mode " + rMode + " is out of range");
			return undef;
		}
	
		if(isNaN(sMode)){
			alert("Malformed Scatter Mode: Scatter Mode is NaN");
			return undef;
		}else if(sMode < 0 || sMode >= tOrder){
			alert("Malformed Scatter Mode: Scatter Mode " + sMode + " is out of range");
			return undef;
		}
	
		var newModeDist = resDist[sMode].concat(resDist[rMode]);
		resDist[sMode] = newModeDist;
		resDist.splice(rMode, 1);
	}else if(commType === 'p2p'){
		var pMode = parseInt(input1, 10);
		var mDist = String2ModeDist(tOrder, input2);

		if(isNaN(pMode)){
			alert("Malformed Permutation Mode: Permutation Mode is NaN");
			return undef;
		}else if(pMode < 0 || pMode >= tOrder){
			alert("Malformed Permutation Mode: Permutation Mode " + pMode + " is out of range");
			return undef;
		}

		if(typeof mDist == 'undefined'){
			return undef;
		}
		resDist[pMode] = mDist;
	}else if(commType === 'a2a'){
		var tDist = String2TensorDist(gOrder, tOrder, input1);

		if(typeof tDist == 'undefined'){
			return undef;
		}
		resDist = tDist;
	}

	if(!CheckTensorDist(gOrder, resDist)){
		var undef;
		return undef;
	}
	return resDist;
}
