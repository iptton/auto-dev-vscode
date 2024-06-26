import vscode, { Position, Range } from "vscode";
import { NamedElementBuilder } from "../../../editor/ast/NamedElementBuilder";
import { PromptManager } from "../../../prompt-manage/PromptManager";
import { ActionType } from "../../../prompt-manage/ActionType";
import { TemplateContext } from "../../../prompt-manage/template/TemplateContext";
import { LlmProvider } from "../../../llm-provider/LlmProvider";
import { CustomActionPrompt } from "../../../prompt-manage/custom-action/CustomActionPrompt";
import { AutoDevStatus, AutoDevStatusManager } from "../../../editor/editor-api/AutoDevStatusManager";
import { TreeSitterFileManager } from "../../../editor/cache/TreeSitterFileManager";

export class RenameLookupExecutor {
	static async suggest(document: vscode.TextDocument, position: Position, token: vscode.CancellationToken): Promise<undefined | Range | {
		range: Range;
		placeholder: string;
	}> {
		let range = document.getWordRangeAtPosition(position)!!;
		let treeSitterFile = await TreeSitterFileManager.create(document);
		let elementBuilder = new NamedElementBuilder(treeSitterFile);
		let elementForSelections = elementBuilder.getElementForAction(position.line);

		if (elementForSelections.length === 0) {
			return range;
		}

		let firstElement = elementForSelections[0];

		const context: RenameTemplateContext = {
			originName: firstElement.identifierRange.text,
			language: document.languageId,
			code: firstElement.blockRange.text
		};

		let instruction = await PromptManager.getInstance().generateInstruction(ActionType.Rename, context);

		try {
			let chatMessages = CustomActionPrompt.parseChatMessage(instruction);
			AutoDevStatusManager.instance.setStatus(AutoDevStatus.InProgress);
			let output = await LlmProvider.codeCompletion().output(chatMessages);
			AutoDevStatusManager.instance.setStatus(AutoDevStatus.Done);

			return {
				range: range,
				placeholder: postNameFix(output)
			};
		} catch (e) {
			console.log("error:" + e);
			AutoDevStatusManager.instance.setStatus(AutoDevStatus.Error);
			return range;
		}
	}
}

export function postNameFix(str: string): string {
	const firstChar = str.charAt(0);
	const lastChar = str.charAt(str.length - 1);
	if ((firstChar === '"' && lastChar === '"') || (firstChar === "'" && lastChar === "'") || (firstChar === '`' && lastChar === '`')) {
		return str.substring(1, str.length - 1);
	}

	return str;
}

export interface RenameTemplateContext extends TemplateContext {
	originName: string;
	language: string;
	code: string;
}