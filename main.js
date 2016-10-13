"use strict";

var appSrc = require('fs').readFileSync('./src/app.js');
var program = require('regenerator').compile(appSrc, {includeRuntime:true});
eval(program.code);