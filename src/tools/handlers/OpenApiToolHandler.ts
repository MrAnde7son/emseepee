import { z } from "zod";
import type {
  OpenApiToolConfig,
  ToolPolicyConfig,
  OpenApiAuthConfig,
} from "../../config.js";
import type { Response } from "undici";
import { BaseGatewayHandler, type AgentContext, type ToolExecutionResult } from "./BaseGatewayHandler.js";
import { logger } from "../../logger.js";

interface OpenApiSchema {
  type?: string;
  format?: string;
  items?: OpenApiSchema;
  properties?: Record<string, OpenApiSchema>;
  required?: string[];
  enum?: unknown[];
  description?: string;
}

interface OpenApiParameter {
  name: string;
  in: "query" | "path" | "header" | "cookie";
  required?: boolean;
  description?: string;
  schema?: OpenApiSchema;
}

interface OpenApiOperationDescriptor {
  operationId: string;
  method: string;
  path: string;
  description?: string;
  parameters: OpenApiParameter[];
  requestBody?: OpenApiRequestBody;
  baseUrl: string;
}

interface OpenApiRequestBody {
  schema: OpenApiSchema;
  required: boolean;
  description?: string;
}

interface OpenApiSpec {
  servers?: Array<{ url: string }>;
  paths?: Record<
    string,
    {
      parameters?: OpenApiParameter[];
      [method: string]:
        | {
            operationId?: string;
            description?: string;
            parameters?: OpenApiParameter[];
            requestBody?: {
              required?: boolean;
              content?: Record<string, { schema?: OpenApiSchema }>;
            };
          }
        | OpenApiParameter[]
        | undefined;
    }
  >;
}

export interface GeneratedOpenApiTool {
  name: string;
  description: string;
  inputSchema: z.ZodObject<Record<string, z.ZodTypeAny>>;
  operation: OpenApiOperationDescriptor;
}

const SPEC_CACHE = new Map<string, Promise<GeneratedOpenApiTool[]>>();

export function clearOpenApiSpecCache(): void {
  SPEC_CACHE.clear();
}

export class OpenApiToolGenerator {
  constructor(private readonly config: OpenApiToolConfig) {}

  async getGeneratedTools(): Promise<GeneratedOpenApiTool[]> {
    const cacheKey = `${this.config.name}:${this.config.execution.openApiUrl}`;
    if (!SPEC_CACHE.has(cacheKey)) {
      SPEC_CACHE.set(cacheKey, this.buildTools());
    }
    return SPEC_CACHE.get(cacheKey)!;
  }

  private async buildTools(): Promise<GeneratedOpenApiTool[]> {
    const spec = await this.loadSpec();
    const baseUrl = this.getBaseUrl(spec);

    if (!spec.paths) {
      logger.warn(`[OpenApiToolGenerator] No paths defined for ${this.config.name}`);
      return [];
    }

    const tools: GeneratedOpenApiTool[] = [];
    for (const [path, methods] of Object.entries(spec.paths)) {
      for (const [method, operation] of Object.entries(methods)) {
        if (!operation || typeof operation === "string" || Array.isArray(operation)) {
          continue;
        }

        const operationId =
          operation.operationId || `${method.toLowerCase()}_${path.replace(/[^a-zA-Z0-9]+/g, "_")}`;
        const toolName = `${this.config.name}_${operationId}`;
        const parameters = [
          ...(methods.parameters || []),
          ...(operation.parameters || []),
        ];

        const requestBody = this.getRequestBody(operation.requestBody);
        const inputSchema = this.buildInputSchema(parameters, requestBody);

        tools.push({
          name: toolName,
          description: operation.description || this.config.description,
          inputSchema,
          operation: {
            operationId,
            method: method.toUpperCase(),
            path,
            description: operation.description,
            parameters,
            requestBody,
            baseUrl,
          },
        });
      }
    }

    return tools;
  }

  private async loadSpec(): Promise<OpenApiSpec> {
    const response = await fetch(this.config.execution.openApiUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch OpenAPI spec: ${response.status} ${response.statusText}`);
    }
    return response.json();
  }

  private getBaseUrl(spec: OpenApiSpec): string {
    if (spec.servers && spec.servers.length > 0 && spec.servers[0].url) {
      return spec.servers[0].url;
    }

    try {
      const parsed = new URL(this.config.execution.openApiUrl);
      return `${parsed.protocol}//${parsed.host}`;
    } catch (error) {
      logger.warn(`[OpenApiToolGenerator] Unable to derive base URL: ${error}`);
      return this.config.execution.openApiUrl;
    }
  }

  private getRequestBody(requestBody?: {
    required?: boolean;
    content?: Record<string, { schema?: OpenApiSchema }>;
  }): OpenApiRequestBody | undefined {
    if (!requestBody || !requestBody.content) {
      return undefined;
    }

    const jsonContent = requestBody.content["application/json"];
    if (!jsonContent?.schema) {
      return undefined;
    }

    return {
      schema: jsonContent.schema,
      required: Boolean(requestBody.required),
      description: jsonContent.schema.description,
    };
  }

  private buildInputSchema(
    parameters: OpenApiParameter[],
    requestBody?: OpenApiRequestBody
  ): z.ZodObject<Record<string, z.ZodTypeAny>> {
    const schema: Record<string, z.ZodTypeAny> = {};

    for (const parameter of parameters) {
      const parameterSchema = this.convertSchemaToZod(parameter.schema || { type: "string" });
      const describedSchema = parameter.description
        ? parameterSchema.describe(parameter.description)
        : parameterSchema;
      schema[parameter.name] = parameter.required ? describedSchema : describedSchema.optional();
    }

    if (requestBody) {
      const bodySchema = this.convertSchemaToZod(requestBody.schema);
      const describedSchema = requestBody.description
        ? bodySchema.describe(requestBody.description)
        : bodySchema;
      schema.body = requestBody.required ? describedSchema : describedSchema.optional();
    }

    return z.object(schema);
  }

  private convertSchemaToZod(schema: OpenApiSchema): z.ZodTypeAny {
    if (schema.enum && schema.enum.length > 0) {
      const literals = schema.enum.map((value) => z.literal(value));
      if (literals.length === 1) {
        return literals[0];
      }

      return literals.slice(1).reduce<z.ZodTypeAny>((acc, literal) => z.union([acc, literal]), literals[0]);
    }

    switch (schema.type) {
      case "string":
        return z.string();
      case "number":
      case "integer":
        return z.number();
      case "boolean":
        return z.boolean();
      case "array":
        return z.array(this.convertSchemaToZod(schema.items || {}));
      case "object":
        if (schema.properties) {
          const entries: Record<string, z.ZodTypeAny> = {};
          const required = new Set(schema.required || []);
          for (const [key, value] of Object.entries(schema.properties)) {
            const propertySchema = this.convertSchemaToZod(value);
            entries[key] = required.has(key) ? propertySchema : propertySchema.optional();
          }
          return z.object(entries);
        }
        return z.record(this.convertSchemaToZod(schema.items || {}));
      default:
        return z.unknown();
    }
  }
}

export class OpenApiToolHandler extends BaseGatewayHandler {
  private readonly toolConfig: ToolPolicyConfig;
  private readonly operation: OpenApiOperationDescriptor;
  private readonly authHeaders: Record<string, string>;

  constructor(private readonly generatedTool: GeneratedOpenApiTool, baseConfig: OpenApiToolConfig) {
    super();
    this.operation = generatedTool.operation;
    this.toolConfig = {
      ...baseConfig,
      name: generatedTool.name,
      description: generatedTool.description,
    };
    this.authHeaders = this.buildAuthHeaders(baseConfig.execution.auth);
  }

  protected getToolName(): string {
    return this.generatedTool.name;
  }

  protected getToolConfig(): ToolPolicyConfig {
    return this.toolConfig;
  }

  async execute(agentContext: AgentContext, args: Record<string, unknown>): Promise<ToolExecutionResult> {
    return this.executeWithPolicy(agentContext, args, async () => {
      const response = await this.invokeOperation(args);
      const text = await this.parseResponse(response);
      return this.createSuccessResponse(text);
    });
  }

  private async invokeOperation(args: Record<string, unknown>): Promise<Response> {
    const url = this.buildUrl(args);
    const headers: Record<string, string> = { ...this.authHeaders };
    const body = this.buildRequestBody(args, headers);

    for (const headerParam of this.operation.parameters.filter((param) => param.in === "header")) {
      const value = args[headerParam.name];
      if (value !== undefined) {
        headers[headerParam.name] = String(value);
      }
    }

    const response = await fetch(url, {
      method: this.operation.method,
      headers,
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${this.operation.method} ${url} failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return response;
  }

  private buildUrl(args: Record<string, unknown>): string {
    let path = this.operation.path;

    for (const pathParam of this.operation.parameters.filter((param) => param.in === "path")) {
      const value = args[pathParam.name];
      if (value === undefined) {
        throw new Error(`Missing required path parameter: ${pathParam.name}`);
      }
      path = path.replace(`{${pathParam.name}}`, encodeURIComponent(String(value)));
    }

    const url = new URL(path, this.operation.baseUrl);

    for (const queryParam of this.operation.parameters.filter((param) => param.in === "query")) {
      const value = args[queryParam.name];
      if (value !== undefined) {
        url.searchParams.set(queryParam.name, String(value));
      }
    }

    return url.toString();
  }

  private buildRequestBody(args: Record<string, unknown>, headers: Record<string, string>): string | undefined {
    if (!this.operation.requestBody) {
      return undefined;
    }

    const bodyArg = args.body;
    if (bodyArg === undefined) {
      return undefined;
    }

    headers["Content-Type"] = headers["Content-Type"] || "application/json";
    return typeof bodyArg === "string" ? bodyArg : JSON.stringify(bodyArg);
  }

  private async parseResponse(response: Response): Promise<string> {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const json = await response.json();
      return JSON.stringify(json, null, 2);
    }

    return response.text();
  }

  private buildAuthHeaders(auth?: OpenApiAuthConfig): Record<string, string> {
    if (!auth) {
      return {};
    }

    const headerName = auth.headerName || "Authorization";

    if (auth.token) {
      return { [headerName]: auth.token };
    }

    if (auth.tokenEnvVar && process.env[auth.tokenEnvVar]) {
      return { [headerName]: process.env[auth.tokenEnvVar]! };
    }

    if (auth.oauthProvider) {
      const envKey = `${auth.oauthProvider.toUpperCase()}_TOKEN`;
      const token = process.env[envKey];
      if (token) {
        return { [headerName]: token.startsWith("Bearer ") ? token : `Bearer ${token}` };
      }
      logger.warn(`[OpenApiToolHandler] No token found in env var ${envKey}`);
    }

    return {};
  }
}
