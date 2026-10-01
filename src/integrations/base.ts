import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { connect, type Connection, type ServiceSpec, type Session } from '../lib/auth.js';
import { AuthRequiredError, CasError } from '../lib/errors.js';
import {
  type Fetcher,
  getJson,
  getText,
  HttpError,
  plainFetch,
  type Query,
  request,
} from '../lib/http.js';

export type ToolResult = CallToolResult;

/** A zod raw shape, e.g. `{ course: z.string() }`, as a tool's input or output is declared. */
export type Shape = Record<string, z.ZodType>;

/** Parsed arguments for a given input shape. */
export type InputOf<S extends Shape> = z.infer<z.ZodObject<S>>;

/** Return value for a given output shape. */
export type OutputOf<S extends Shape> = z.infer<z.ZodObject<S>>;

/** Metadata for one tool, passed to `@tool()`. Everything here is advertised to the client. */
export type ToolSpec<Input extends Shape = Shape, Output extends Shape = Shape> = {
  /** MCP tool name. Defaults to `<integration>_<method>`, e.g. `planetterp_get_course`. */
  name?: string;
  /** Human-readable title shown in client UIs. */
  title?: string;
  /** Description the model uses to decide when to call the tool. */
  description: string;
  /** Zod shape for the tool's arguments. `.describe()` each field; the model reads the text. */
  input: Input;
  /**
   * Zod shape for what the tool returns. Advertised as `outputSchema`, enforced on the return
   * value, and sent back as `structuredContent`. `.describe()` each field here too.
   */
  output?: Output;
  /** Hints about the tool's behaviour, merged over the defaults (read-only, open-world). */
  annotations?: ToolAnnotations;
};

type ToolHandler<Args> = (args: Args) => Promise<ToolResult> | ToolResult;

/**
 * A `@tool()` method collected on construction. The MCP name is resolved lazily because
 * decorator initializers run before the subclass has set `name`.
 */
export class RegisteredTool {
  constructor(
    private readonly integration: Integration,
    /** The decorated method's name. */
    readonly method: string,
    readonly spec: ToolSpec & { annotations: ToolAnnotations },
    readonly handler: ToolHandler<InputOf<Shape>>,
  ) {}

  /** The MCP tool name: `spec.name`, or `<integration>_<method>`. */
  get name(): string {
    return this.spec.name ?? `${this.integration.name.replaceAll('-', '_')}_${this.method}`;
  }
}

type ToolMethod<This, Args, Result> = (this: This, args: Args) => Promise<Result>;

type ToolDecorator<Args, Result> = <This extends Integration>(
  method: ToolMethod<This, Args, Result>,
  context: ClassMethodDecoratorContext<This>,
) => void;

/**
 * Marks an `Integration` method as an MCP tool. The method receives the arguments `spec.input`
 * describes, and the compiler checks its parameter and return types against the spec.
 *
 * With `spec.output`, the return value is validated and sent as `structuredContent` plus a JSON
 * text block for clients that only read text. Without it, the method may return any JSON value
 * or a ready-made `ToolResult`, which is passed through untouched. See `Integration` for an
 * example.
 */
export function tool<Input extends Shape, Output extends Shape>(
  spec: ToolSpec<Input, Output> & { output: Output },
): ToolDecorator<InputOf<Input>, OutputOf<Output>>;
export function tool<Input extends Shape>(
  spec: Omit<ToolSpec<Input>, 'output'>,
): ToolDecorator<InputOf<Input>, unknown>;
export function tool(spec: ToolSpec): ToolDecorator<InputOf<Shape>, unknown> {
  const outputSchema = spec.output === undefined ? undefined : z.object(spec.output);

  return function <This extends Integration>(
    method: ToolMethod<This, InputOf<Shape>, unknown>,
    context: ClassMethodDecoratorContext<This>,
  ): void {
    context.addInitializer(function () {
      this.tools.push(
        new RegisteredTool(
          this,
          String(context.name),
          {
            ...spec,
            annotations: { readOnlyHint: true, openWorldHint: true, ...spec.annotations },
          },
          async (args) => {
            const value = await method.call(this, args);
            if (outputSchema === undefined) return isToolResult(value) ? value : jsonResult(value);

            const structured = outputSchema.parse(value);
            return { ...jsonResult(structured), structuredContent: structured };
          },
        ),
      );
    });
  };
}

function isToolResult(value: unknown): value is ToolResult {
  return (
    typeof value === 'object' && value !== null && Array.isArray((value as ToolResult).content)
  );
}

/** Wraps a JSON-serialisable value as a text tool result. */
export function jsonResult(value: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

/** Wraps a plain string as a text tool result. */
export function textResult(text: string): ToolResult {
  return { content: [{ type: 'text', text }] };
}

/** Produces an error tool result. The model sees the message and can react to it. */
export function errorResult(message: string): ToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

/**
 * Base class for an upstream data source. A subclass declares `name` and `baseUrl`, marks
 * each tool method with `@tool()`, and uses `this.get()` to talk to its API.
 *
 * An upstream behind UMD single sign-on also declares `service`. `login` then establishes a
 * session with it, and requests through `this` carry its cookies. Before the user signs in
 * they throw `AuthRequiredError`, which becomes a tool error asking for `login`.
 *
 * @example
 * class Example extends Integration {
 *   readonly name = 'example';
 *   readonly baseUrl = 'https://example.com/api';
 *
 *   @tool({
 *     description: 'Fetch a thing by id',
 *     input: { id: z.string().describe('Thing id') },
 *     output: { name: z.string().describe('Display name') },
 *   })
 *   async get_thing({ id }: { id: string }) {
 *     return this.get<{ name: string }>(`things/${id}`);
 *   }
 * }
 */
export abstract class Integration {
  /** Short identifier, used in log and error messages. */
  abstract readonly name: string;
  /** Root of the upstream API, without a trailing slash. */
  abstract readonly baseUrl: string;
  /** The single sign-on protected app this integration talks to, if any. */
  readonly service?: ServiceSpec;
  /** Tools contributed by this integration, collected from `@tool()` methods on construction. */
  readonly tools: RegisteredTool[] = [];

  /** The auth connection for `service`; `undefined` for integrations without one. */
  protected get connection(): Connection | undefined {
    return this.service === undefined ? undefined : connect(this.service);
  }

  /**
   * The signed-in session with `service`. Throws `AuthRequiredError` when the integration has
   * no `service`, the user has not signed in, or the session has expired.
   */
  protected get session(): Session {
    const connection = this.connection;
    if (connection === undefined) {
      throw new AuthRequiredError(`${this.name} does not declare a service to sign in to.`);
    }
    return connection.require();
  }

  /**
   * `fetch` for this integration: the service session's when there is one, plain otherwise.
   * Override for an anonymous flow that still needs cookies (see `cookieFetcher`).
   */
  protected get fetcher(): Fetcher {
    return this.connection === undefined ? plainFetch : this.session.fetch;
  }

  /** GET `path` relative to this integration's base URL and parse the JSON body. */
  protected async get<T = unknown>(path: string, query?: Query, init?: RequestInit): Promise<T> {
    return getJson<T>(this.baseUrl, path, query, this.fetcher, init);
  }

  /** GET `path` relative to this integration's base URL and return the body as text (e.g. HTML). */
  protected async getText(path: string, query?: Query, init?: RequestInit): Promise<string> {
    return getText(this.baseUrl, path, query, this.fetcher, init);
  }

  /**
   * Fetches `path` relative to this integration's base URL with any method, body or headers,
   * through the service session when there is one. Throws `HttpError` on a non-2xx status.
   */
  protected async request(path: string, query?: Query, init?: RequestInit): Promise<Response> {
    return request(this.baseUrl, path, query, init, this.fetcher);
  }

  /** POSTs `fields` to `path` as a form, the way the site's own forms submit. */
  protected async postForm(
    path: string,
    fields: Record<string, string> | URLSearchParams,
    init: RequestInit = {},
  ): Promise<Response> {
    return this.request(path, {}, { method: 'POST', ...init, body: new URLSearchParams(fields) });
  }

  /**
   * POSTs `body` to `path` as JSON, the way the site's own scripts call its API; `init.method`
   * may make it a PUT or PATCH instead.
   */
  protected async postJson(path: string, body: unknown, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('content-type', 'application/json; charset=utf-8');
    return this.request(path, {}, { method: 'POST', ...init, headers, body: JSON.stringify(body) });
  }

  /** Registers every `@tool()` method with the server, and `service` with `login`. */
  register(server: McpServer): void {
    if (this.service !== undefined) connect(this.service);
    for (const { name, spec, handler } of this.tools) {
      server.registerTool(
        name,
        {
          description: spec.description,
          inputSchema: spec.input,
          ...(spec.output !== undefined && { outputSchema: spec.output }),
          ...(spec.title !== undefined && { title: spec.title }),
          annotations: spec.annotations,
        },
        async (args: InputOf<Shape>) => {
          try {
            return await handler(args);
          } catch (error) {
            return this.handleError(name, error);
          }
        },
      );
    }
  }

  /**
   * Converts thrown errors into tool error results: auth, HTTP and output-schema errors get a
   * readable message, anything else is rethrown. Override to customise.
   */
  protected handleError(tool: string, error: unknown): ToolResult {
    if (error instanceof AuthRequiredError || error instanceof CasError) {
      return errorResult(`${this.name}: ${tool} failed: ${error.message}`);
    }
    if (error instanceof HttpError) {
      const status = error.status === 404 ? 'not found' : `HTTP ${error.status}`;
      const reason = error.detail;
      return errorResult(
        `${this.name}: ${tool} failed (${status})${reason === null ? '' : `: ${reason}`}`,
      );
    }
    if (error instanceof z.ZodError) {
      return errorResult(
        `${this.name}: ${tool} returned data that does not match its output schema\n${z.prettifyError(error)}`,
      );
    }
    throw error;
  }
}
