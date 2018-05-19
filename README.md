# vscode-mixer

This is a sample extension that shows how it's possible to dynamically create buttons in a [Mixer](https://mixer.com/) stream based on interesting events inside VS Code.
It opens up the opportunity for viewers of a programming live stream to interact directly with the editor

For example, you could allow viewers to spend sparks to activate [Power Mode](https://marketplace.visualstudio.com/items?itemName=hoovercj.vscode-power-mode) for a limited amount of time!

## Proof of Concept

This is currently implemented as a VS Code lanaguage server which holds an open websocket to the Mixer [Interactive](https://dev.mixer.com/reference/interactive/index.html) API.

It's based on the [languageprovider-sample](https://github.com/Microsoft/vscode-extension-samples/tree/master/lsp-sample) for VS Code, as well as the [basic](https://github.com/mixer/interactive-node/blob/master/examples/basic.ts) example from [interactive-node](https://github.com/mixer/interactive-node)

The extension observes all 'plaintext' documents (documents from all editors not associated with a language) and uses the server to provide validation and completion proposals.

When it encounters an error, it creates a button on the configured Mixer stream that says "Fix it!". When viewers click the button (currently costs 0 sparks since this is a PoC), an error that says "{username} says Fix It!" appears inside the current VS Code window. The same message is also injected into the current open document at the current cursor location, showing that a "Twitch Plays Pokemon" or "Million Monkeys on a Typewriter" scenario could be easily implemented :)

The code for the extension is in the 'client' folder. It uses the 'vscode-languageclient' node module to launch the language server.

The language server is located in the 'server' folder.

## How to run locally

Requirements

* Node
* TypeScript
* Mixer account

Use the following steps to run the extension locally, using my sample app ID. You'll be prompted for limited permissions over a single scope `interactive:robot:self`, which allows "Run as an interactive game in your channel."

Building & running the extension

* `npm install` to initialize the extension and the server
* `npm run compile` to compile the extension and the server
* open the `vscode-mixer` folder in VS Code. In the Debug viewlet, run 'Launch Client' from drop-down to launch the extension and attach to the extension.
* go to https://mixer.com/oauth/authorize?client_id=0b96d8b84aaff9280b253b7708504fc3f4ebc2c487536881&response_type=token&scope=interactive%3Arobot%3Aself&redirect_uri=https://vscodemixer.blob.core.windows.net/token/token.html to get an access token
* set `mixer.accessToken` in your User Settings to `access_token`
* open up your Mixer channel, ex: https://mixer.com/acanthamoeba
* create a file `test.txt`, and type `typescript`. You should see a validation error.
* to debug the server use the 'Attach to Server' launch config.
* set breakpoints in the client or the server.

## Creating your own Mixer app

If you want to use your own Mixer app instead of my sample app, go to https://mixer.com/lab/oauth and create the following items:

* An `OAuth Application` *without* a Secret Key. I set my hosts to an Azure Storage account, so I could redirect to `token.html`
* An `Interactive Project`. I used all defaults. You'll want to grab your `versionId` and set it in `mixer.versionId` in your User Settings