import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import { format, isValid, parse } from 'date-fns';
import { htmlToTextOrNull } from '../../../lib/html.js';
import { absoluteUrl, type Selection, tables, text, textOrNull } from '../../../lib/scrape.js';
import { numeric, trimmed } from '../../../lib/text.js';
import { EMPTY_GUID, SITE, siteDate, siteDateTime, toPriceRange, urlParam } from '../common.js';
import {
  type Access,
  type Duration,
  type Invoice,
  type InvoiceSummary,
  type MyMembership,
  type Order,
  type PassCategory,
  type Product,
  type Profile,
} from './schemas.js';

/** A price option on a product summary page, before its dates are fetched. */
export type PriceOption = Pick<Duration, 'price_id' | 'name' | 'billing' | 'price'>;

/** A product summary page: the product's own fields plus its price options. */
export type ProductSummary = {
  name: string;
  description: string | null;
  options: PriceOption[];
};

/** A dollar amount as printed, e.g. "$1,234.50"; null when there is none. */
function dollars(value: string | null | undefined): number | null {
  return toPriceRange(value).price_min;
}

/** A dollar amount the site always prints, defaulting to 0 when unreadable. */
function amount(value: string | null | undefined): number {
  return dollars(value) ?? 0;
}

/** A date as the profile prints it, e.g. "Jan 1, 1990", as YYYY-MM-DD; null when unreadable. */
function profileDate(value: string | null): string | null {
  if (value === null) return null;
  const date = parse(value, 'MMM d, yyyy', new Date(0));
  return isValid(date) ? format(date, 'yyyy-MM-dd') : null;
}

/** "Yes"/"No" as a boolean. */
function yes(value: string): boolean {
  return /^yes$/i.test(value.trim());
}

/** The cells of every body row of the first table under `root`. */
function rows($: CheerioAPI, root: Selection): string[][] {
  return root
    .find('table')
    .first()
    .find('tbody tr')
    .toArray()
    .map((row) =>
      $(row)
        .find('td')
        .toArray()
        .map((cell) => text($(cell))),
    );
}

/** The signed-in member's party id, which every profile request is keyed by. */
export function parsePartyId(html: string): string {
  const $ = cheerio.load(html);
  const id = trimmed($('#profileUserId').attr('value'));
  if (id === null) throw new Error('activeterp-member: the profile page has no party id');
  return id.toLowerCase();
}

/** The profile card (name, ID number, eligibility) and personal information fragments. */
export function parseProfile(cardHtml: string, infoHtml: string): Profile {
  const $card = cheerio.load(cardHtml);
  const facts = new Map(
    $card('.row')
      .toArray()
      .map((row) => {
        const cells = $card(row).find('p');
        return [text(cells.first()).replace(/:$/, '').toLowerCase(), textOrNull(cells.last())];
      }),
  );
  const $ = cheerio.load(infoHtml);
  const values = (label: RegExp) =>
    $('.border-bottom')
      .filter((_, section) =>
        label.test(text($(section).children('.row').first().children().first())),
      )
      .first()
      .find('div[class*="valueSection-"]')
      .toArray()
      .flatMap((value) => textOrNull($(value)) ?? []);
  return {
    name: text($card('.profileCardName').first()),
    id_number: facts.get('id number') ?? null,
    eligibility: facts.get('eligibility') ?? null,
    date_of_birth: profileDate(values(/^date of birth$/i)[0] ?? null),
    gender: values(/^gender$/i)[0] ?? null,
    emails: values(/^email address$/i),
    phones: values(/^phone number$/i),
    addresses: values(/^address$/i),
  };
}

/** The "My Memberships" tab: Membership Type | Start | Expiry | Renew | Payment Info | badge. */
export function parseMyMemberships(html: string): MyMembership[] {
  const $ = cheerio.load(html);
  return rows($, $.root()).flatMap(([name, start, end, renewal, payment, status]) => {
    const startDate = siteDate(start);
    const endDate = siteDate(end);
    if (!name || startDate === null || endDate === null) return [];
    const paymentInfo = trimmed(payment);
    return [
      {
        name,
        start_date: startDate,
        end_date: endDate,
        renewal: renewal ?? '',
        payment_info: paymentInfo === null || /^n\/a$/i.test(paymentInfo) ? null : paymentInfo,
        status: trimmed(status),
      },
    ];
  });
}

/** The "Facility Access" tab: Facility | Computer | Entrance | Exit | Date | Access | Manual | Forgot. */
export function parseAccessHistory(html: string): Access[] {
  const $ = cheerio.load(html);
  return rows($, $.root()).flatMap(
    ([facility, station, entrance, exit, when, access, manual, forgot]) => {
      if (!facility) return [];
      const exitDevice = trimmed(exit);
      return [
        {
          facility,
          station: station ?? '',
          entrance_device: trimmed(entrance),
          exit_device:
            exitDevice === null || /^no exit recorded$/i.test(exitDevice) ? null : exitDevice,
          time: siteDateTime(when),
          access_granted: yes(access ?? ''),
          manual_lookup: yes(manual ?? ''),
          forgot_id: yes(forgot ?? ''),
        },
      ];
    },
  );
}

/** The "Orders" tab: Order # | Date | Computer Name | Subtotal | Adjustment | Total | Voided. */
export function parseOrders(html: string): Order[] {
  const $ = cheerio.load(html);
  return rows($, $.root()).flatMap(
    ([number, date, source, subtotal, adjustment, total, voided]) => {
      const orderDate = siteDate(date);
      if (!number || orderDate === null) return [];
      return [
        {
          number,
          date: orderDate,
          source: source ?? '',
          subtotal: amount(subtotal),
          adjustment: amount(adjustment),
          total: amount(total),
          voided: yes(voided ?? ''),
        },
      ];
    },
  );
}

/** An invoices grid: Invoice # | Date | Total | Paid | Owing | details | print | pay. */
export function parseInvoices(html: string): InvoiceSummary[] {
  const $ = cheerio.load(html);
  return $('table tbody tr')
    .toArray()
    .flatMap((row) => {
      const cells = $(row).find('td');
      const number = textOrNull(cells.eq(0));
      const date = siteDate(text(cells.eq(1)));
      if (number === null || date === null) return [];
      const print = $(row).find('a[download]').attr('href');
      return [
        {
          number,
          id: urlParam(print, 'id'),
          date,
          total: amount(text(cells.eq(2))),
          paid: amount(text(cells.eq(3))),
          owing: amount(text(cells.eq(4))),
          print_url: absoluteUrl(print, SITE),
        },
      ];
    });
}

/** An invoice details fragment: billing block, summary table and any line-item tables. */
export function parseInvoice(html: string, number: string): Invoice {
  const $ = cheerio.load(html);
  const heading = textOrNull($('h2.invoice-detail-heading').first());
  if (heading === null) throw new Error(`activeterp-member: no invoice ${number}`);
  const desktop = $('#invoice-detail > .d-none.d-lg-block').first();
  const block = (label: RegExp) =>
    desktop
      .find('h4')
      .filter((_, h4) => label.test(text($(h4))))
      .first()
      .next('p');
  const summary = new Map(
    desktop
      .find('.invoice-summary-table tr')
      .toArray()
      .map((row) => {
        const cells = $(row).find('td');
        return [text(cells.first()).toLowerCase(), dollars(text(cells.last()))];
      }),
  );
  const details = $('#invoiceDetailsHeading')
    .closest('.row')
    .next('.row')
    .find('.d-none.d-lg-block')
    .first();
  return {
    number: heading.replace(/^invoice\s*#/i, '').trim() || number,
    bill_to: htmlToTextOrNull(block(/^bill to$/i).html()),
    date: siteDate(textOrNull(block(/^invoice date$/i))),
    age_days: numeric(/\d+/.exec(text(block(/^invoice age$/i)))?.[0]),
    subtotal: summary.get('subtotal') ?? null,
    tax: summary.get('tax total') ?? null,
    total: summary.get('invoice total') ?? null,
    paid: summary.get('paid') ?? null,
    outstanding: summary.get('outstanding balance') ?? null,
    details: details.length === 0 ? [] : tables($, details),
    print_url: absoluteUrl($('a[download]').first().attr('href'), SITE),
  };
}

/**
 * A product list (memberships, towel services, multi-visit passes): one list-group item per
 * product, whose click handler names the detail page.
 */
export function parseProducts(html: string, detailPath: (id: string) => string): Product[] {
  const $ = cheerio.load(html);
  return $('a.detailListItem')
    .toArray()
    .flatMap((item) => {
      const id = /^aDetailsList_(.+)$/.exec($(item).attr('id') ?? '')?.[1]?.toLowerCase();
      const name = textOrNull($(item).find('.TitleText-SP').first());
      if (id === undefined || name === null) return [];
      return [
        {
          id,
          name,
          description: textOrNull($(item).find('p.DescText-SP').first()),
          price: dollars(textOrNull($(item).find('.PriceText').first())),
          requirement: textOrNull($(item).find('.validation-summary-errors').first()),
          url: `${SITE}${detailPath(id)}`,
        },
      ];
    });
}

/** The category list beside the multi-visit passes, without its "All Categories" entry. */
export function parsePassCategories(html: string): PassCategory[] {
  const $ = cheerio.load(html);
  return $('#categoryList a[id]')
    .toArray()
    .flatMap((link) => {
      const id = trimmed($(link).attr('id'))?.toLowerCase();
      const name = text($(link).clone().children('.material-icons-round').remove().end());
      return id === undefined || id === EMPTY_GUID || name === '' ? [] : [{ id, name }];
    });
}

/** A membership or towel summary page: title, blurb and the price options (durations). */
export function parseProductSummary(html: string, id: string): ProductSummary {
  const $ = cheerio.load(html);
  const name = textOrNull($('h1 small').first());
  if (name === null) throw new Error(`activeterp-member: no product ${id}`);
  return {
    name,
    description: textOrNull($('.card-body > p').first()),
    options: $('.servicePeriod[data-priceid]')
      .toArray()
      .flatMap((option) => {
        const priceId = trimmed($(option).attr('data-priceid'))?.toLowerCase();
        if (priceId === undefined) return [];
        const label = $(option).find('p[id^="lblRecurrence"]').first();
        const billing = text(label.find('.visually-hidden'));
        label.find('.visually-hidden, .material-icons-round').remove();
        return [
          {
            price_id: priceId,
            name: text(label),
            billing,
            price: dollars(textOrNull($(option).find('p[id^="lblPrice"]').first())),
          },
        ];
      }),
  };
}

/** A service period fragment: the dates (and price) a price option would cover. */
export function parseServicePeriod(
  html: string,
): Pick<Duration, 'start_date' | 'end_date' | 'price'> {
  const $ = cheerio.load(html);
  return {
    start_date: siteDate($('.effectiveDate').attr('val')),
    end_date: siteDate($('.untilDate').attr('val')),
    price: dollars($('.priceCalculated').attr('value')),
  };
}

/** A multi-visit pass details page: name, price, category breadcrumb and description. */
export function parsePass(
  html: string,
  id: string,
): Omit<Product, 'id' | 'url'> & { category: string | null } {
  const $ = cheerio.load(html);
  if ($('#ProductId').attr('value')?.toLowerCase() !== id) {
    throw new Error(`activeterp-member: no multi-visit pass ${id}`);
  }
  const title = $('h1').first().clone();
  const price = textOrNull(title.find('small'));
  title.find('small').remove();
  const name = text(title);
  const crumbs = $('.breadcrumb-item')
    .toArray()
    .map((crumb) => text($(crumb)));
  return {
    name,
    description: textOrNull($('.card-body .text-justify').first()),
    price: dollars(price),
    requirement: textOrNull($('.card-body .validation-summary-errors').first()),
    category: crumbs.length >= 3 ? (crumbs[crumbs.length - 2] ?? null) : null,
  };
}
