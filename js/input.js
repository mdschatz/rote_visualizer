/////////////////////////
/// Input
/////////////////////////

import {CheckTensorDist} from './util.js';

//Regex for Mode Dist
var modeDistRegex = "\\((\\s*\\d*\\s*)(\\s*,\\s*\\d*\\s*)*\\)";

export function TensorDist2String(tenDist){
	var msg = '';
	if(tenDist.length > 0){
		msg += '[';
		msg += ModeDist2String(tenDist[0]);

		for(var i = 1; i < tenDist.length; i++)
			msg += ', ' + ModeDist2String(tenDist[i]);
		msg += ']';
	}
	return msg;
}

export function String2TensorDist(gOrder, order, distString){
	var dist;
	var startPos = 0;
	var endPos = 0;

	var regexString = "\\[\\s*" + modeDistRegex + "(\\s*,\\s*" + modeDistRegex + "\\s*){" + (order - 1) + "}" + "\\]";
	var regex = new RegExp(regexString);

	if(!regex.test(distString)){
		var msg = 'Malformed Tensor Distribution string: Must match pattern: ' + regexString + '\n';
		msg += 'For example: [(0)';

		for(var i = 1; i < order; i++)
			msg += ', (' + i + ')';
		msg += ']\n';

		msg += 'or: [()';

		for(var i = 1; i < order; i++)
			msg += ', ()';
		msg += ']';
		alert(msg);
	}else{
		dist = [];
		//Create regex to match against:
		startPos = distString.indexOf("(", endPos);
		endPos = distString.indexOf(")", startPos);
		while(startPos != -1){
			var slice = distString.slice(startPos, endPos+1);
			var thisModeDist = String2ModeDist(order, slice);
			if(typeof thisModeDist == 'undefined')
				return thisModeDist;
			else{
				dist.push(String2ModeDist(order, slice));
				startPos = distString.indexOf("(", endPos);
				endPos = distString.indexOf(")", startPos);
			}
		}
	}

	if(!CheckTensorDist(gOrder, dist)){
		var undef;
		return undef;
	}

	return dist;
}

function ModeDist2String(modeDist){
	return '(' + modeDist + ')';
}

export function String2ModeDist(order, distString){
	var dist;
	var regex = new RegExp(modeDistRegex);

	if(!regex.test(distString)){
		var msg = 'Malformed Mode Distribution string: Must match pattern: ' + modeDistRegex + '\n';
		msg += 'For example: (0)\n';

		msg += 'or: (0';

		for(var i = 1; i < order; i++)
			msg += ', ' + i;
		msg += ')';

		return dist;
	}

	var data = distString.slice(1,-1).split(/\s*,\s*/);
	if(data[0] == "")
		return [];
	else
		return data.map(function(x){return parseInt(x, 10);});
}

export function parseIntArray(str) {
	return str.split(",").map(function (x){return parseInt(x);});
}

export function ParseInput(tensorShapeString, gridShapeString, tensorDistString){
	var gridShape = parseIntArray(gridShapeString);
	var tensorShape = parseIntArray(tensorShapeString);

	var params = {	"gridShape": gridShape,
		      	"tensorShape": tensorShape,
		     };
	return params;
}
