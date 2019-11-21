
var REPLAY_ID = process.argv[2];

if ( !REPLAY_ID ) {
	console.error("Usage: node ReplayDownloader.js <REPLAY ID>");
	return;
}

const UTReplays = require('./ut-replays.js');

var replay = new UTReplays.RemoteReplay(REPLAY_ID);

replay.CheckExists()
.then(_ => replay.DownloadAllMetadata())
.then(_ => replay.DownloadAllChunks())
.then(_ => replay.DownloadAllCheckpoints())
.then(_ => {
	console.log("DONE!");
	setTimeout(process.exit, 1000, 0);
})
.catch(err => {
	console.error(err);
	process.exit(1);
});
