import { ChatMessage, ChatRole } from "./ChatMessage";
import { streamSse } from "./stream";
import { RequestOptions } from "node:http";
import { LlmConfig } from "../settings/LlmConfig";
import { channel } from "../channel";

type RequestInfo = Request | string;

/// todo: extract for abstract API of completion
export class OpenAICompletion {
	private engine?: string;
	private apiKey?: string;
	private apiBase?: string;
	private apiType?: "openai" | "azure";
	private apiVersion?: string;
	private requestOptions?: RequestOptions;
	private model?: string;

	constructor(llmConfig: LlmConfig) {
		this.apiKey = llmConfig.apiKey;
		this.apiBase = llmConfig.baseURL;
		this.apiType = "openai";
		this.model = llmConfig.model;
	}

	async output(messages: ChatMessage[]): Promise<string> {
		let output = "";
		for await (const chunk of this._streamChat(messages)) {
			output += chunk.content;
		}

		return output;
	}

	async complete(prompt: string, params?: any, signal?: AbortSignal) {
		let completion = "";
		for await (const chunk of this._streamChat([{ role: ChatRole.User, content: prompt }], params, signal)) {
			completion += chunk.content;
		}

		return completion;
	}

	async createCompletion<T = any>(params: any, signal?: AbortSignal): Promise<T | undefined> {
		let url = this._getEndpoint("completions");
		
		channel.debug(`(OpenAICompletion): Completion request with url: ${url}`);

		const body = {
			model: this.model,
			...params
		};

		channel.debug(`(OpenAICompletion): Completion request with body: ${JSON.stringify(body)}`);

		const completion = await this.fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.apiKey}`,
				"api-key": this.apiKey ?? "", // For Azure
			},
			body: JSON.stringify(body),
			signal,
		}).then(res => res.json()).catch(error => {
			channel.debug(`(OpenAICompletion): fetch error: ${error.message}`);
		});

		if (completion) {
			channel.debug(`(OpenAICompletion): fetch done: ${JSON.stringify(completion)}`);
		}
		
		return completion;
	}

	async* _streamChat(messages: ChatMessage[], params?: any, signal?: AbortSignal): AsyncGenerator<ChatMessage> {
		let body = {
			...this._convertArgs(params || {}, messages),
			stream: true,
		};
		// Empty messages cause an error in LM Studio
		body.messages = body.messages.map((m) => ({
			...m,
			content: m.content === "" ? " " : m.content,
		})) as any;
		let url = this._getEndpoint("chat/completions");


		channel.debug(`(OpenAICompletion): Chat stream request with ${url}`);
		channel.debug(`(OpenAICompletion): Chat stream request with body: ${JSON.stringify(body)}`);

		const response = await this.fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.apiKey}`,
				"api-key": this.apiKey ?? "", // For Azure
			},
			body: JSON.stringify(body),
			signal,
		});

		for await (const value of streamSse(response)) {
			if (value.choices?.[0]?.delta?.content) {
				yield value.choices[0].delta;
			}
		}
	}

	protected _convertArgs(options: any, messages: ChatMessage[]) {
		const finalOptions = {
			messages: messages,
			model: this.model,
			max_tokens: options.maxTokens,
			temperature: options.temperature,
			top_p: options.topP,
			frequency_penalty: options.frequencyPenalty,
			presence_penalty: options.presencePenalty,
			stop: options.stop,
		};

		return finalOptions;
	}

	private _getEndpoint(
		endpoint: "chat/completions" | "completions" | "models",
	) {
		if (this.apiType === "azure") {
			return new URL(
				`openai/deployments/${this.engine}/${endpoint}?api-version=${this.apiVersion}`,
				this.apiBase,
			);
		} else {
			if (!this.apiBase) {
				throw new Error(
					"No API base URL provided. Please set the 'apiBase' option in config.json",
				);
			}

			return new URL(endpoint, this.apiBase);
		}
	}

	_fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> = undefined;

	protected fetch(
		url: RequestInfo | URL,
		init?: RequestInit,
	): Promise<Response> {
		if (this._fetch) {
			// Custom Node.js fetch
			return this._fetch(url, init);
		}

		// Most of the requestOptions aren't available in the browser
		const headers = new Headers(init?.headers);
		for (const [key, value] of Object.entries(
			this.requestOptions?.headers ?? {},
		)) {
			headers.append(key, value as string);
		}

		return fetch(url, {
			...init,
			headers,
		});
	}
}