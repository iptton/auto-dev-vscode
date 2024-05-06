import * as vscode from "vscode";
// for Dependency Injection with InversifyJS
import "reflect-metadata";
import Parser from "web-tree-sitter";

import { registerCommands } from "./commands/commands";
import { AutoDevWebviewViewProvider } from "./editor/webview/AutoDevWebviewViewProvider";
import { VSCodeAction } from "./editor/editor-api/VSCodeAction";
import { RecentlyDocumentManager } from "./editor/document/RecentlyDocumentManager";
import { DiffManager } from "./editor/diff/DiffManager";
import { AutoDevExtension } from "./AutoDevExtension";
import { removeExtensionContext, setExtensionContext } from './context';
import {
	registerAutoDevProviders,
	registerCodeLensProviders,
	registerQuickFixProvider,
	registerWebViewProvider
} from "./editor/providers/ProviderUtils";
import { channel } from "./channel";
import { RelatedCodeProviderManager } from "./code-context/RelatedCodeProviderManager";
import { CodeFileCacheManager } from "./editor/cache/CodeFileCacheManager";
import { AutoDevStatusManager } from "./editor/editor-api/AutoDevStatusManager";
import { BuildToolSync } from "./toolchain-context/buildtool/BuildToolSync";
import { CodebaseIndexer } from "./code-search/CodebaseIndexer";

(globalThis as any).self = globalThis;

export async function activate(context: vscode.ExtensionContext) {
	setExtensionContext(context);
	const sidebar = new AutoDevWebviewViewProvider(context);
	const action = new VSCodeAction();

	const documentManager = new RecentlyDocumentManager();
	const diffManager = new DiffManager();
	const fileCacheManager = new CodeFileCacheManager();
	const relatedManager = new RelatedCodeProviderManager();
	const extension = new AutoDevExtension(
		sidebar, action, documentManager, diffManager, relatedManager, fileCacheManager, context,
	);

	Parser.init().then(async () => {
			registerCodeLensProviders(extension);
			registerAutoDevProviders(extension);
			registerQuickFixProvider(extension);

			await new BuildToolSync().startWatch();
		}
	);

	registerCommands(extension);
	registerWebViewProvider(extension);
	bindingDocumentChange(documentManager);

	AutoDevStatusManager.instance.create();

	// setup for index
	channel.show();

	let codebaseIndexer = new CodebaseIndexer();
	codebaseIndexer.init();
}

function bindingDocumentChange(documentManager: RecentlyDocumentManager) {
	vscode.window.onDidChangeActiveTextEditor(
		async (editor: vscode.TextEditor | undefined) => {
			if (!editor) {
				return;
			}

			documentManager.updateCurrentDocument(editor.document);
		}
	);

	vscode.workspace.onDidCloseTextDocument(async (document: vscode.TextDocument) => {
		// todos: remove document from cache
	});
}

export function deactivate() {
	removeExtensionContext();
}
