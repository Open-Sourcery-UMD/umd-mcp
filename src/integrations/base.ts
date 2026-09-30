import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { connect, type Connection, type ServiceSpec, type Session } from '../lib/auth.js';
import { AuthRequiredError, CasError } from '../lib/errors.js';
import { type Fetcher, getJson, getText, HttpError, type Query, request } from '../lib/http.js';

export type ToolResult = CallToolResult;

/** Any zod raw shape, e.g. `{ course: z.string() }`. */
export type Shape = Record<string, z.ZodType>;

/** Zod shape for a tool's arguments. */
export type InputShape = Shape;

/** Zod shape for the object a tool returns. */
export type OutputShape = Shape;

/** Parsed arguments for a given input shape. */
export type InputOf<S extends Shape> = z.infer<z.ZodObject<S>>;

/** Return value for a given output shape. */
export type OutputOf<S extends Shape> = z.infer<z.ZodObject<S>>;

/**
 * Metadata for one tool, passed to `@tool()`. Everything here is advertised to the client, so
 * the model can see what the tool does, what it takes, and what it returns before calling it.
 */
export type ToolSpec<
  Input extends InputShape = InputShape,
  Output extends OutputShape = OutputShape,
> = {
  /**
   * MCP tool name. Defaults to the integration's name joined to the method's name, e.g.
   * `planetterp_get_course`, so tools from different integrations never collide. Set it to
   * use a bare name such as `login`.
   */
  name?: string;
  /** Human-readable title shown in client UIs. */
  title?: string;
  /** Description the model uses to decide when to call the tool. */
  description: string;
  /**
   * Zod shape for the tool's arguments. Use `.describe()` on each field; the text is sent to
   * the model as part of the input schema.
   */
  input: Input;
  /**
   * Zod shape for the object the tool returns. It is advertised as the tool's `outputSchema`,
   * the method's return value is validated against it, and results carry the value as
   * `structuredContent`. Use `.describe()` on each field so the model knows what it means.
   */
  output?: Output;
  /** Hints about the tool's behaviour, merged over the defaults (read-only, open-world). */
  annotations?: ToolAnnotations;
};

type ToolHandler<Args> = (args: Args) => Promise<ToolResult> | ToolResult;

/**
 * A `@tool()` method collected on construction. The MCP name is resolved on access, because
 * decorator initializers run before the subclass has set its `name` field.
 */
export class RegisteredTool {
  constructor(
    private readonly integration: Integration,
    /** The decorated method's name. */
    readonly method: string,
    readonly spec: ToolSpec,
    readonly handler: ToolHandler<InputOf<InputShape>>,
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
 * Marks an `Integration` method as an MCP tool named `<integration>_<method>` (or `spec.name`).
 * The method receives the parsed arguments described by `spec.input`; the compiler checks that
 * its parameter type accepts them.
 *
 * When `spec.output` is given, the compiler also checks that the method returns a matching
 * object. At runtime the value is validated against the shape, then sent back both as
 * `structuredContent` and as a JSON text block for clients that only read text. Without
 * `spec.output`, the method may return any JSON value (sent as a text block) or a ready-made
 * `ToolResult`, which is passed through untouched.
 *
 * @example
 * @tool({
 *   description: 'Fetch a thing by id',
 *   input: { id: z.string().describe('Thing id') },
 *   output: { name: z.string().describe('Display name') },
 * })
 * async get_thing({ id }: { id: string }): Promise<{ name: string }> { ... }
 */
export function tool<Input extends InputShape, Output extends OutputShape>(
  spec: ToolSpec<Input, Output> & { output: Output },
): ToolDecorator<InputOf<Input>, OutputOf<Output>>;
export function tool<Input extends InputShape>(
  spec: Omit<ToolSpec<Input>, 'output'>,
): ToolDecorator<InputOf<Input>, unknown>;
export function tool(spec: ToolSpec): ToolDecorator<InputOf<InputShape>, unknown> {
  const outputSchema = spec.output === undefined ? undefined : z.object(spec.output);

  return function <This extends Integration>(
    method: ToolMethod<This, InputOf<InputShape>, unknown>,
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
 * `register()` wires every decorated method into the server.
 *
 * An upstream behind UMD single sign-on also declares `service`. The integration is then
 * connected to the auth hub: `login` establishes a session with the app, and `this.get()` /
 * `this.getText()` / `this.session.fetch()` carry its cookies. Until the user signs in they
 * throw `AuthRequiredError`, which `handleError()` turns into a tool error asking for `login`.
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
  /**
   * The single sign-on protected app this integration talks to, if any. Declaring it makes
   * `login` establish a session with the app and routes this integration's requests through it.
   */
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

  /** `fetch` for this integration: the service session's when there is one, plain otherwise. */
  protected get fetcher(): Fetcher {
    return this.connection === undefined ? (input, init) => fetch(input, init) : this.session.fetch;
  }

  /** GET `path` relative to this integration's base URL and parse the JSON body. */
  protected get<T = unknown>(path: string, query?: Query): Promise<T> {
    return getJson<T>(this.baseUrl, path, query, this.fetcher);
  }

  /** GET `path` relative to this integration's base URL and return the body as text (e.g. HTML). */
  protected getText(path: string, query?: Query): Promise<string> {
    return getText(this.baseUrl, path, query, this.fetcher);
  }

  /**
   * Fetches `path` relative to this integration's base URL with any method, body or headers,
   * through the service session when there is one. Throws `HttpError` on a non-2xx status.
   */
  protected request(path: string, query?: Query, init?: RequestInit): Promise<Response> {
    return request(this.baseUrl, path, query, init, this.fetcher);
  }

  /**
   * Registers every `@tool()` method with the server, and connects `service` to the auth hub
   * so the next `login` signs in to it.
   */
  register(server: McpServer): void {
    void this.connection;
    for (const { name, spec, handler } of this.tools) {
      server.registerTool(
        name,
        {
          description: spec.description,
          inputSchema: spec.input,
          ...(spec.output !== undefined && { outputSchema: spec.output }),
          ...(spec.title !== undefined && { title: spec.title }),
          ...(spec.annotations !== undefined && { annotations: spec.annotations }),
        },
        async (args: InputOf<InputShape>) => {
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
   * Converts thrown errors into tool error results. Override to customise; the default maps
   * auth, HTTP and output-schema errors to a readable message and rethrows anything else.
   */
  protected handleError(tool: string, error: unknown): ToolResult {
    if (error instanceof AuthRequiredError || error instanceof CasError) {
      return errorResult(`${this.name}: ${tool} failed: ${error.message}`);
    }
    if (error instanceof HttpError) {
      const detail = error.status === 404 ? 'not found' : `HTTP ${error.status}`;
      return errorResult(`${this.name}: ${tool} failed (${detail})`);
    }
    if (error instanceof z.ZodError) {
      return errorResult(
        `${this.name}: ${tool} returned data that does not match its output schema\n${z.prettifyError(error)}`,
      );
    }
    throw error;
  }
}
