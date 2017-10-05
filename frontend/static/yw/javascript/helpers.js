var DEBUG=false;function assert(exp,optMsg){if(!exp){throw new Error(optMsg||"Assertion failed");}}
function log(){var args=[];for(var _i=0;_i<arguments.length;_i++){args[_i- 0]=arguments[_i];}
if(DEBUG&&console&&console.log){console.log.apply(console,args);}}
var Helpers={_getNodeIndex:function(node){return $(node).parent().children().index(node);},addCss:function(cssCode){var styleElement=document.createElement("style");styleElement.type="text/css";if(styleElement.styleSheet){styleElement.styleSheet.cssText=cssCode;}
else{styleElement.appendChild(document.createTextNode(cssCode));}
document.getElementsByTagName("head")[0].appendChild(styleElement);return styleElement;},charAt:function(s,i){var c=s.charAt(i);var n=s.charAt(i+ 1);if(Helpers.isSurrogate(c,n)){return c+ n;}
return c;},escapeChar:function(s){if(s==="<"){return"&lt;";}
if(s===">"){return"&gt;";}
if(s==="&"){return"&amp;";}
if(s===" "){return"&nbsp;";}
return s;},getCellCoords:function(td){var $td=$(td);var charX=Helpers._getNodeIndex($td);var charY=Helpers._getNodeIndex($td.parents("tr"));var $tile=$td.parents(".tilecont");var tileYX=$tile.attr(TILE_YX_ATTR);var tileCoords=stringToCoords(tileYX);return{tileY:tileCoords.tileY,tileX:tileCoords.tileX,charY:charY,charX:charX};},getChars:function(s){var r=[];var i=-1;while(++i<s.length){var c=s.charAt(i);var n=s.charAt(i+ 1);if(Helpers.isSurrogate(c,n)){r.push(c+ n);i++;}
else{r.push(c);}}
return r;},isSurrogate:function(){var s=[];for(var _i=0;_i<arguments.length;_i++){s[_i- 0]=arguments[_i];}
for(var _a=0,s_1=s;_a<s_1.length;_a++){var c=s_1[_a];var d=c.charCodeAt(0);if(d<0xD800||d>0xDFFF){return false;}}
return true;},length:function(s){return Helpers.getChars(s).length;},vectorLen:function(){var args=[];for(var _i=0;_i<arguments.length;_i++){args[_i- 0]=arguments[_i];}
var sum=0;for(var _a=0,args_1=args;_a<args_1.length;_a++){var x=args_1[_a];sum+=x*x;}
return Math.sqrt(sum);}};