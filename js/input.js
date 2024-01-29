/////////////////////////
/// Input
/////////////////////////

//Regex for Mode Dist
var modeDistRegex = "\\((\\s*\\d*\\s*)(\\s*,\\s*\\d*\\s*)*\\)";

export function validMode(m, order) {
	return !(isNaN(m) || m < 0 || m >= order);
}

//Must not reuse grid modes and have modes in range
export function CheckTensorDist(gOrder, tDist) {
	var seenModes = new Set();

	for(const mDist of tDist) {
		for(const gMode of mDist) {
			if(seenModes.has(gMode)) {
				alert(
					'Malformed Tensor Distribution: Looks like you used mode ' + gMode + ' previously\n'
				);
				return false;
			}
			if(!validMode(gMode, gOrder)) {
				alert(
					'Malformed Tensor Distribution: Looks like mode ' + gMode + ' is out of range'
				);
				return false;
			}
			seenModes.add(gMode);
		}
	}
	return true;
}

export function TensorDist2String(tDist) {
	return '[' + tDist.map(ModeDist2String).join(', ') + ']';
}

export function String2TensorDist(gOrder, order, distString){
	var dist;
	var startPos = 0;
	var endPos = 0;

	var regexString = "\\[\\s*" + modeDistRegex + "(\\s*,\\s*" + modeDistRegex + "\\s*){" + (order - 1) + "}" + "\\]";
	var regex = new RegExp(regexString);

	if(!regex.test(distString)) {
		var msg = 'Malformed Tensor Distribution string: Must match pattern: ' + regexString + '\n';
		msg += 'For example: [' + Array.from({length: order}, (x, i) => '(' + i + ')').join(', ') + ']\n';

		msg += 'or: [' + Array.from({length: order}, (x, i) => '()').join(', ') + ']';
		alert(msg);
	} else {
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
		msg += 'or: (' + [...Array(order).keys()].join(', ') + ')';
		alert(msg);

		return dist;
	}

	var data = distString.slice(1,-1).split(/\s*,\s*/);
	if(data[0] == "")
		return [];
	else
		return data.map(x => parseInt(x));
}

export function parseIntArray(str) {
	return str.split(",").map(x => parseInt(x));
}
