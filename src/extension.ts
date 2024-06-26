import * as vscode from "vscode";
// for Dependency Injection with InversifyJS
import "reflect-metadata";
import Parser from "web-tree-sitter";

import { registerCommands } from "./commands/commands";
import { VSCodeAction } from "./editor/editor-api/VSCodeAction";
import { DiffManager } from "./editor/diff/DiffManager";
import { AutoDevExtension } from "./AutoDevExtension";
import { removeExtensionContext, setExtensionContext } from './context';
import { channel } from "./channel";
import {
	registerRefactoringRename,
	registerAutoDevProviders,
	registerCodeLensProviders,
	registerQuickFixProvider,
	registerWebViewProvider,
	registerCodeSuggestionProvider
} from "./action/ProviderRegister";
import { AutoDevStatusManager } from "./editor/editor-api/AutoDevStatusManager";
import { TreeSitterFileManager } from "./editor/cache/TreeSitterFileManager";
import { AutoDevWebviewViewProvider } from "./editor/webview/AutoDevWebviewViewProvider";
import { EmbeddingsProviderManager } from "./code-search/embedding/EmbeddingsProviderManager";

(globalThis as any).self = globalThis;

export async function activate(context: vscode.ExtensionContext) {
	setExtensionContext(context);
	const extension = setupAutoDevExtension(context);

	Parser.init().then(async () => {
		registerCodeLensProviders(extension);
		registerAutoDevProviders(extension);
		registerQuickFixProvider(extension);
		registerCodeSuggestionProvider(extension);

		// 注册命令集
		registerCommands(extension);
		registerRefactoringRename(extension);

		// for embedding and file parser
		TreeSitterFileManager.getInstance().init();
		EmbeddingsProviderManager.init(context);
	});

	registerWebViewProvider(extension);

	AutoDevStatusManager.instance.initStatusBar();

	if (process.env.NODE_ENV === "development") {
		channel.show();
	}
}

function setupAutoDevExtension(context: vscode.ExtensionContext) {
	const sidebar = new AutoDevWebviewViewProvider(context);
	const action = new VSCodeAction();
	const diffManager = new DiffManager();

	return new AutoDevExtension(
		sidebar, action, diffManager, context,
	);
}

export function deactivate() {
	removeExtensionContext();
}
