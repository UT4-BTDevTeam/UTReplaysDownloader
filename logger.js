exports.useColors = (process.argv.indexOf('-nocolor') == -1 && process.argv.indexOf('-nocolors') == -1);

exports.BLACK   = exports.useColors ? "\033[30m" : ""
exports.RED     = exports.useColors ? "\033[31m" : ""
exports.GREEN   = exports.useColors ? "\033[32m" : ""
exports.YELLOW  = exports.useColors ? "\033[33m" : ""
exports.BLUE    = exports.useColors ? "\033[34m" : ""
exports.MAGENTA = exports.useColors ? "\033[35m" : ""
exports.CYAN    = exports.useColors ? "\033[36m" : ""
exports.WHITE   = exports.useColors ? "\033[37m" : ""
exports.NORMAL  = exports.useColors ? "\033[39m" : ""
exports.GRAY    = exports.useColors ? "\033[90m" : ""

console.ts = function() {
	var d = new Date();
	return exports.GRAY + d.toISOString().substr(5,5).replace('-','/') + " " + d.toISOString().substr(11,8) + " |" + exports.NORMAL;
}

console._log = console.log;

console.log   = function() { process.stdout.write(console.ts() + " " + exports.GRAY    + "log:"   + exports.NORMAL + " "); console._log.apply(null, arguments) }

console.main  = function() { process.stdout.write(console.ts() + " " + exports.MAGENTA + ">>>>"   + exports.NORMAL + " "); console._log.apply(null, arguments) }

console.info  = function() { process.stdout.write(console.ts() + " " + exports.GREEN   + "info:"  + exports.NORMAL + " "); console._log.apply(null, arguments) }

console.warn  = function() { process.stdout.write(console.ts() + " " + exports.YELLOW  + "warn:"  + exports.NORMAL + " "); console._log.apply(null, arguments) }

console.error = function() { process.stdout.write(console.ts() + " " + exports.RED     + "error:" + exports.NORMAL + " "); console._log.apply(null, arguments) }

console.custom = function(k,c) {
	c = c + k + exports.NORMAL;
	k = console.ts();
	console._log.apply(null, arguments);
}

console.debug = function() {}

console.setDebug = function(b) {
	exports.debug = !!b;
	b || console.debug("Debug disabled");
	console.debug = b ? function() { process.stdout.write(console.ts() + " " + exports.GRAY + "debug:" + exports.NORMAL + " "); console._log.apply(null, arguments); } : function(){}
	b && console.debug("Debug enabled");
}

if ( process.argv.indexOf('-d') >= 0 || process.argv.indexOf('--debug') >= 0 )
	console.setDebug(true);
