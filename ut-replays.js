
const path = require('path');
const fs = require('fs');
const util = require('util');

const request = require('request');
const promiseRequest = util.promisify(request);

const UEUtils = require('./ue-utils.js');

//============================================================
// Constants
//============================================================

const REPLAYS_FOLDER = path.resolve('Replays');

const ProdURL = "https://utreplay-public-service-prod10.ol.epicgames.com/replay/v2/";

const EnumerateStreamsURL = ProdURL + "replay";

const MyUserName = "UTReplaysDownloader";

//============================================================
// Statics
//============================================================

function EnumerateStreams() {
	return promiseRequest({
		url: EnumerateStreamsURL,
		method: 'GET',
		json: true,
	}).then(res => res.body.replays);
}

function DownloadCheckpoint(eventId) {
	return promiseRequest({
		url: ProdURL + "event/" + eventId,
		method: 'GET',
		encoding: null,
	}).then(res => res.body);
}

function mkdir2(dirPath) {
	return util.promisify(fs.mkdir)(dirPath).catch(err => {
		if ( err.code !== 'EEXIST' )
			throw err;
	});
}

//============================================================
// RemoteReplay
//============================================================

class RemoteReplay {
	constructor(replayId) {
		this.id = replayId;
		this.localDirPath = path.join(REPLAYS_FOLDER, replayId);

		this.header = null;
		this.startInfo = null;
		this.checkpoints = null;
		this.chunkHeaders = [];

		this.headerBuffer = null;
	}

	DownloadHeaderURL() {
		return ProdURL + "replay/" + this.id + "/file/replay.header";
	}
	StartStreamingURL() {
		return ProdURL + "replay/" + this.id + "/startDownloading?user=" + MyUserName;
	}
	EnumerateEventsURL(group) {
		return ProdURL + "replay/" + this.id + "/event?group=" + group;
	}
	EnumerateCheckpointsURL() {
		return this.EnumerateEventsURL('checkpoint');
	}
	DownloadChunkURL(chunkIndex) {
		return ProdURL + "replay/" + this.id + "/file/stream." + chunkIndex;
	}

	DownloadHeader() {
		console.log("Retrieving replay header");
		return promiseRequest({
			url: this.DownloadHeaderURL(),
			method: 'GET',
			encoding: null,
		}).then(res => {
			var reader = new UEUtils.UReader(res.body);
			reader.FLevelNameAndTime = function() {
				return {
					LevelName: this.fstring(),
					LevelChangeTimeInMS: this.uint32(),
				};
			}
			this.header = {
				Magic: reader.uint32(),
				Version: reader.uint32(),
				NetworkChecksum: reader.uint32(),
				EngineNetworkProtocolVersion: reader.uint32(),
				GameNetworkProtocolVersion: reader.uint32(),
				Changelist: reader.uint32(),
				LevelNamesAndTimes: reader.tarray('FLevelNameAndTime'),
				GameSpecificData: reader.tarray('fstring'),
				//_buffer: res.body,
			};
			this.headerBuffer = res.body;
			return this.header;
		}).then(data => {
			// post-process GameSpecificData
			for ( var i=0; i<data.GameSpecificData.length; i++ ) {
				var m = data.GameSpecificData[i].match(/^(.*)\n(.*?) \n(.*)$/m);
				if ( m )
					data.GameSpecificData[i] = { PakName:m[1], URL:m[2], Checksum:m[3] };
				else
					console.log("failed to parse: '" + data.GameSpecificData[i] + "'");
			}
			return data;
		});
	}

	StartStreaming() {
		console.log("Retrieving replay info");
		return promiseRequest({
			url: this.StartStreamingURL(),
			method: 'POST',
			json: true,
		}).then(res => {
			this.startInfo = res.body;
			return this.startInfo;
		});
	}

	EnumerateEvents(group) {
		return promiseRequest({
			url: this.EnumerateEventsURL(group),
			method: 'GET',
			json: true,
		}).then(res => res.body.events);
	}

	EnumerateCheckpoints() {
		console.log("Retrieving checkpoints list");
		return this.EnumerateEvents('checkpoint')
		.then(checkpoints => {
			this.checkpoints = checkpoints;
			return this.checkpoints;
		});
	}

	DownloadChunk(chunkIndex) {
		return promiseRequest({
			url: this.DownloadChunkURL(chunkIndex),
			method: 'GET',
			encoding: null,
		}).then(res => {
			while ( this.chunkHeaders.length < chunkIndex )
				this.chunkHeaders.push({});

			this.chunkHeaders[chunkIndex] = {
				MTime1    : res.headers.mtime1,
				MTime2    : res.headers.mtime2,
				NumChunks : res.headers.numchunks,
				State     : res.headers.state,
				Time      : res.headers.time,
			};
			return res.body;
		});
	}

	DownloadAllMetadata() {
		var promises = [ mkdir2(this.localDirPath) ];
		if ( !this.header )
			promises.push( this.DownloadHeader() );
		if ( !this.startInfo )
			promises.push( this.StartStreaming() );
		if ( !this.checkpoints )
			promises.push( this.EnumerateCheckpoints() );
		
		return Promise.all(promises)
		.then(_ => {
			return util.promisify(fs.writeFile)(path.join(this.localDirPath, 'metadata.json'), JSON.stringify({
				header: this.header,
				startInfo: this.startInfo,
				checkpoints: this.checkpoints,
			},null,2), 'utf8');
		});
	}

	DownloadAllChunks() {
		return mkdir2(this.localDirPath)
		.then(_ => {
			if ( !this.startInfo )
				return this.StartStreaming();
		})
		.then(_ => this._DownloadNextChunk(0))
		.then(_ => util.promisify(fs.writeFile)(path.join(this.localDirPath, 'chunks.json'), JSON.stringify(this.chunkHeaders,null,2)));
	}
	_DownloadNextChunk(currentIndex) {
		if ( currentIndex >= this.startInfo.numChunks )
			return Promise.resolve();

		console.log("Downloading chunk " + currentIndex + " / " + (this.startInfo.numChunks-1));
		return this.DownloadChunk(currentIndex)
		.then(buf => util.promisify(fs.writeFile)(path.join(this.localDirPath, 'stream.' + currentIndex), buf))
		.then(_ => this._DownloadNextChunk(currentIndex+1));
	}

	DownloadAllCheckpoints() {
		return mkdir2(this.localDirPath)
		.then(_ => {
			if ( !this.checkpoints )
				return this.EnumerateCheckpoints();
		})
		.then(_ => this._DownloadNextCheckpoint(0));
	}
	_DownloadNextCheckpoint(currentIndex) {
		if ( currentIndex >= this.checkpoints.length )
			return Promise.resolve();

		var cp = this.checkpoints[currentIndex];
		console.log("Downloading checkpoint " + currentIndex + " / " + (this.checkpoints.length-1));
		return DownloadCheckpoint(cp.id)
		.then(buf => util.promisify(fs.writeFile)(path.join(this.localDirPath, 'checkpoint.' + cp.id), buf))
		.then(_ => this._DownloadNextCheckpoint(currentIndex+1));
	}
}

//============================================================
// LocalReplay
//============================================================

class LocalReplay {
	constructor(replayId) {
		this.id = replayId;
		this.localDirPath = path.join(REPLAYS_FOLDER, replayId);

		this.header = null;
		this.startInfo = null;
		this.checkpoints = null;
		this.chunkHeaders = [];
		this.headerBuffer = null;
	}

	Load() {
		return Promise.all([

			util.promisify(fs.readFile)(path.join(this.localDirPath, 'metadata.json'), 'utf8')
			.then(jsonString => {
				var data = JSON.parse(jsonString);
				this.header = data.header;
				this.startInfo = data.startInfo;
				this.checkpoints = data.checkpoints;
			}),

			util.promisify(fs.readFile)(path.join(this.localDirPath, 'chunks.json'), 'utf8')
			.then(jsonString => {
				this.chunkHeaders = JSON.parse(jsonString);
			}),

		]);
	}

	BinaryHeader() {
		if ( !this.headerBuffer ) {
			var writer = new UEUtils.UWriter(null);
			writer.FLevelNameAndTime = function(data) {
				this.fstring(data.LevelName);
				this.uint32(data.LevelChangeTimeInMS);
			}
			writer.uint32(this.header.Magic);
			writer.uint32(this.header.Version);
			writer.uint32(this.header.NetworkChecksum);
			writer.uint32(this.header.EngineNetworkProtocolVersion);
			writer.uint32(this.header.GameNetworkProtocolVersion);
			writer.uint32(this.header.Changelist);
			writer.tarray(this.header.LevelNamesAndTimes, 'FLevelNameAndTime');
			writer.tarray(this.header.GameSpecificData.map(item => item.PakName+"\n"+item.URL+" \n"+item.Checksum), 'fstring');
			this.headerBuffer = writer.getBuffer();
		}
		return this.headerBuffer;
	}
}

//============================================================
// Exports
//============================================================

module.exports = {
	REPLAYS_FOLDER,
	ProdURL,
	EnumerateStreamsURL,
	EnumerateStreams,
	RemoteReplay,
	LocalReplay,
};
