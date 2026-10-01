import { Athletics } from './athletics/index.js';
import type { Integration } from './base.js';
import { Calendar } from './calendar/index.js';
import { Dining } from './dining/index.js';
import { Directory } from './directory/index.js';
import { Elms } from './elms/index.js';
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
    new PlanetTerp(),
    new Nutrition(),
    new ScheduleOfClasses(),
    new StudentPortal(),
    new Athletics(),
    new Calendar(),
    new Dining(),
    new Directory(),
    new Elms(),
    new RecWell(),
    new Senate(),
    new TerpLink(),
    new Transportation(),
  ];
}
