import { decode } from '../../common.js';
import { htmlToTextOrNull } from '../../lib/html.js';
import { joinWords, lines, trimmed } from '../../lib/text.js';
import {
  type Article,
  type ArticleSummary,
  type BenefitCode,
  type Category,
  EVENT_BENEFITS,
  type Event,
  type EventSummary,
  type EventTheme,
  IMAGE_ROOT,
  type Organization,
  type OrganizationSummary,
  type ServiceOpportunity,
  SITE,
} from './schemas.js';

/** An Azure Search page: `/search/organizations`, `/search/serviceopportunities`, `/event/search`. */
export type SearchPage<T> = { '@odata.count': number; value: T[] };

/** A plain REST page: `/organization/category`, `/category`, `/article/search`. */
export type Page<T> = { items: T[]; totalItems: number };

export type RawCategory = { id: number; name: string };

export type RawOrganizationSearch = {
  Id: string;
  Name: string;
  ShortName: string | null;
  WebsiteKey: string;
  ProfilePicture: string | null;
  Description: string | null;
  Summary: string | null;
  CategoryIds: string[];
  CategoryNames: string[];
  Status: string;
};

export type RawOrganization = {
  id: number;
  name: string;
  shortName: string | null;
  websiteKey: string;
  email: string | null;
  description: string | null;
  summary: string | null;
  status: string;
  startDate: string | null;
  socialMedia: Record<string, string | null> | null;
  profilePicture: string | null;
  organizationType: { name: string } | null;
  primaryContact: {
    firstName: string | null;
    preferredFirstName: string | null;
    lastName: string | null;
  } | null;
  contactInfo: {
    phoneNumber: string | null;
    street1: string | null;
    street2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  }[];
  categories: RawCategory[];
};

export type RawEventSearch = {
  id: string;
  organizationId: number;
  organizationName: string;
  name: string;
  description: string | null;
  location: string | null;
  startsOn: string;
  endsOn: string;
  imagePath: string | null;
  theme: EventTheme;
  categoryNames: string[];
  benefitNames: Event['benefits'];
  rsvpTotal: number;
};

export type RawEvent = {
  id: number;
  organizationId: number;
  organizationIds: number[];
  imagePath: string | null;
  imageUrl: string | null;
  name: string;
  description: string | null;
  startsOn: string;
  endsOn: string;
  address: {
    name: string | null;
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    latitude: number | null;
    longitude: number | null;
    onlineLocation: string | null;
    instructions: string | null;
    provider: string | null;
  } | null;
  theme: EventTheme;
  benefits: BenefitCode[];
  categories: RawCategory[];
  visibility: string;
  rsvpSettings: {
    isInviteOnly: boolean;
    totalAllowed: number | null;
    totalRsvps: number;
    spotsAvailable: number | null;
  } | null;
};

export type RawArticle = {
  id: number;
  organizationId: number;
  organization: { id: number; name: string; websiteKey: string | null } | null;
  author: { firstName: string | null; lastName: string | null } | null;
  image: { fullUrl: string | null } | null;
  title: string;
  createdOn: string;
  updatedOn: string;
  summary: string | null;
  story: string | null;
};

export type RawServiceOpportunity = {
  Id: string;
  Title: string;
  Description: string | null;
  ImageUrl: string | null;
  DetailsUrl: string | null;
  SponsorName: string | null;
  StartsOn: string | null;
  EndsOn: string | null;
  Type: string | null;
  Causes: string[];
  Skills: string[];
};

function imageUrl(path: string | null | undefined): string | null {
  const name = trimmed(path);
  return name === null ? null : `${IMAGE_ROOT}${name}`;
}

export function toCategory({ id, name }: RawCategory): Category {
  return { id, name };
}

export function toOrganizationSummary(raw: RawOrganizationSearch): OrganizationSummary {
  return {
    id: Number(raw.Id),
    name: raw.Name,
    short_name: trimmed(raw.ShortName),
    website_key: raw.WebsiteKey,
    url: `${SITE}/organization/${raw.WebsiteKey}`,
    summary: trimmed(raw.Summary),
    description: htmlToTextOrNull(raw.Description),
    category_ids: raw.CategoryIds.map(Number),
    categories: raw.CategoryNames,
    status: raw.Status,
    image_url: imageUrl(raw.ProfilePicture),
  };
}

export function toOrganization(raw: RawOrganization): Organization {
  const social = raw.socialMedia ?? {};
  const contact = raw.contactInfo[0];
  const address = lines([
    contact?.street1,
    contact?.street2,
    contact?.city,
    contact?.state,
    contact?.zip,
  ]).join(', ');
  return {
    id: raw.id,
    name: raw.name,
    short_name: trimmed(raw.shortName),
    website_key: raw.websiteKey,
    url: `${SITE}/organization/${raw.websiteKey}`,
    summary: trimmed(raw.summary),
    description: htmlToTextOrNull(raw.description),
    category_ids: raw.categories.map((category) => category.id),
    categories: raw.categories.map((category) => category.name),
    status: raw.status,
    image_url: imageUrl(raw.profilePicture),
    email: trimmed(raw.email),
    type: trimmed(raw.organizationType?.name),
    started: trimmed(raw.startDate),
    primary_contact: joinWords(
      raw.primaryContact?.preferredFirstName ?? raw.primaryContact?.firstName,
      raw.primaryContact?.lastName,
    ),
    social_media: {
      website: trimmed(social['ExternalWebsite']),
      facebook: trimmed(social['FacebookUrl']),
      instagram: trimmed(social['InstagramUrl']),
      twitter: trimmed(social['TwitterUrl']),
      linkedin: trimmed(social['LinkedInUrl']),
      youtube: trimmed(social['YoutubeUrl']),
    },
    phone: trimmed(contact?.phoneNumber),
    address: address === '' ? null : address,
  };
}

export function toEventSummary(raw: RawEventSearch): EventSummary {
  return {
    id: Number(raw.id),
    name: raw.name,
    description: htmlToTextOrNull(raw.description),
    location: trimmed(raw.location),
    starts_on: raw.startsOn,
    ends_on: raw.endsOn,
    organization: { id: raw.organizationId, name: raw.organizationName },
    theme: raw.theme,
    categories: raw.categoryNames,
    benefits: raw.benefitNames,
    rsvp_total: raw.rsvpTotal,
    image_url: imageUrl(raw.imagePath),
    url: `${SITE}/event/${raw.id}`,
  };
}

export function toEvent(raw: RawEvent, organizationName: string): Event {
  const address = raw.address;
  const rsvp = raw.rsvpSettings;
  return {
    id: raw.id,
    name: raw.name,
    description: htmlToTextOrNull(raw.description),
    starts_on: raw.startsOn,
    ends_on: raw.endsOn,
    organization: { id: raw.organizationId, name: organizationName },
    theme: raw.theme,
    categories: raw.categories.map((category) => category.name),
    benefits: raw.benefits.map((code) => decode(EVENT_BENEFITS, code, 'event benefit')),
    rsvp_total: rsvp?.totalRsvps ?? 0,
    image_url: trimmed(raw.imageUrl) ?? imageUrl(raw.imagePath),
    url: `${SITE}/event/${raw.id}`,
    address: {
      name: trimmed(address?.name),
      street: lines([address?.line1, address?.line2]),
      city: trimmed(address?.city),
      state: trimmed(address?.state),
      zip: trimmed(address?.zip),
      latitude: address?.latitude ?? null,
      longitude: address?.longitude ?? null,
      online_location: trimmed(address?.onlineLocation),
      instructions: trimmed(address?.instructions),
      provider: trimmed(address?.provider),
    },
    co_hosts: raw.organizationIds,
    rsvp: {
      total: rsvp?.totalRsvps ?? 0,
      total_allowed: rsvp?.totalAllowed ?? null,
      spots_available: rsvp?.spotsAvailable ?? null,
      invite_only: rsvp?.isInviteOnly ?? false,
    },
    visibility: raw.visibility,
  };
}

export function toArticleSummary(raw: RawArticle): ArticleSummary {
  return {
    id: raw.id,
    title: raw.title,
    summary: trimmed(raw.summary),
    published: raw.createdOn,
    updated: raw.updatedOn,
    organization: {
      id: raw.organization?.id ?? raw.organizationId,
      name: raw.organization?.name ?? '',
      website_key: trimmed(raw.organization?.websiteKey),
    },
    author: joinWords(raw.author?.firstName, raw.author?.lastName),
    image_url: trimmed(raw.image?.fullUrl),
    url: `${SITE}/news/${raw.id}`,
  };
}

export function toArticle(raw: RawArticle): Article {
  return { ...toArticleSummary(raw), body: htmlToTextOrNull(raw.story) };
}

export function toServiceOpportunity(raw: RawServiceOpportunity): ServiceOpportunity {
  return {
    id: Number(raw.Id),
    title: raw.Title,
    description: htmlToTextOrNull(raw.Description),
    sponsor: trimmed(raw.SponsorName),
    starts_on: trimmed(raw.StartsOn),
    ends_on: trimmed(raw.EndsOn),
    type: trimmed(raw.Type),
    causes: raw.Causes,
    skills: raw.Skills,
    image_url: trimmed(raw.ImageUrl),
    url: trimmed(raw.DetailsUrl),
  };
}
