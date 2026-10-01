import { z } from 'zod';
import { HttpError, type Query } from '../../../lib/http.js';
import { perSession } from '../../../lib/session.js';
import { Integration, tool } from '../../base.js';
import { SITE } from '../common.js';
import {
  parseAccessHistory,
  parseInvoice,
  parseInvoices,
  parseMyMemberships,
  parseOrders,
  parsePartyId,
  parsePass,
  parsePassCategories,
  parseProducts,
  parseProductSummary,
  parseProfile,
  parseServicePeriod,
} from './parsers.js';
import {
  type Access,
  accessSchema,
  type Invoice,
  invoiceNumber,
  invoiceSchema,
  type InvoiceSummary,
  invoiceSummarySchema,
  membershipProductId,
  type MyMembership,
  myMembershipSchema,
  type Order,
  orderSchema,
  type Pass,
  passId,
  type PassList,
  passListSchema,
  passSchema,
  type Product,
  type ProductDetail,
  productDetailSchema,
  productSchema,
  type Profile,
  profileSchema,
  towelServiceId,
} from './schemas.js';

/**
 * The site serves these fragments only to requests its own scripts make; anything else is
 * answered with the full page or a redirect to the profile.
 */
const AJAX = { accept: 'text/html', 'x-requested-with': 'XMLHttpRequest' };

/** Where each product family's list and summary pages live. */
const MEMBERSHIPS = {
  list: 'Membership/Index',
  summary: 'Membership/GetMembershipSummary',
  summaryParam: 'membershipProductId',
  period: 'Membership/GetServiceBasePeriodType',
  periodParam: 'membershipId',
} as const;

const TOWELS = {
  list: 'Towel',
  summary: 'Towel/GetTowelTypeSummary',
  summaryParam: 'towelTypeId',
  period: 'Towel/GetServiceBasePeriodType',
  periodParam: 'towelId',
} as const;

type ProductFamily = typeof MEMBERSHIPS | typeof TOWELS;

/**
 * The signed-in side of activeterp.umd.edu (InnoSoft Fusion): the member's profile, memberships,
 * facility access history, orders and invoices, and the product catalogues the site only shows
 * after sign-in. Program registration and purchases are left to the site itself.
 */
export class ActiveTerpMember extends Integration {
  readonly name = 'activeterp-member';
  readonly baseUrl = SITE;
  /**
   * The sign-in page's "log in with UMD credentials" button submits a form carrying the page's
   * anti-forgery token to Shibboleth, hence `loginClick`. Expired sessions bounce to the same
   * sign-in page.
   */
  override readonly service = {
    name: 'activeterp',
    loginUrl: `${SITE}/account/signin?returnUrl=%2f`,
    loginClick: 'button.btn-sso-shibboleth',
    signedIn: (url: URL) =>
      url.origin === SITE && !/^\/(account\/|signin-shib)/i.test(url.pathname),
    signInPage: (url: URL) => /^\/account\/(signin|login)$/i.test(url.pathname),
  };

  /** The signed-in member's party id, read from the profile page once per session. */
  private readonly partyId = perSession(async () => parsePartyId(await this.fragment('profile')));

  /** GETs a page or fragment as the site's own scripts would. */
  private async fragment(path: string, query?: Query): Promise<string> {
    return this.getText(path, query, { headers: AJAX });
  }

  /** POSTs a profile fragment request keyed by the member's party id. */
  private async profileFragment(path: string): Promise<string> {
    const partyId = await this.partyId(this.session);
    const res = await this.postForm(path, { partyId }, { headers: AJAX });
    return res.text();
  }

  /** One of the invoice grids: the unpaid one, or all invoices. */
  private async invoices(all: boolean): Promise<InvoiceSummary[]> {
    return parseInvoices(
      await this.fragment('Invoice/InvoicesGrid', {
        partyId: await this.partyId(this.session),
        totalRows: all ? 1 : 0,
        all,
      }),
    );
  }

  /** A product list page, with each product's summary page as its URL. */
  private async products(family: ProductFamily): Promise<Product[]> {
    return parseProducts(
      await this.fragment(family.list),
      (id) => `/${family.summary}?${family.summaryParam}=${id}`,
    );
  }

  /** A product summary page with the dates each price option covers. */
  private async product(family: ProductFamily, id: string): Promise<ProductDetail> {
    const summary = parseProductSummary(
      await this.fragment(family.summary, { [family.summaryParam]: id }),
      id,
    );
    const durations = await Promise.all(
      summary.options.map(async (option) => {
        const period = parseServicePeriod(
          await this.fragment(family.period, {
            [family.periodParam]: id,
            priceId: option.price_id,
          }),
        );
        return { ...option, ...period, price: period.price ?? option.price };
      }),
    );
    return {
      id,
      name: summary.name,
      description: summary.description,
      price: durations[0]?.price ?? null,
      requirement: null,
      url: `${SITE}/${family.summary}?${family.summaryParam}=${id}`,
      durations,
    };
  }

  @tool({
    title: 'Get my profile',
    description:
      "The signed-in member's activeterp.umd.edu profile: name, University ID number, eligibility, date of birth, gender and the email addresses, phone numbers and postal addresses on file. Requires login.",
    input: {},
    output: profileSchema.shape,
  })
  async get_profile(): Promise<Profile> {
    const [card, info] = await Promise.all([
      this.profileFragment('CustomerProfile/GetProfileCardForUser'),
      this.profileFragment('CustomerProfile/GetPersonalInformationForProfile'),
    ]);
    return parseProfile(card, info);
  }

  @tool({
    title: 'List my memberships',
    description:
      "The signed-in member's RecWell memberships on activeterp.umd.edu, current and past: type, start and expiry dates, renewal terms and whether one was refunded or cancelled. Requires login.",
    input: {},
    output: {
      memberships: z
        .array(myMembershipSchema)
        .describe('Memberships in the order the site lists them'),
    },
  })
  async list_my_memberships(): Promise<{ memberships: MyMembership[] }> {
    return { memberships: parseMyMemberships(await this.profileFragment('Profile/memberships')) };
  }

  @tool({
    title: 'Get my access history',
    description:
      "The signed-in member's facility check-ins on activeterp.umd.edu: facility, check-in station, entrance and exit devices, time, and whether access was granted. Requires login.",
    input: {},
    output: { visits: z.array(accessSchema).describe('Visits, newest first') },
  })
  async get_access_history(): Promise<{ visits: Access[] }> {
    return { visits: parseAccessHistory(await this.profileFragment('Profile/facilityaccess')) };
  }

  @tool({
    title: 'List my orders',
    description:
      "The signed-in member's orders on activeterp.umd.edu: order number, date, where it was placed, totals and whether it was voided. Requires login.",
    input: {},
    output: { orders: z.array(orderSchema).describe('Orders in the order the site lists them') },
  })
  async list_my_orders(): Promise<{ orders: Order[] }> {
    return { orders: parseOrders(await this.profileFragment('Profile/orders')) };
  }

  @tool({
    title: 'List my invoices',
    description:
      "The signed-in member's invoices on activeterp.umd.edu, all of them or only the unpaid ones: number, date, total, paid and owing amounts and a PDF link. Call activeterp_member_get_invoice for the line items. Requires login.",
    input: {
      unpaid_only: z
        .boolean()
        .default(false)
        .describe('Only invoices with a balance owing (default: all)'),
    },
    output: {
      invoices: z.array(invoiceSummarySchema).describe('Invoices in the order the site lists them'),
    },
  })
  async list_my_invoices({
    unpaid_only,
  }: {
    unpaid_only: boolean;
  }): Promise<{ invoices: InvoiceSummary[] }> {
    return { invoices: await this.invoices(!unpaid_only) };
  }

  @tool({
    title: 'Get an invoice',
    description:
      "One of the signed-in member's activeterp.umd.edu invoices: billing details, subtotal, tax, total, amount paid, outstanding balance and the line items. Requires login.",
    input: { number: invoiceNumber },
    output: invoiceSchema.shape,
  })
  async get_invoice({ number }: { number: string }): Promise<Invoice> {
    let html: string;
    try {
      html = await this.fragment('Invoice/InvoiceDetails', { invoiceNumber: number });
    } catch (error) {
      // The site answers an unknown invoice number with a server error.
      if (error instanceof HttpError && error.status === 500) {
        throw new Error(`${this.name}: no invoice ${number}`, { cause: error });
      }
      throw error;
    }
    return parseInvoice(html, number);
  }

  @tool({
    title: 'List memberships',
    description:
      'Memberships RecWell sells on activeterp.umd.edu (day passes, the free Group Fitness and Bouldering Zone memberships) with their blurb. Call activeterp_member_get_membership for terms and prices. Requires login.',
    input: {},
    output: {
      memberships: z.array(productSchema).describe('Memberships in the order the site lists them'),
    },
  })
  async list_memberships(): Promise<{ memberships: Product[] }> {
    return { memberships: await this.products(MEMBERSHIPS) };
  }

  @tool({
    title: 'Get a membership',
    description:
      'One membership RecWell sells on activeterp.umd.edu with each purchasable term: name, billing, upfront price and the dates it would cover for the signed-in member. Requires login.',
    input: { membership_id: membershipProductId },
    output: productDetailSchema.shape,
  })
  async get_membership({ membership_id }: { membership_id: string }): Promise<ProductDetail> {
    return this.product(MEMBERSHIPS, membership_id);
  }

  @tool({
    title: 'List towel services',
    description:
      'Towel services RecWell sells on activeterp.umd.edu (semester and annual). Call activeterp_member_get_towel_service for terms and prices. Requires login.',
    input: {},
    output: {
      towel_services: z.array(productSchema).describe('Services in the order the site lists them'),
    },
  })
  async list_towel_services(): Promise<{ towel_services: Product[] }> {
    return { towel_services: await this.products(TOWELS) };
  }

  @tool({
    title: 'Get a towel service',
    description:
      'One towel service on activeterp.umd.edu with each purchasable term: name, billing, upfront price and the dates it would cover for the signed-in member. Requires login.',
    input: { towel_service_id: towelServiceId },
    output: productDetailSchema.shape,
  })
  async get_towel_service({
    towel_service_id,
  }: {
    towel_service_id: string;
  }): Promise<ProductDetail> {
    return this.product(TOWELS, towel_service_id);
  }

  @tool({
    title: 'List multi-visit passes',
    description:
      'Multi-visit passes RecWell sells on activeterp.umd.edu (personal training session packages, member visit passes) with their category list, price and any purchase requirement. Requires login.',
    input: {},
    output: passListSchema.shape,
  })
  async list_multi_visit_passes(): Promise<PassList> {
    const html = await this.fragment('MultiVisitPass/GetProducts');
    return {
      categories: parsePassCategories(html),
      passes: parseProducts(html, (id) => `/MultiVisitPass/GetMultiVisitPassDetails?pass=${id}`),
    };
  }

  @tool({
    title: 'Get a multi-visit pass',
    description:
      'One multi-visit pass on activeterp.umd.edu: category, price, full description and any purchase requirement. Requires login.',
    input: { pass_id: passId },
    output: passSchema.shape,
  })
  async get_multi_visit_pass({ pass_id }: { pass_id: string }): Promise<Pass> {
    const page = await this.fragment('MultiVisitPass/GetMultiVisitPassDetails', { pass: pass_id });
    return {
      id: pass_id,
      ...parsePass(page, pass_id),
      url: `${SITE}/MultiVisitPass/GetMultiVisitPassDetails?pass=${pass_id}`,
    };
  }
}
