import { z } from 'zod';

export const principalSchema = z.object({
  user: z.string().describe('UMD Directory ID of the signed-in user, e.g. "jsmith"'),
  attributes: z
    .record(z.string(), z.array(z.string()))
    .describe(
      'Attributes the IdP released about the user, e.g. mail, displayName, eduPersonAffiliation',
    ),
});

export const serviceStatusSchema = z.object({
  name: z.string().describe('Service name, e.g. "testudo"'),
  signed_in: z.boolean().describe('Whether the server holds a live session with the service'),
});

export const servicesSchema = z
  .array(serviceStatusSchema)
  .describe('Single sign-on services other tools depend on, and whether each is signed in');

export const sessionSchema = z.object({
  signed_in: z.boolean().describe('Whether a user is signed in'),
  user: principalSchema.shape.user.nullable().describe('null when nobody is signed in'),
  attributes: principalSchema.shape.attributes.nullable().describe('null when nobody is signed in'),
  services: servicesSchema,
});

export type Principal = z.infer<typeof principalSchema>;
export type ServiceStatus = z.infer<typeof serviceStatusSchema>;
export type Session = z.infer<typeof sessionSchema>;
