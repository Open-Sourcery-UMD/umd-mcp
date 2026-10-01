import { getPrincipal, login, logout, requirePrincipal, serviceStatus } from '../../lib/auth.js';
import { Integration, textResult, tool, type ToolResult } from '../base.js';
import {
  type Principal,
  principalSchema,
  type ServiceStatus,
  servicesSchema,
  type Session,
  sessionSchema,
} from './schemas.js';

/** The connected services and whether each holds a live session, as the tools report them. */
function services(): ServiceStatus[] {
  return serviceStatus().map(({ name, signedIn }) => ({ name, signed_in: signedIn }));
}

/**
 * Sign-in to UMD via the Shibboleth IdP (CAS). Other integrations declare a `service`, and
 * `login` signs in to all of them at once.
 */
export class Shibboleth extends Integration {
  readonly name = 'shibboleth';
  readonly baseUrl = 'https://shib.idm.umd.edu/shibboleth-idp/profile/cas';

  @tool({
    name: 'login',
    title: 'Sign in to UMD',
    description:
      'Sign in with a UMD Directory ID. Opens a dedicated browser window (Chrome or Edge) at the UMD login page and waits up to 5 minutes per step for the user to finish: once for the UMD login including Duo, then once for each service other tools need (e.g. Testudo), which the same sign-in establishes sessions with; the window closes by itself afterwards. Some services force re-authentication, so expect a prompt even if the user signed in recently. Call this when another tool reports that sign-in is required or a session has expired. Tools whose description ends "Requires login." need this first; those ending "No login needed." do not.',
    input: {},
    output: { ...principalSchema.shape, services: servicesSchema },
  })
  async login(): Promise<Principal & { services: ServiceStatus[] }> {
    await login();
    return { ...requirePrincipal(), services: services() };
  }

  @tool({
    name: 'logout',
    title: 'Sign out of UMD',
    description:
      'Forget the signed-in user and every service session, and clear the sign-in browser so the next login prompts again. No login needed.',
    input: {},
  })
  async logout(): Promise<ToolResult> {
    await logout();
    return textResult('Signed out of UMD and every connected service.');
  }

  @tool({
    name: 'whoami',
    title: 'Who am I',
    description:
      'Report the currently signed-in UMD user, or that nobody is signed in, and which services have a live session. No login needed.',
    input: {},
    output: sessionSchema.shape,
  })
  whoami(): Promise<Session> {
    const current = getPrincipal();
    return Promise.resolve({
      signed_in: current !== undefined,
      user: current?.user ?? null,
      attributes: current?.attributes ?? null,
      services: services(),
    });
  }
}
