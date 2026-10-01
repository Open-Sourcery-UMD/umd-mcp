import { stringify } from 'qs';

/**
 * The columns of the "My Links" table in the order the page declares them. The server
 * (ajax-datatables-rails) finds the sort column by position and only searches the columns a
 * request lists, so requests mirror the page's list exactly.
 */
const LINK_COLUMNS = [
  '0',
  'group_id',
  'url',
  'keyword',
  'group_name',
  'total_clicks',
  'created_at',
  'actions',
] as const;

type LinkColumn = (typeof LINK_COLUMNS)[number];

const UNSEARCHABLE: ReadonlySet<LinkColumn> = new Set(['0', 'actions']);

const UNORDERABLE: ReadonlySet<LinkColumn> = new Set(['0', 'group_id', 'url', 'actions']);

export type LinkQuery = {
  /** Substring to look for in keywords, destinations and collection names. */
  search?: string | undefined;
  /** Regular expressions (MySQL syntax) a column must match, keyed by column. */
  match?: Partial<Record<'group_id' | 'keyword', string>> | undefined;
  /** Position of the column to sort by. */
  sort: number;
  order: 'asc' | 'desc';
  start: number;
  length: number;
};

/** The query string DataTables sends for one page of the "My Links" table. */
export function linkTableQuery({ search, match = {}, sort, order, start, length }: LinkQuery) {
  const columns = LINK_COLUMNS.map((data) => {
    const regex = data === 'group_id' || data === 'keyword' ? match[data] : undefined;
    return {
      data,
      searchable: !UNSEARCHABLE.has(data),
      orderable: !UNORDERABLE.has(data),
      search: { value: regex ?? '', regex: regex !== undefined },
    };
  });
  return stringify(
    {
      draw: 1,
      columns,
      order: [{ column: sort, dir: order }],
      start,
      length,
      search: { value: search ?? '', regex: false },
    },
    { arrayFormat: 'indices', encodeValuesOnly: true },
  );
}
