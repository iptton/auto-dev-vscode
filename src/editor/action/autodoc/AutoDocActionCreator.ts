import { injectable } from "inversify";
import vscode from "vscode";

import { CodeActionCreator } from "../_base/ActionCreator";
import { NamedElementBlock } from "../../document/NamedElementBlock";
import { ActionCreatorContext } from "../_base/ActionCreatorContext";

@injectable()
export class AutoDocActionCreator extends CodeActionCreator {
	static readonly providedCodeActionKinds = [
		vscode.CodeActionKind.RefactorRewrite,
	];

	isApplicable(creatorContext: ActionCreatorContext): boolean {
		return true;
	}

	buildClassAction(context: ActionCreatorContext, elementBlock: NamedElementBlock) {
		const title = `AutoDoc for class \`${elementBlock.identifierRange.text}\` (AutoDev)`;
		return this.createDocAction(title, context.document, elementBlock);
	}

	buildMethodAction(context: ActionCreatorContext, elementBlock: NamedElementBlock): vscode.CodeAction {
		const title = `AutoDoc for method \`${elementBlock.identifierRange.text}\` (AutoDev)`;
		return this.createDocAction(title, context.document, elementBlock);
	}

	private createDocAction(title: string, document: vscode.TextDocument, block: NamedElementBlock): vscode.CodeAction {
		const codeAction = new vscode.CodeAction(title, AutoDocActionCreator.providedCodeActionKinds[0]);

		codeAction.isPreferred = false;
		codeAction.edit = new vscode.WorkspaceEdit();
		codeAction.command = {
			command: "autodev.autoComment",
			title: title,
			arguments: [document, block, codeAction.edit]
		};

		return codeAction;
	}
}
