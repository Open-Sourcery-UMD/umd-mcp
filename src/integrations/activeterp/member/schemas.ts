import { z } from 'zod';
import { isoDate, tableSchema } from '../../../common.js';
import { guid } from '../common.js';

export const membershipProductId = guid.describe('Membership product id');

export const towelServiceId = guid.describe('Towel service id');

export const passId = guid.describe('Multi-visit pass id');

export const invoiceNumber = z
  .string()
  .trim()
  .regex(/^I-\d+$/i, 'Expected an invoice number like I-414539')
  .toUpperCase()
  .describe('Invoice number, e.g. "I-414539"');

const localDateTime = z
  .string()
  .describe('ISO 8601 in College Park local time, without an offset, e.g. "2026-09-15T16:36:00"');

const dollars = (what: string) => z.number().describe(`${what} in dollars`);

export const profileSchema = z.object({
  name: z.string().describe('Full name'),
  id_number: z.string().nullable().describe('University ID number; null when not on file'),
  eligibility: z.string().nullable().describe('Membership eligibility, e.g. "Student"'),
  date_of_birth: isoDate.nullable().describe('Date of birth as YYYY-MM-DD; null when not on file'),
  gender: z.string().nullable().describe('null when not on file'),
  emails: z.array(z.string()).describe('Email addresses on file'),
  phones: z.array(z.string()).describe('Phone numbers on file'),
  addresses: z.array(z.string()).describe('Postal addresses on file, one line each'),
});

export const myMembershipSchema = z.object({
  name: z.string().describe('e.g. "Bouldering Zone Membership"'),
  start_date: isoDate,
  end_date: isoDate.describe('Expiry date as YYYY-MM-DD'),
  renewal: z.string().describe('Renewal terms, e.g. "Not Renewable"'),
  payment_info: z
    .string()
    .nullable()
    .describe('Saved payment card for a recurring membership; null when none'),
  status: z
    .string()
    .nullable()
    .describe('"Refunded" or "Cancelled"; null while the membership stands'),
});

export const accessSchema = z.object({
  facility: z.string().describe('e.g. "Eppley Recreation Center"'),
  station: z.string().describe('Check-in computer, e.g. "Info Desk Left"'),
  entrance_device: z.string().nullable().describe('Device that recorded the entry; null when none'),
  exit_device: z
    .string()
    .nullable()
    .describe('Device that recorded the exit; null when no exit was recorded'),
  time: localDateTime.nullable().describe('When access was recorded; null when unreadable'),
  access_granted: z.boolean().describe('false when the visit was denied'),
  manual_lookup: z.boolean().describe('true when staff looked the member up by hand'),
  forgot_id: z.boolean().describe('true when the member came without their ID'),
});

export const orderSchema = z.object({
  number: z.string().describe('Order number, e.g. "O-585816"'),
  date: isoDate,
  source: z
    .string()
    .describe('Where the order was placed, e.g. "Web Order" or a front-desk computer'),
  subtotal: dollars('Subtotal'),
  adjustment: dollars('Discounts and other adjustments'),
  total: dollars('Order total'),
  voided: z.boolean(),
});

export const invoiceSummarySchema = z.object({
  number: z.string().describe('Invoice number, e.g. "I-414539"'),
  id: z
    .string()
    .nullable()
    .describe('Invoice id, as its print link carries it; null when the link is missing'),
  date: isoDate,
  total: dollars('Invoice total'),
  paid: dollars('Amount paid'),
  owing: dollars('Amount outstanding'),
  print_url: z.string().nullable().describe('PDF of the invoice; null when not offered'),
});

export const invoiceSchema = z.object({
  number: z.string().describe('Invoice number, e.g. "I-414539"'),
  bill_to: z.string().nullable().describe('Billing name and address as plain text'),
  date: isoDate.nullable(),
  age_days: z.number().int().nullable().describe('Days since the invoice date'),
  subtotal: dollars('Subtotal').nullable(),
  tax: dollars('Tax').nullable(),
  total: dollars('Invoice total').nullable(),
  paid: dollars('Amount paid').nullable(),
  outstanding: dollars('Outstanding balance').nullable(),
  details: z
    .array(tableSchema)
    .describe('Line-item tables under "Invoice Details"; empty when there are none'),
  print_url: z.string().nullable().describe('PDF of the invoice; null when not offered'),
});

export const productSchema = z.object({
  id: z.string().describe('Product id'),
  name: z.string().describe('e.g. "Group Fitness Membership"'),
  description: z.string().nullable().describe('Blurb; null when none'),
  price: z
    .number()
    .nullable()
    .describe(
      'Price in dollars; null when the list prints none (memberships and towel services are priced per term by their get tools)',
    ),
  requirement: z
    .string()
    .nullable()
    .describe(
      'Why the product cannot be bought right now, e.g. "Active Membership Required"; null otherwise',
    ),
  url: z.string().describe('Product page'),
});

export const durationSchema = z.object({
  price_id: z.string().describe('Price option id'),
  name: z.string().describe('e.g. "Fall Semester- Membership" or "1 Day"'),
  billing: z.string().describe('e.g. "One Time Charge"'),
  price: z.number().nullable().describe('Upfront price in dollars; null when the site prints none'),
  start_date: isoDate
    .nullable()
    .describe(
      'First day the option would cover as YYYY-MM-DD; null when the buyer picks the start',
    ),
  end_date: isoDate
    .nullable()
    .describe('Last day as YYYY-MM-DD; null when it depends on the start'),
});

export const productDetailSchema = productSchema.extend({
  durations: z.array(durationSchema).describe('Purchasable terms in the order the site lists them'),
});

export const passCategorySchema = z.object({
  id: z.string().describe('Category id'),
  name: z.string().describe('e.g. "Personal Training Passes"'),
});

export const passListSchema = z.object({
  categories: z
    .array(passCategorySchema)
    .describe('Pass categories in the order the site lists them'),
  passes: z.array(productSchema).describe('Passes in the order the site lists them'),
});

export const passSchema = productSchema.extend({
  category: z
    .string()
    .nullable()
    .describe('Category name from the page breadcrumb; null when none'),
});

export type Profile = z.infer<typeof profileSchema>;
export type MyMembership = z.infer<typeof myMembershipSchema>;
export type Access = z.infer<typeof accessSchema>;
export type Order = z.infer<typeof orderSchema>;
export type InvoiceSummary = z.infer<typeof invoiceSummarySchema>;
export type Invoice = z.infer<typeof invoiceSchema>;
export type Product = z.infer<typeof productSchema>;
export type Duration = z.infer<typeof durationSchema>;
export type ProductDetail = z.infer<typeof productDetailSchema>;
export type PassCategory = z.infer<typeof passCategorySchema>;
export type PassList = z.infer<typeof passListSchema>;
export type Pass = z.infer<typeof passSchema>;
