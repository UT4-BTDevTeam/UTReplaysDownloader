# UTReplaysDownloader

## Prerequisites

Install nodejs.

Install dependencies by running `npm install` in folder.

## Downloading replays

Run the downloader script with the following command :
```
node ReplayDownloader.js <REPLAY_ID>

example:
node ReplayDownloader.js 21d7f31997784363b7b2307daaeec41e
```

That's it. Upon completion, replay files will be located in `Replays/<REPLAY_ID>/` folder.

## Finding the replay ID

UT does not tell you replay IDs.
You can use the provided minimal web page **UTReplays.html** to view a the list of replays, as if you were in the game replays tab, with their ID displayed.

Due to security issues, the minimal web page cannot call UT servers on its own. You have to run the local streaming server for it to function. Use a separate command prompt and run `node ReplayServer.js` to launch the streaming server.

Once server is running, you can double click **UTReplays.html** to open it in browser, and UT replays should appear.

UT replays API will only return a max of 500 replays. With no filter that's about only one day of matches.
You can filter by player ID like you do ingame, and it does not require that player to be in your friends list. This way you can retrieve much older replays, up to one month old. UT servers do not keep replays any longer.

## Viewing replays

First you need to run the local replay streaming server, if it's not already running. Open a separate command prompt and execute :
```
node ReplayServer.js
```
Second, you must tell UT to use your local server instead of Epic's servers. Open `Documents/UnrealTournament/Saved/Config/Engine.ini` and edit/add the following sections :
```ini
[NetworkReplayStreaming]
DefaultFactoryName=HttpNetworkReplayStreaming

[HttpNetworkReplayStreaming]
ServerURL="http://localhost:8080/replay/"
```
Now you can run the game normally. The Watch tab should list your downloaded replays instead of UT replays, and they can be played normally.

To go back to using default Epic's replay servers, simply invalidate the config by changing the section name `[NetworkReplayStreaming]` with gibberish like for example `[NetworkReplayStreamingAAA]`.
