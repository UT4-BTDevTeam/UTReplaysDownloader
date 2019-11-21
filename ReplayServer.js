
const path = require('path');
const fs = require('fs');
const util = require('util');

const logger = require('./logger');
const UTReplays = require('./ut-replays.js');

const SERVER_PORT = 8080;

const express = require('express');
var server = express();

// Startup error
server.on('error', function onError(err) {
	if ( err.syscall !== 'listen' )
		throw err;
	switch ( err.code ) {
		case 'EACCES':
			console.error("[Server] Port " + SERVER_PORT + " requires elevated privileges");
			process.exit(1);
			break;
		case 'EADDRINUSE':
			console.error("[Server] Port " + SERVER_PORT + " is already in use");
			process.exit(1);
			break;
		default:
			throw err;
	}
});

// Listen
const ServerListener = server.listen(SERVER_PORT, function() {
	console.info("[Server] Running on port " + SERVER_PORT);
});

// logger
const onFinished = require('on-finished');
server.use(function(req, res, next) {
	req.headers || (req.headers = []);
	// log error responses
	onFinished(res, function() {
		if ( res.statusCode >= 400 ) {
			console.custom(res.statusCode, (res.statusCode < 500) ? logger.YELLOW : logger.RED,
				req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.ip || req._remoteAddress || (req.connection && req.connection.remoteAddress) || '?',
				req.method || '?',
				req.url
			);
		}
	});
	// log requests
	if ( logger.debug ) {
		console.custom('req', logger.CYAN,
			req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.ip || req._remoteAddress || (req.connection && req.connection.remoteAddress) || '?',
			req.method || '?',
			req.url
		);
	}
	return next();
});

// body parser
server.use(require('body-parser').json({
}));

// Error handling middleware
server.use(function errorMiddleware(err, req, res, next) {
	console.warn("[Server] Error caught in middleware:", err);
	if ( res.headersSent )
		next();
	else
		res.status(500).send("Internal Server Error");
});

//============================================================
// Routes
//============================================================

var LoadedReplays = {};

var EventsMap = {};	// map eventId -> replayId

function reloadLocalReplays() {
	return util.promisify(fs.readdir)(UTReplays.REPLAYS_FOLDER)
	.then(files => {
		var replays = [];
		for ( var file of files ) {
			if ( !file.startsWith('.') )
				replays.push( new UTReplays.LocalReplay(file) );
		}

		return Promise.all(replays.map(replay => replay.Load()))
		.then(_ => {
			LoadedReplays = {};
			EventsMap = {};
			for ( var replay of replays ) {
				LoadedReplays[replay.id] = replay;

				for ( var cp of replay.checkpoints )
					EventsMap[cp.id] = replay.id;
			}

			console.info("Loaded " + replays.length + " local replays");
			return replays;
		});
	});
}
setTimeout(_ => {
	reloadLocalReplays().catch(err => console.error(err));
});

server.get('/replay/replay', function(req, res) {
	return reloadLocalReplays().then(replays => res.json({
		replays: replays.map(replay => replay.listInfo)
	}))
	.catch(err => commonErrorHandler(err, res));
});

server.post('/replay/replay/:replayId/startDownloading', function(req, res) {
	var replay = LoadedReplays[req.params.replayId];
	if ( !replay )
		return res.status(404).send("Replay not found");

	return res.json(replay.startInfo);
});

server.get('/replay/replay/:replayId/event', function(req, res) {
	var replay = LoadedReplays[req.params.replayId];
	if ( !replay )
		return res.status(404).send("Replay not found");

	if ( req.query.group == 'checkpoint' )
		return res.json({ events: replay.checkpoints });
	else
		return res.json({ events: [] });	//ignore: Kills, FlagCaps, FlagReturns, FlagDeny, MultiKills, SpreeKills, Comments
});

server.get('/replay/replay/:replayId/file/:fileName', function(req, res) {
	var replay = LoadedReplays[req.params.replayId];
	if ( !replay )
		return res.status(404).send("Replay not found");

	if ( req.params.fileName == 'replay.header' ) {
		return res.status(200).send(replay.BinaryHeader());
	}
	else if ( req.params.fileName.startsWith('stream.') ) {
		var chunkIndex = parseInt(req.params.fileName.substr(7));
		var headers = replay.chunkHeaders[chunkIndex];
		if ( !headers )
			return res.status(404).send("File not found");

		res.setHeader('Content-Type', 'application/octet-stream');
		for ( var k in headers )
			res.setHeader(k, headers[k]);

		return res.sendFile(path.join(replay.localDirPath, 'stream.' + chunkIndex));
	}
	else {
		console.warn("Request unknown file: '" + req.params.fileName + "'");
		return res.status(404).send("File not found");
	}
});

server.post('/replay/replay/:replayId/viewer/:viewerName', function(req, res) {
	return res.status(204).send();
});

server.get('/replay/event/:eventId', function(req, res) {
	var replayId = EventsMap[req.params.eventId];
	if ( !replayId )
		return res.status(404).send("Replay not found");

	return res.sendFile(path.join(UTReplays.REPLAYS_FOLDER, replayId, 'checkpoint.' + req.params.eventId));
});

server.get('/utreplays', function(req, res) {
	res.sendFile('UTReplays.html');
});
server.get('/utreplays-data', function(req, res) {
	res.setHeader('Access-Control-Allow-Origin', '*');
	require('request')({
		url: UTReplays.EnumerateStreamsURL,
		method: 'GET',
		qs: req.query || {},
		json: true,
	}).pipe(res);
});

function commonErrorHandler(err, res) {
	console.error(err);
	res.status(500).send("Internal Server Error");
}

//============================================================
// Fatal / Exiting
//============================================================

process.on('uncaughtException', function(err) {
	console.error("!! Uncaught exception !");
	console.error(err);
	process.exit(1);
});

process.on('SIGINT', function() {
	console.warn("Received SIGINT !");
	process.exit(2);
});

process.on('exit', function(code) {
	process.emit('cleanup');
	console.info("Exiting with code " + code + "...");
});

process.on('cleanup', function(args) {
	console.info("Cleaning up...");
	// nothing to do
});
