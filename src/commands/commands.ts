import * as vscode from "vscode";
import { l10n } from "vscode";

import { AutoDevExtension } from "../AutoDevExtension";
import { NamedElement } from "../editor/ast/NamedElement";
import { channel } from "../channel";
import { AutoDocActionExecutor } from "../action/autodoc/AutoDocActionExecutor";
import { AutoTestActionExecutor } from "../action/autotest/AutoTestActionExecutor";
import { NamedElementBuilder } from "../editor/ast/NamedElementBuilder";
import { QuickActionService } from "../editor/editor-api/QuickAction";
import { SystemActionService } from "../action/setting/SystemActionService";
import { createNamedElement } from "../code-context/ast/TreeSitterWrapper";
import { AutoDevCommandOperation } from "./autoDevCommandOperation";
import { AutoDevCommand } from "./autoDevCommand";
import { DefaultLanguageService } from "../editor/language/service/DefaultLanguageService";
import { CommitMessageGenAction } from "../action/devops/CommitMessageGenAction";
import { RelevantCodeProviderManager } from "../code-context/RelevantCodeProviderManager";
import { TreeSitterFileManager } from "../editor/cache/TreeSitterFileManager";
import { addHighlightedCodeToContext, getFullScreenTab, getInput, showTutorial } from "./commandsUtils";
import { Catalyser } from "../agent/catalyser/Catalyser";
import { SystemActionType } from "../action/setting/SystemActionType";

const commandsMap: (extension: AutoDevExtension) => AutoDevCommandOperation = (extension) => ({
	[AutoDevCommand.QuickFix]: async (message: string, code: string, edit: boolean) => {
		let language = vscode.window.activeTextEditor?.document.languageId ?? "";

		extension.sidebar.webviewProtocol?.request("newSessionWithPrompt", {
			prompt: `${edit ? "/edit " : ""}${code}\n\n${l10n.t("How do I fix this problem in the above code?")}: 
\`\`\`${language}
${message}
\`\`\`
`,
		});

		if (!edit) {
			vscode.commands.executeCommand("autodev.autodevGUIView.focus");
		}
	},
	[AutoDevCommand.SendToTerminal]: async (text: string) => {
		extension.ideAction.runCommand(text).then(() => {
		}, (err) => vscode.window.showErrorMessage(err.message));
	},
	[AutoDevCommand.DebugTerminal]: async () => {
		vscode.commands.executeCommand("autodev.autodevGUIView.focus");
		const terminalContents = await extension.ideAction.getTerminalContents(1);
		extension.sidebar.webviewProtocol?.request("newSessionWithPrompt", {
			prompt: `${l10n.t("I got the following error, can you please help explain how to fix it?")}\n\n${terminalContents.trim()}`,
		});

		vscode.commands.executeCommand("autodev.autodevGUIView.focus");
	},
	[AutoDevCommand.TerminalExplainContextMenu]: async () => {
		const terminalContents = await extension.ideAction.getTerminalContents(1);
		extension.sidebar.webviewProtocol?.request("newSessionWithPrompt", {
			prompt: `${l10n.t("I got the following error, can you please help explain how to fix it?")}\n\n${terminalContents.trim()}`,
		});

		vscode.commands.executeCommand("autodev.autodevGUIView.focus");
	},
	[AutoDevCommand.AutoComment]: async (
		document: vscode.TextDocument,
		range: NamedElement,
		edit: vscode.WorkspaceEdit
	) => {
		await new AutoDocActionExecutor(document, range, edit).execute();
	},
	[AutoDevCommand.AutoTest]: async (
		// in context menu, the first argument is not the document
		document?: vscode.TextDocument,
		element?: NamedElement,
		edit?: vscode.WorkspaceEdit
	) => {
		const editor = vscode.window.activeTextEditor;
		const textDocument = editor?.document;
		if (!textDocument) {
			return;
		}

		let elementBuilder: NamedElementBuilder | null = null;
		await createNamedElement(textDocument).then((builder) => {
			elementBuilder = builder;
		}).catch((err) => {
			channel.appendLine(`Error: ${err}`);
		});

		if (elementBuilder === null) {
			return;
		}

		const selectionStart: number = editor?.selection.start.line ?? 0;
		const selectionEnd: number = editor?.selection.end.line ?? textDocument.lineCount;

		const nameElement = element || (elementBuilder as NamedElementBuilder)!!.getElementForSelection(selectionStart, selectionEnd)?.[0];
		if (!nameElement) {
			return;
		}

		const workspaceEdit = edit || new vscode.WorkspaceEdit();
		await new AutoTestActionExecutor(textDocument, nameElement, workspaceEdit).execute();
	},
	[AutoDevCommand.ExplainThis]: async () => {
		const input = getInput();
		if (!input) {
			return;
		}

		let language = vscode.window.activeTextEditor?.document.languageId ?? "";
		extension.sidebar.webviewProtocol?.request("newSessionWithPrompt", { prompt:
`${l10n.t("Explain this code")}:
\`\`\`${language} 
${input}
\`\`\`
` });

		vscode.commands.executeCommand("autodev.autodevGUIView.focus");
	},
	[AutoDevCommand.FixThis]: async () => {
		const input = getInput();
		if (!input) {
			return;
		}

		extension.sidebar.webviewProtocol?.request("newSessionWithPrompt", {
			prompt: `\`${l10n.t("I got the following error, can you please help explain how to fix it?")}: ${input}`,
		});

		vscode.commands.executeCommand("autodev.autodevGUIView.focus");
	},
	[AutoDevCommand.MenuAutoComment]: async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			return;
		}

		let edit = new vscode.WorkspaceEdit();
		let document = editor.document;

		let elementBuilder = await createNamedElement(document);
		let currentLine = editor.selection.active.line;
		let ranges = elementBuilder.getElementForAction(currentLine);

		if (ranges.length === 0) {
			return;
		}

		await new AutoDocActionExecutor(document, ranges[0], edit).execute();
	},
	[AutoDevCommand.ActionQuickAction]: async (document: vscode.TextDocument, range: NamedElement, edit: vscode.WorkspaceEdit) => {
		let quickActionService = QuickActionService.instance();
		await quickActionService.show(extension);
	},
	[AutoDevCommand.SystemAction]: async (document: vscode.TextDocument, range: NamedElement, edit: vscode.WorkspaceEdit) => {
		await SystemActionService.instance().show(extension);
	},
	[AutoDevCommand.GenerateCommitMessage]: async () => {
		let activate = await vscode.extensions.getExtension('vscode.git');
		activate?.activate()?.then(async (gitExtension) => {
			const gitAPI = gitExtension.getAPI(1);
			const repo = gitAPI.repositories[0];
			await new CommitMessageGenAction().handleDiff(repo.inputBox);
		});
	},
	[AutoDevCommand.GenApiData]: async (
		document: vscode.TextDocument,
		range: NamedElement,
		edit: vscode.WorkspaceEdit
	) => {
		let structurer = extension.structureProvider?.getStructurer(document.languageId);
		if (!structurer) {
			vscode.window.showErrorMessage("No structurer provider found for this language");
			return;
		}

		let langService = new DefaultLanguageService();
		let relatedProvider = RelevantCodeProviderManager.getInstance().provider(document.languageId, langService);
		let file = await TreeSitterFileManager.create(document);

		let outputs = await relatedProvider?.getMethodFanInAndFanOut(file, range);
		if (outputs !== undefined) {
			outputs.map((output) => {
				channel.append(`current outputs: ${JSON.stringify(output)}\n`);
			});
		}
	},
	[AutoDevCommand.GUIFocusInput]: async () => {
		if (!getFullScreenTab()) {
			vscode.commands.executeCommand("autodev.autodevGUIView.focus");
		}
		extension.sidebar.webviewProtocol?.request("focusAutoDevInput", undefined);
		await addHighlightedCodeToContext(false, extension.sidebar.webviewProtocol);
	},
	[AutoDevCommand.NewSession]: () => {
		extension.sidebar.webviewProtocol?.request("newSession", undefined);
	},
	[AutoDevCommand.ShowTutorial]: () => {
		showTutorial();
	},
	[AutoDevCommand.CodespaceKeywordsAnalysis]: async (input: string) => {
		Catalyser.getInstance(extension).query(input, SystemActionType.SemanticSearchKeyword);
	},
	[AutoDevCommand.CodespaceCodeAnalysis]: async (input: string) => {
		Catalyser.getInstance(extension).query(input, SystemActionType.SemanticSearchCode);
	}
});

export function registerCommands(extension: AutoDevExtension) {
	const commands = commandsMap(extension);
	Object.entries(commands).forEach(([command, handler]) => {
		extension.extensionContext.subscriptions.push(
			vscode.commands.registerCommand(command, handler)
		);
	});
}
