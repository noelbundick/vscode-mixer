'use strict';

import {
	IPCMessageReader, IPCMessageWriter, createConnection, IConnection, TextDocuments, TextDocument,
	Diagnostic, DiagnosticSeverity, InitializeResult, TextDocumentPositionParams, CompletionItem,
	CompletionItemKind
} from 'vscode-languageserver';

import {
	GameClient,
	IButton,
	IButtonData,
	IControlData,
	IGridPlacement,
	IParticipant,
	setWebSocket,
	IInputEvent,
	ISceneControlDeletion
} from 'beam-interactive-node2';

import * as ws from 'ws';

// Create a connection for the server. The connection uses Node's IPC as a transport
let connection: IConnection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));

// Create a simple text document manager. The text document manager
// supports full document sync only
let documents: TextDocuments = new TextDocuments();
// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);


let shouldSendDiagnosticRelatedInformation: boolean = false;

// After the server has started the client sends an initialize request. The server receives
// in the passed params the rootPath of the workspace plus the client capabilities.
connection.onInitialize((_params): InitializeResult => {
	shouldSendDiagnosticRelatedInformation = _params.capabilities && _params.capabilities.textDocument && _params.capabilities.textDocument.publishDiagnostics && _params.capabilities.textDocument.publishDiagnostics.relatedInformation;
	return {
		capabilities: {
			// Tell the client that the server works in FULL text document sync mode
			textDocumentSync: documents.syncKind,
			// Tell the client that the server support code complete
			completionProvider: {
				resolveProvider: true
			}
		}
	}
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent((change) => {
	validateTextDocument(change.document);
});

// The settings interface describe the server relevant settings part
interface Settings {
	mixer: MixerSettings;
}

// These are the example settings we defined in the client's package.json
// file
interface MixerSettings {
	maxNumberOfProblems: number;
	authToken: string;
	versionId: number;
}

// settings
let maxNumberOfProblems: number;
let authToken: string;
let versionId: number;

// The settings have changed. Is send on server activation
// as well.
connection.onDidChangeConfiguration((change) => {
	let settings = <Settings>change.settings;
	maxNumberOfProblems = settings.mixer.maxNumberOfProblems || 100;

	// Reset the connection if Mixer configuration changes
	if (settings.mixer.authToken !== authToken || settings.mixer.versionId !== versionId) {
		authToken = settings.mixer.authToken;
		versionId = settings.mixer.versionId || -1;

		client.close();

		if (authToken && versionId) {
			client.open({
				authToken: authToken,
				versionId: versionId
			});
		}
	}

	// Revalidate any open text documents
	documents.all().forEach(validateTextDocument);
});

// This handler provides the initial list of the completion items.
connection.onCompletion((_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
	// The pass parameter contains the position of the text document in
	// which code complete got requested. For the example we ignore this
	// info and always provide the same completion items.
	return [
		{
			label: 'TypeScript',
			kind: CompletionItemKind.Text,
			data: 1
		},
		{
			label: 'JavaScript',
			kind: CompletionItemKind.Text,
			data: 2
		}
	]
});

// This handler resolve additional information for the item selected in
// the completion list.
connection.onCompletionResolve((item: CompletionItem): CompletionItem => {
	if (item.data === 1) {
		item.detail = 'TypeScript details',
			item.documentation = 'TypeScript documentation'
	} else if (item.data === 2) {
		item.detail = 'JavaScript details',
			item.documentation = 'JavaScript documentation'
	}
	return item;
});

connection.onDidChangeWatchedFiles((_change) => {
	// Monitored files have change in VSCode
	connection.console.log('We received an file change event');
});

// We need to tell the Mixer interactive client what type of websocket we are using.
setWebSocket(ws);

// As we're on the Streamer's side we need a "GameClient" instance
const client = new GameClient();

// Log when we're connected to interactive and setup your game!
client.on('open', () => {
	console.log('Connected to Interactive!');
});

// These can be un-commented to see the raw JSON messages under the hood
// client.on('message', (err: any) => console.log('<<<', err));
// client.on('send', (err: any) => console.log('>>>', err));
// client.on('error', (err: any) => console.log(err));

client.state.on('participantJoin', participant => {
	console.log(`${participant.username}(${participant.sessionID}) Joined`);
});
client.state.on('participantLeave', (participantSessionID: string, participant: IParticipant) => {
	console.log(`${participant.username}(${participantSessionID}) Left`);
});

// Listen on the connection
connection.listen();


/***************
 * FUNCTIONS
 ***************/

// validateTextDocument is called any time a document is updated - we catch errors, show validation info, and generate Mixer buttons
async function validateTextDocument(textDocument: TextDocument) {
	let diagnostics: Diagnostic[] = [];
	let lines = textDocument.getText().split(/\r?\n/g);
	let problems = 0;
	for (var i = 0; i < lines.length && problems < maxNumberOfProblems; i++) {
		let line = lines[i];
		let index = line.indexOf('typescript');
		if (index >= 0) {
			problems++;

			let diagnosic: Diagnostic = {
				severity: DiagnosticSeverity.Warning,
				range: {
					start: { line: i, character: index },
					end: { line: i, character: index + 10 }
				},
				message: `${line.substr(index, 10)} should be spelled TypeScript`,
				source: 'ex'
			};
			if (shouldSendDiagnosticRelatedInformation) {
				diagnosic.relatedInformation = [
					{
						location: {
							uri: textDocument.uri,
							range: {
								start: { line: i, character: index },
								end: { line: i, character: index + 10 }
							}
						},
						message: 'Spelling matters'
					},
					{
						location: {
							uri: textDocument.uri,
							range: {
								start: { line: i, character: index },
								end: { line: i, character: index + 10 }
							}
						},
						message: 'Particularly for names'
					}
				];
			}
			diagnostics.push(diagnosic);
		}
	}

	// Examine the first scene and check to see if it currently has any controls
	let scene = (await client.getScenes()).scenes[0];
	let hasControls = scene.controls && scene.controls.length > 0;
	if (problems > 0 && !hasControls) {
		client.createControls({
			sceneID: 'default',
			controls: makeControls(1, _ => `Fix it!`),
		}).then(controls => {

			// Now that the controls are created we can add some event listeners to them!
			controls.forEach(control => {

				// mousedown here means that someone has clicked the button.
				control.on('mousedown', (inputEvent: IInputEvent<IButton>, participant: IParticipant) => {

					// Let's tell the user who they are, and what they pushed.
					console.log(`${participant.username} pushed, ${inputEvent.input.controlID}`);

					let message = `${participant.username} says Fix It!`;

					// Show an error, which will pop up in the editor
					connection.window.showErrorMessage(message);

					// We'll also send the message in an arbitrary payload that we can define
					let myEvent = {
						text: message
					};
					connection.telemetry.logEvent(myEvent);

					// Did this push involve a spark cost?
					if (inputEvent.transactionID) {

						// Unless you capture the transaction the sparks are not deducted.
						client.captureTransaction(inputEvent.transactionID)
							.then(() => {
								console.log(`Charged ${participant.username} ${(<IButton>control).cost} sparks!`);
							});
					}
				});
			});
			// Controls don't appear unless we tell Interactive that we are ready!
			return client.ready(true);
		});
	} else if (hasControls && problems === 0) {
		// If there are buttons visible, but all problems have been resolved - let's clear them out
		let toDelete: ISceneControlDeletion = {
			sceneID: 'default',
			controlIDs: scene.controls.map(c => c.controlID)
		};
		client.deleteControls(toDelete);
	}

	// Send the computed diagnostics to VSCode.
	connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

function getGridPlacement(x: number, y: number, size: number = 10): IGridPlacement[] {
	return [
		{
			size: 'large',
			width: size * 3,
			height: size,
			x: x * size,
			y: y * size,
		},
		{
			size: 'medium',
			width: size * 3,
			height: size,
			x: x * size,
			y: y * size,
		},
		{
			size: 'small',
			width: size * 3,
			height: size,
			x: x * size,
			y: y * size,
		},
	];
}


function makeControls(amount: number = 5, textGenerator: (i: number) => string): IControlData[] {
	const controls: IButtonData[] = [];
	const size = 10;
	for (let i = 0; i < amount; i++) {
		controls.push({
			controlID: `${i}`,
			kind: 'button',
			text: textGenerator(i),
			tooltip: textGenerator(i),
			cost: 0,
			progress: 0,
			backgroundColor: "#007ACC",
			textColor: "#ffffff",
			position: getGridPlacement(i, 0, size),
		});
	}
	return controls;
}