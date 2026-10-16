import { ActiveTerp } from './activeterp/catalog/index.js';
import { ActiveTerpMember } from './activeterp/member/index.js';
import { Athletics } from './athletics/index.js';
import type { Integration } from './base.js';
import { Calendar } from './calendar/index.js';
import { Clarice } from './clarice/site/index.js';
import { ClariceTickets } from './clarice/tickets/index.js';
import { Dining } from './dining/index.js';
import { Directory } from './directory/index.js';
import { Elms } from './elms/index.js';
import { Go } from './go/index.js';
import { IMLeagues } from './imleagues/catalog/index.js';
import { IMLeaguesMember } from './imleagues/member/index.js';
import { Jupiterp } from './jupiterp/index.js';
import { Maps } from './maps/index.js';
import { Nutrition } from './nutrition/index.js';
import { PlanetTerp } from './planetterp/index.js';
import { RecWell } from './recwell/index.js';
import { Senate } from './senate/index.js';
import { Shibboleth } from './shibboleth/index.js';
import { TerpLink } from './terplink/index.js';
import { StudentPortal } from './testudo/portal/index.js';
import { ScheduleOfClasses } from './testudo/soc/index.js';
import { Transportation } from './transportation/index.js';

/** Instantiates every integration. */
export function createIntegrations(): Integration[] {
  return [
    new Shibboleth(),
    new ActiveTerp(),
    new ActiveTerpMember(),
    new Athletics(),
    new Calendar(),
    new Clarice(),
    new ClariceTickets(),
    new Dining(),
    new Directory(),
    new Elms(),
    new Go(),
    new IMLeagues(),
    new IMLeaguesMember(),
    new Jupiterp(),
    new Maps(),
    new Nutrition(),
    new PlanetTerp(),
    new RecWell(),
    new Senate(),
    new TerpLink(),
    new ScheduleOfClasses(),
    new StudentPortal(),
    new Transportation(),
  ];
}
